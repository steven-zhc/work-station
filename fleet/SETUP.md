# fleet · 三台机器的配置

软件已经由 ansible 装好（见 `README.md`）。这份只讲**配置**：网络、harbor 运行时、备份。

不在这里的：应用发布（GHCR / release workflow / runner）、GitHub issue/PR 流程。

foundry 上的开发任务由 **lingtai** 平台负责（不再使用 loop.sh），它的部署和配置按 lingtai 自己的文档来。这份文档只把 foundry 准备成一台能长期插电稳定运行的机器（第 1、4 节）。

## 约定

每条命令前的标记表示在哪台机器上执行：

- `[studio]` Mac mini M4 · `[foundry]` MacBook Pro 15 (Intel) · `[harbor]` ThinkPad T450 / Mint 22.2 · `[后台]` 浏览器

**所有命令都是 fish 语法** —— 三台的默认 shell 都被 ansible 设成了 fish。写进文件里的那几个脚本（`pg-dump.sh`、`daily.sh`、`backup-studio.sh`）本身仍然是 bash：它们靠第一行的 `#!/usr/bin/env bash` 执行，跟你在什么 shell 里敲命令无关。

几个和 bash 不同、这份文档里会用到的地方：`set 变量 值` 是赋值，`set -e 变量` 是**删除**变量（不是 bash 的 `set -e`），`(命令)` 是命令替换，循环以 `end` 结尾。

顺序是有意义的 —— 后一步依赖前一步：

| # | 机器 | 内容 | 预计 |
| --- | --- | --- | --- |
| 1 | 三台 | 主机名 + Tailscale + 互相 SSH | 30 分钟 |
| 2 | harbor | 合盖不休眠 + 目录 | 10 分钟 |
| 3 | harbor | 基础服务栈：Postgres / n8n / Uptime Kuma / Dozzle | 20 分钟 |
| 4 | foundry | 电源与散热 | 10 分钟 |
| 5 | harbor + studio | restic 备份 + 恢复演练 | 30 分钟 |

**密钥**：这份文档里生成的密码统一存进 studio 的 Keychain，用仓库里的 `script/mysec.mjs`（见根 README 的 Secrets 一节）。不要写进任何入库的文件。

---

## 1. 网络（三台）

### 1.1 主机名

```fish
# [studio]（foundry 同理，把 studio 换成 foundry）
sudo scutil --set HostName studio
sudo scutil --set LocalHostName studio
sudo scutil --set ComputerName studio

# [harbor]
sudo hostnamectl set-hostname harbor
```

### 1.2 登录 Tailscale

```fish
# [studio] [foundry]
open -a Tailscale        # 登录同一账号；偏好设置里勾上 Run on login（foundry 必须勾）

# [harbor]
sudo tailscale up --hostname=harbor --ssh
```

`--ssh` 打开 Tailscale SSH，之后从 studio `ssh harbor` 不用管密钥。

手机也装 Tailscale 登录同一账号。

### 1.3 打开 MagicDNS

`[后台]` https://login.tailscale.com/admin/dns → 打开 **MagicDNS**。

之后每台机器就是一个名字：`harbor`、`foundry`、`studio`。注意 MagicDNS **一个节点只有一个名字** —— `admin.harbor.xxx.ts.net` 这种二级域名不会解析，多个服务靠端口区分（见第 3 节）。

顺手在 **Machines** 页面对 harbor 和 foundry 点 **Disable key expiry**，不然 180 天后节点密钥过期，机器会突然掉线。

### 1.4 能从 studio SSH 到另外两台

`[foundry]` macOS 上 Tailscale 的 GUI 版不能当 SSH 服务端，用系统自带的：**系统设置 → 通用 → 共享 → 远程登录**，打开，只允许你自己的账号。

`[studio]` 验证：

```fish
for h in harbor foundry
    printf '== %s: ' $h
    ssh -o ConnectTimeout=5 $h hostname
end
```

**手机断开 Wi-Fi、只用蜂窝网络**，确认也能访问 `harbor` —— 这一步通了，出门在外也就通了。

**完成标准**：三台 + 手机在 `tailscale status` 里都在线；studio 能 `ssh harbor`、`ssh foundry`。

---

## 2. harbor 主机

### 2.1 合盖不休眠

两处都要改，只改 logind 的话 Cinnamon 桌面会照样让它睡：

```fish
# [harbor]
for k in HandleLidSwitch HandleLidSwitchExternalPower HandleLidSwitchDocked
    sudo sed -i "s/^#\?$k=.*/$k=ignore/" /etc/systemd/logind.conf
    grep -q "^$k=" /etc/systemd/logind.conf
    or echo "$k=ignore" | sudo tee -a /etc/systemd/logind.conf >/dev/null
end
sudo systemctl restart systemd-logind

gsettings set org.cinnamon.settings-daemon.plugins.power lid-close-ac-action 'nothing'
gsettings set org.cinnamon.settings-daemon.plugins.power lid-close-battery-action 'nothing'
gsettings set org.cinnamon.settings-daemon.plugins.power sleep-inactive-ac-type 'nothing'
```

验证：合上盖子等 2 分钟，从 studio `ssh harbor uptime` 仍然通。

### 2.2 目录

```fish
# [harbor]
sudo mkdir -p /srv/stacks /srv/data /srv/backup
sudo chown $USER:$USER /srv/stacks /srv/data /srv/backup    # 只改顶层
```

> **不要 `chown -R /srv/data`**。后面 `/srv/data/postgres` 会属于容器里的 postgres 用户，递归改属主之后 Postgres 起不来（`data directory has wrong ownership`）。以后任何时候都别对它递归 chown。

**完成标准**：合上盖子 2 分钟后仍能 `ssh harbor`；`/srv/{stacks,data,backup}` 已建好。

---

## 3. harbor 基础服务栈

| 服务 | 地址 | 用途 |
| --- | --- | --- |
| Postgres | `harbor:5432` | 开发数据库（studio 连这个，本机不装） |
| n8n | `http://harbor:5678` | 工作流 |
| Uptime Kuma | `http://harbor:3001` | 存活监控 + 推送告警 |
| Dozzle | `http://harbor:8080` | 容器日志 |

端口绑在 `0.0.0.0`：家里局域网和 tailnet 都能访问。公网访问不到 —— 前提是路由器上**没有做端口转发、UPnP 关着**。

注意两条路不一样：走 tailnet（`http://harbor:3001`）流量是 WireGuard 加密的；走局域网 IP 是 http 明文。

### 3.1 compose 文件

compose.yaml 是仓库里的真文件，`fleet/stacks/base/compose.yaml`，不再靠复制粘贴生成。
harbor 上放一份仓库检出，`/srv/stacks/base/compose.yaml` 只是个指回去的符号链接 ——
以后这份文件改了，`git pull` 之后原地就是最新的，不用重新粘贴。

**第一次**，harbor 上还没有这个仓库的话，先克隆（跟 `README.md` 里「Git Setup with
SSH Key」一样，用你自己的 SSH key；`git` 已经在 `linux-local.yml` 里装过了）：

```fish
# [harbor]
mkdir -p ~/workspace
git clone git@github.com:steven-zhc/work-station.git ~/workspace/work-station
```

然后建符号链接：

```fish
# [harbor]
mkdir -p /srv/stacks/base
ln -sf ~/workspace/work-station/fleet/stacks/base/compose.yaml /srv/stacks/base/compose.yaml
```

**以后要更新**，在 harbor 上：

```fish
# [harbor]
cd ~/workspace/work-station && git pull
cd /srv/stacks/base && docker compose config >/dev/null && echo "compose 配置 OK"
docker compose up -d      # 应用改动，会按需重建容器
```

`.env` 不在仓库里，永远只存在于 `/srv/stacks/base/.env`（見 3.3），`git pull` 不会碰它。

这个文件里有三处是故意的（文件自己也有对应的注释）：

- **端口绑 `0.0.0.0`**。局域网和 tailnet 都能访问。以后想收紧某个服务，只能改这里的绑定（比如写成 `"<Tailscale IP>:5432:5432"` 只让 tailnet 访问）—— Docker 会绕过 UFW 自己插 iptables 规则，`ufw deny` 挡不住。
- **`N8N_SECURE_COOKIE: "false"`**。走 http 时不关掉这个，n8n 登录不进去。
- **Dozzle 开认证**。它挂着 `docker.sock`，能读所有容器的日志 —— 包括 Postgres 启动时打印的密码。
- **Postgres 18 的挂载点是 `/var/lib/postgresql`，不是 `/data`**。18 的官方镜像把数据目录改成了 `/var/lib/postgresql/18/docker`（按大版本分目录，为以后 `pg_upgrade` 铺路）。照老习惯挂到 `/var/lib/postgresql/data`，容器会直接拒绝启动。
- **`PG_ADMIN_USER` 只是集群管理员**，不对应任何一个项目的库 —— 应用库在 3.5 节单独建。

**版本**：都是写这份文档时（2026-09）的最新稳定版。

| 服务 | tag | 说明 |
| --- | --- | --- |
| Postgres | `18-alpine` | 19 还在 beta。跟着 18.x 小版本自动更新；**大版本升级不能只改 tag**，要 dump/restore |
| n8n | `2.40.5` | n8n 没有 `2` 这种大版本 tag。v3 已经在 rc，用 `latest` 的话哪天 pull 就会跳到 v3、带着破坏性改动，所以钉死具体版本，升级时手动改 |
| Uptime Kuma | `2` | 跟着 2.x 自动更新 |
| Dozzle | `v11` | 跟着 v11.x 自动更新 |

升级：在仓库里改 `fleet/stacks/base/compose.yaml` 的 tag（n8n）或不用改（其余，本来就没钉版本号），提交、`git push`，然后在 harbor 上 `git pull` + `docker compose pull && docker compose up -d`。

n8n 2.x 默认**禁用了 Execute Command 节点**，Code 节点也跑在隔离的 task runner 里。考虑到服务开在局域网上，这正是我们想要的，别特意打开。

### 3.2 数据目录

```fish
# [harbor]
mkdir -p /srv/data/{postgres,n8n,uptime-kuma,dozzle}
sudo chown 1000:1000 /srv/data/n8n     # n8n 容器以 uid 1000 运行，属主不对会 EACCES
```

### 3.3 密码

密码放在 `.env`（compose 会自动读它），只生成一次。先 `touch` + `chmod 600` 建好空文件再写内容，这样密码写进去的那一刻文件就已经只有你能读：

```fish
# [harbor]
cd /srv/stacks/base
set PG_ADMIN_PASSWORD (openssl rand -base64 24 | tr -d '/+=')
touch .env && chmod 600 .env
printf 'PG_ADMIN_USER=pgadmin\nPG_ADMIN_PASSWORD=%s\n' $PG_ADMIN_PASSWORD > .env
set -e PG_ADMIN_PASSWORD

# Dozzle 账号：用 Dozzle 自己的生成器，哈希格式由它决定
set DZ_PASSWORD (openssl rand -base64 18 | tr -d '/+=')
# fish 里空变量不加引号会整个消失，--password 就吃到了下一个参数 → "missing value for --password"。
# 所以：变量一律加引号，并且先确认它不是空的。
if test -z "$DZ_PASSWORD"
    echo "DZ_PASSWORD 是空的，重新执行上面的 set"
else
    # 明文也存一份进 .env（已是 600），下一步直接从这里管道进 Keychain，不经过屏幕。
    # 先删掉旧的 DZ_PASSWORD 行，重复执行不会叠加；PG_* 那几行不动。
    sed -i '/^DZ_PASSWORD=/d' .env
    printf 'DZ_PASSWORD=%s\n' "$DZ_PASSWORD" >> .env
    # 先写到 .new，确认不是空文件再替换。docker run 失败的话（比如 docker context 不对），
    # 直接重定向会留下一个 0 字节的 users.yml，Dozzle 启动时报 EOF 然后一直重启。
    touch /srv/data/dozzle/users.yml.new; and chmod 600 /srv/data/dozzle/users.yml.new
    docker run --rm amir20/dozzle:v11 generate --password "$DZ_PASSWORD" \
        --name admin --email admin@harbor.local admin > /srv/data/dozzle/users.yml.new
    and test -s /srv/data/dozzle/users.yml.new
    and mv /srv/data/dozzle/users.yml.new /srv/data/dozzle/users.yml
    or echo "生成失败，先确认 docker ps 能用"
end
set -e DZ_PASSWORD
```

存进 studio 的 Keychain。管理员账号密码和 Dozzle 密码都直接从 harbor 的 `.env` 管道过来，不经过屏幕：

```fish
# [studio]  在 work-station 仓库根目录
ssh harbor "grep '^PG_ADMIN_USER=' /srv/stacks/base/.env | cut -d= -f2-" \
    | tr -d '\n' | ./script/mysec.mjs postgres harbor-admin PG_ADMIN_USER -
ssh harbor "grep '^PG_ADMIN_PASSWORD=' /srv/stacks/base/.env | cut -d= -f2-" \
    | tr -d '\n' | ./script/mysec.mjs postgres harbor-admin PG_ADMIN_PASSWORD -

ssh harbor "grep '^DZ_PASSWORD=' /srv/stacks/base/.env | cut -d= -f2-" \
    | tr -d '\n' | ./script/mysec.mjs dozzle harbor DOZZLE_PASSWORD -
```

**`/srv/data/postgres` 里已经有别的版本（比如 16）的数据**：18 会拒绝启动 —— 数据文件不跨大版本兼容。这台机器上的开发库不需要保留，直接清空，让 18 重新初始化：

```fish
# [harbor]
cd /srv/stacks/base
docker compose stop postgres; and docker compose rm -f postgres
sudo rm -rf /srv/data/postgres        # 永久删除旧数据
mkdir /srv/data/postgres
```

管理员账号来自 `.env`，重新初始化后和原来一样；但应用库（3.5 节）是新卷里没有的，清空重来之后要重新跑一遍 3.5 节的建库步骤。

### 3.4 启动

```fish
# [harbor]
cd /srv/stacks/base
docker compose config >/dev/null && echo "compose 配置 OK"
docker compose up -d
docker compose ps
```

### 3.5 建应用库

一个 Postgres 实例装多个项目的库：每个项目一个角色 + 一个同名的库，角色只能连自己的
库，互相看不见。库名可以带连字符（下面直接用项目名），只是 SQL 里引用时要加双引号。

`newdb` 是个小 fish 函数，建一对角色 + 库、生成密码、打印出来。**密码先不进 Keychain**
——这块以后有单独的方案，现在只是打印在屏幕上，自己记下来（比如先抄进对应项目的
`.env`）：

```fish
# [harbor]
cd /srv/stacks/base
# fish 不认识 bash 的 KEY=VALUE 语法，不能直接 `source .env`，逐行拆成 fish 变量：
for l in (cat .env)
    set -gx (string split -m1 = $l)
end
set cid (docker compose ps -q postgres)

function newdb --argument-names name
    set pw (openssl rand -base64 24 | tr -d '/+=')
    docker exec $cid psql -U $PG_ADMIN_USER -d postgres -v ON_ERROR_STOP=1 -c \
        "CREATE ROLE \"$name\" LOGIN PASSWORD '$pw'; CREATE DATABASE \"$name\" OWNER \"$name\";"
    echo "$name 密码：$pw"      # 记下来 —— 这一步不存 Keychain，也不写文件
    set -e pw
end

newdb nextloom-ai-dev
newdb lingtai-my
```

直接在 harbor 上跑就行，不用像 3.3 节那样非得在 studio 上执行 —— 密码只是打印，没有
管道去 Keychain，所以哪台机器跑都一样。

以后再加一个项目库，重复一次 `newdb <项目名>` 就行；`/srv/data/postgres` 被清空重建后
（见上一节），这里也要重新跑一遍，角色和库不会跟着卷一起消失，是因为卷本来就没了。

### 3.6 验证服务在监听

```fish
# [harbor]
ss -tlnH | grep -E ':(5432|5678|3001|8080)\b'     # 应该都是 0.0.0.0:端口
ip -4 addr show | grep 'inet 192.168'                # harbor 的局域网 IP
```

局域网里的设备用 `http://<harbor 局域网 IP>:3001` 访问。IP 最好在路由器里给 harbor 做一个 **DHCP 固定分配**，不然哪天变了书签就失效了。

顺手确认路由器上**没有**把这几个端口转发到公网、UPnP 是关的。

从 studio 访问：

```fish
# [studio]
curl -sI http://harbor:3001 | head -1      # Uptime Kuma
curl -sI http://harbor:8080 | head -1      # Dozzle（会跳登录页）
curl -sI http://harbor:5678 | head -1      # n8n
nc -z -G 3 harbor 5432 && echo "Postgres 端口通"
```

然后浏览器打开 `http://harbor:3001`。Uptime Kuma 2 首次启动会先让你选数据库：选 **SQLite** 就行（数据就在 `/srv/data/uptime-kuma` 里，跟着第 5 节的备份走）；接着建管理员账号，在 Settings → Notifications 里配一个推送渠道（Telegram / Bark / ntfy 任选），后面备份失败和服务掉线都靠它通知你。

### 3.7 项目改用 harbor 上的数据库

每个项目连自己的库，用户名等于库名（3.5 节的 `newdb` 建的）：

```
postgresql://nextloom-ai-dev:<密码>@harbor:5432/nextloom-ai-dev
postgresql://lingtai-my:<密码>@harbor:5432/lingtai-my
```

密码是 3.5 节 `newdb` 打印出来的那个，还没进 Keychain，先按你自己的方式存（比如
直接放进对应项目的 `.env`）—— 等有了密码管理方案再回来补 `rw-mysec.mjs` 这一步。

**完成标准**：四个服务 `docker compose ps` 都是 running；局域网和 tailnet 都能打开 Uptime Kuma；路由器没有做端口转发。

---

## 4. foundry 电源与散热

lingtai 跑在这台上，所以它要长期插电、不休眠、不过热。三件事：

```fish
# [foundry] 接电源时永不休眠（屏幕 10 分钟后熄灭）
sudo pmset -c sleep 0 disksleep 0 displaysleep 10 womp 1
pmset -g custom | sed -n '/AC Power/,/^$/p'      # sleep 应该是 0
```

**充电上限 80%**（2018 款长期插电不管理，电池会鼓包）。二选一：

- 打开 AlDente，拖到 80%，勾开机启动
- 或者 `sudo bclm write 80 && sudo bclm persist`

**散热**：开盖运行或垫高，别合盖塞抽屉。这台满载会重度降频。自查：

```fish
sudo powermetrics --samplers smc -n 1 | grep -i temp    # 持续 95°C 以上就是在降频
```

**完成标准**：`pmset` 显示 AC 下 `sleep 0`；充电上限已设。

---

## 5. 备份

两个 restic 仓库，**故意分开**：

| 仓库 | 谁写 | 以什么身份 | 内容 |
| --- | --- | --- | --- |
| `harbor:/srv/backup/harbor` | harbor 的定时器 | root | harbor 的服务数据 + Postgres dump |
| `harbor:/srv/backup/studio` | studio 经 sftp | 你的用户 | studio 的工作目录 |

合成一个的话，root 写出来的 index 是 `0600 root:root`，studio 那边从第二天起就全是 permission denied —— 而且只写进日志，没人看。

foundry 不在这里备份：lingtai 的状态怎么保存、要不要备份，以 lingtai 自己的方案为准。

### 5.1 harbor 自己的备份

**密码文件**只给 root 读：

```fish
# [harbor]
set RESTIC_PW (openssl rand -base64 24 | tr -d '/+=')
echo "harbor restic 密码：$RESTIC_PW"      # 立刻存进 Keychain，丢了备份就永远打不开
printf 'RESTIC_REPOSITORY=/srv/backup/harbor\nRESTIC_PASSWORD=%s\n' $RESTIC_PW \
    | sudo install -D -m 600 -o root -g root /dev/stdin /etc/fleet/restic.env
set -e RESTIC_PW

sudo mkdir -p /srv/backup/harbor
sudo sh -c 'set -a; . /etc/fleet/restic.env; set +a; restic init'
```

```fish
# [studio]
echo -n '<harbor restic 密码>' | ./script/mysec.mjs restic harbor RESTIC_PASSWORD -
```

**备份脚本放在 root 拥有的目录**。脚本内容是 bash，只是用 fish 把它写进文件：

```fish
# [harbor]
sudo install -d -m 755 -o root -g root /usr/local/lib/fleet

echo '#!/usr/bin/env bash
set -euo pipefail
set -a; . /srv/stacks/base/.env; set +a
OUT=/srv/backup/pg
mkdir -p "$OUT"
cid="$(docker compose -f /srv/stacks/base/compose.yaml ps -q postgres)"

# 备份每一个应用库（3.5 节 newdb 建的），跳过 postgres 自带的库和管理员自己的默认库。
# 新加一个库不用改这个脚本 —— 它跟着 pg_database 走。
for db in $(docker exec "$cid" psql -U "$PG_ADMIN_USER" -d postgres -tAc \
    "select datname from pg_database where datistemplate=false and datname not in (\'postgres\', \'$PG_ADMIN_USER\')"); do
  docker exec "$cid" pg_dump -U "$PG_ADMIN_USER" -d "$db" | gzip > "$OUT/${db}-$(date +%F).sql.gz"
done
find "$OUT" -name "*.sql.gz" -mtime +7 -delete' | sudo tee /usr/local/lib/fleet/pg-dump.sh >/dev/null

echo '#!/usr/bin/env bash
set -euo pipefail
set -a; . /etc/fleet/restic.env; set +a

/usr/local/lib/fleet/pg-dump.sh

# 不拷运行中的 PGDATA：那不是一份可用的备份，上面的 pg_dump 才是。
# 也不备份 studio 的仓库，免得把别人的备份再备份一遍。
restic backup /srv/data /srv/backup/pg /srv/stacks \
  --exclude /srv/data/postgres \
  --exclude /srv/backup/studio \
  --exclude "**/*.sock"

restic forget --keep-daily 30 --keep-weekly 12 --keep-monthly 6 --prune' | sudo tee /usr/local/lib/fleet/daily.sh >/dev/null

sudo chmod 755 /usr/local/lib/fleet/pg-dump.sh /usr/local/lib/fleet/daily.sh
sudo chown root:root /usr/local/lib/fleet/pg-dump.sh /usr/local/lib/fleet/daily.sh
```

> **为什么不能放在 `/srv/backup/` 下**：那个目录属于你的普通用户，而下面的定时器以 root 身份执行这些脚本。任何以你的用户身份运行的东西，都能往脚本里追加一行，然后在凌晨 3:30 以 root 身份执行。

**定时器**：

```fish
# [harbor]
echo '[Unit]
Description=Fleet daily backup

[Service]
Type=oneshot
ExecStart=/usr/local/lib/fleet/daily.sh
NoNewPrivileges=true' | sudo tee /etc/systemd/system/fleet-backup.service >/dev/null

echo '[Unit]
Description=Fleet daily backup timer

[Timer]
OnCalendar=*-*-* 03:30:00
Persistent=true

[Install]
WantedBy=timers.target' | sudo tee /etc/systemd/system/fleet-backup.timer >/dev/null

sudo systemctl daemon-reload
sudo systemctl enable --now fleet-backup.timer
systemctl list-timers fleet-backup.timer
```

### 5.2 恢复演练（不要跳过）

没验证过的备份等于没有备份。仓库是 root 的，演练也用 root：

```fish
# [harbor]
sudo systemctl start fleet-backup.service
journalctl -u fleet-backup.service -n 30 --no-pager

sudo sh -c 'set -a; . /etc/fleet/restic.env; set +a
  restic snapshots
  rm -rf /tmp/restore-test
  restic restore latest --target /tmp/restore-test --include /srv/data/n8n
  ls -la /tmp/restore-test/srv/data/n8n
  restic check --read-data-subset=5%
  rm -rf /tmp/restore-test'

ls -la /srv/backup/pg/        # 应该有今天的 .sql.gz
```

### 5.3 studio 的备份

给 studio 的仓库一个你自己能写的目录：

```fish
# [harbor]
mkdir -p /srv/backup/studio
```

studio 这边用它自己的密码：

```fish
# [studio]
touch ~/.restic-pass && chmod 600 ~/.restic-pass
openssl rand -base64 24 | tr -d '/+=\n' > ~/.restic-pass
cat ~/.restic-pass | ./script/mysec.mjs restic studio RESTIC_PASSWORD -

# 记录 harbor 的主机密钥 —— launchd 是非交互的，没有这一步每晚都会死在
# "Host key verification failed"
ssh -o StrictHostKeyChecking=accept-new harbor true

set -x RESTIC_PASSWORD_FILE ~/.restic-pass
restic -r sftp:harbor:/srv/backup/studio init
```

`~/.restic-excludes`：

```fish
# [studio]
echo 'node_modules
.next
dist
build
out
.turbo
.venv
target
.cache
*.log
.DS_Store' > ~/.restic-excludes
```

备份脚本（内容是 bash）：

```fish
# [studio]
mkdir -p ~/bin ~/Library/Logs/fleet
echo '#!/usr/bin/env bash
set -euo pipefail
export RESTIC_PASSWORD_FILE="$HOME/.restic-pass"
REPO="sftp:harbor:/srv/backup/studio"

restic -r "$REPO" backup "$HOME/workspace" --exclude-file "$HOME/.restic-excludes" --tag studio
restic -r "$REPO" forget --tag studio --keep-daily 30 --keep-weekly 12 --prune
echo "$(date "+%F %T") ok"' > ~/bin/backup-studio.sh
chmod +x ~/bin/backup-studio.sh
~/bin/backup-studio.sh          # 先手动跑一次
```

每天 02:30 自动跑（和 harbor 的 03:30 错开，两边 prune 不抢锁）。plist 里要填你的 home 路径，先写 `__HOME__` 占位，再用 `string replace` 换掉：

```fish
# [studio]
echo '<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>ai.nextloom.backup-studio</string>
  <key>ProgramArguments</key><array><string>__HOME__/bin/backup-studio.sh</string></array>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>2</integer><key>Minute</key><integer>30</integer></dict>
  <key>StandardOutPath</key><string>__HOME__/Library/Logs/fleet/backup.out.log</string>
  <key>StandardErrorPath</key><string>__HOME__/Library/Logs/fleet/backup.err.log</string>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string></dict>
</dict>
</plist>' | string replace -a __HOME__ $HOME > ~/Library/LaunchAgents/ai.nextloom.backup-studio.plist

launchctl bootstrap gui/(id -u) ~/Library/LaunchAgents/ai.nextloom.backup-studio.plist
launchctl print gui/(id -u)/ai.nextloom.backup-studio | head -5
```

**完成标准**：harbor 的定时器在排队、恢复演练通过、`/srv/backup/pg` 有今天的 dump；studio 手动跑过一次成功、launchd 任务已注册；三个 restic 密码都在 Keychain 里。

---

## 全部做完后的体检

```fish
# [studio]
tailscale status
for h in harbor foundry
    ssh -o ConnectTimeout=5 $h hostname
end
curl -sI http://harbor:3001 | head -1
./script/mysec.mjs restic harbor RESTIC_PASSWORD >/dev/null && echo "harbor restic 密码在 Keychain"
./script/mysec.mjs restic studio RESTIC_PASSWORD >/dev/null && echo "studio restic 密码在 Keychain"

# [harbor]
docker compose -f /srv/stacks/base/compose.yaml ps
ss -tlnH | grep -E ':(5432|5678|3001|8080)\b'          # 都是 0.0.0.0:端口
systemctl list-timers fleet-backup.timer
sudo stat -c '%U %a %n' /usr/local/lib/fleet/pg-dump.sh /usr/local/lib/fleet/daily.sh /etc/fleet/restic.env   # 都是 root，755 / 600

# [foundry]
pmset -g custom | grep -A3 'AC Power'
```

## 日常运维

| 场景 | 命令 |
| --- | --- |
| 看服务状态 | `[harbor]` `docker compose -f /srv/stacks/base/compose.yaml ps` |
| 看日志 | 浏览器 `http://harbor:8080` |
| 重启某个服务 | `[harbor]` `cd /srv/stacks/base && docker compose restart n8n` |
| 手动备份一次 | `[harbor]` `sudo systemctl start fleet-backup.service` · `[studio]` `~/bin/backup-studio.sh` |
| 看备份日志 | `[harbor]` `journalctl -u fleet-backup -n 50` · `[studio]` `tail ~/Library/Logs/fleet/backup.err.log` |
