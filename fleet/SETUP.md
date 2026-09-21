# fleet · 三台机器的配置

软件已经由 ansible 装好（见 `README.md`）。这份只讲**配置**：网络、harbor 运行时、备份。

不在这里的：应用发布（GHCR / release workflow / runner）、GitHub issue/PR 流程。

foundry 上的开发任务由 **lingtai** 平台负责（不再使用 loop.sh），它的部署和配置按 lingtai 自己的文档来。这份文档只把 foundry 准备成一台能长期插电稳定运行的机器（第 1、4 节）。

## 约定

每条命令前的标记表示在哪台机器上执行：

- `[studio]` Mac mini M4 · `[foundry]` MacBook Pro 15 (Intel) · `[harbor]` ThinkPad T450 / Mint 22.2 · `[后台]` 浏览器

顺序是有意义的 —— 后一步依赖前一步：

| # | 机器 | 内容 | 预计 |
| --- | --- | --- | --- |
| 1 | 三台 | 主机名 + Tailscale + 互相 SSH | 30 分钟 |
| 2 | harbor | 合盖不休眠 + 目录 + `TS_IP` | 10 分钟 |
| 3 | harbor | 基础服务栈：Postgres / n8n / Uptime Kuma / Dozzle | 20 分钟 |
| 4 | foundry | 电源与散热 | 10 分钟 |
| 5 | harbor + studio | restic 备份 + 恢复演练 | 30 分钟 |

**密钥**：这份文档里生成的密码统一存进 studio 的 Keychain，用仓库里的 `script/mysec.mjs`（见根 README 的 Secrets 一节）。不要写进任何入库的文件。

---

## 1. 网络（三台）

### 1.1 主机名

```bash
# [studio]（foundry 同理，把 studio 换成 foundry）
sudo scutil --set HostName studio
sudo scutil --set LocalHostName studio
sudo scutil --set ComputerName studio

# [harbor]
sudo hostnamectl set-hostname harbor
```

### 1.2 登录 Tailscale

```bash
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

### 1.4 能从 studio SSH 到另外两台

```bash
# [foundry] macOS 上 Tailscale SSH 服务端不可用（GUI 版不支持），用系统自带的：
#   系统设置 → 通用 → 共享 → 远程登录：打开，只允许你自己的账号
```

`[studio]` 验证：

```bash
for h in harbor foundry; do
  printf '== %s: ' "$h"; ssh -o ConnectTimeout=5 "$h" hostname
done
```

**手机断开 Wi-Fi、只用蜂窝网络**，确认也能访问 `harbor` —— 这一步通了，出门在外也就通了。

**完成标准**：三台 + 手机在 `tailscale status` 里都在线；studio 能 `ssh harbor`、`ssh foundry`。

---

## 2. harbor 主机

### 2.1 合盖不休眠

两处都要改，只改 logind 的话 Cinnamon 桌面会照样让它睡：

```bash
# [harbor]
for k in HandleLidSwitch HandleLidSwitchExternalPower HandleLidSwitchDocked; do
  sudo sed -i "s/^#\?${k}=.*/${k}=ignore/" /etc/systemd/logind.conf
  grep -q "^${k}=" /etc/systemd/logind.conf || echo "${k}=ignore" | sudo tee -a /etc/systemd/logind.conf >/dev/null
done
sudo systemctl restart systemd-logind

gsettings set org.cinnamon.settings-daemon.plugins.power lid-close-ac-action 'nothing'
gsettings set org.cinnamon.settings-daemon.plugins.power lid-close-battery-action 'nothing'
gsettings set org.cinnamon.settings-daemon.plugins.power sleep-inactive-ac-type 'nothing'
```

验证：合上盖子等 2 分钟，从 studio `ssh harbor uptime` 仍然通。

### 2.2 目录

```bash
# [harbor]
sudo mkdir -p /srv/stacks /srv/data /srv/backup
sudo chown "$USER:$USER" /srv/stacks /srv/data /srv/backup    # 只改顶层
```

> **不要 `chown -R /srv/data`**。后面 `/srv/data/postgres` 会属于容器里的 postgres 用户，递归改属主之后 Postgres 起不来（`data directory has wrong ownership`）。以后任何时候都别对它递归 chown。

### 2.3 Tailscale IP

所有服务的端口都只绑这个 IP：

```bash
# [harbor]
echo "TS_IP=$(tailscale ip -4)" > /srv/stacks/.env.shared
cat /srv/stacks/.env.shared       # 应该是 TS_IP=100.x.x.x
```

Tailscale 重新认证后 IP 可能变。变了就重跑这一行，再按 3.4 重新生成 `.env`。

**完成标准**：合盖不休眠；`/srv/stacks/.env.shared` 里有 `100.x.x.x`。

---

## 3. harbor 基础服务栈

| 服务 | 地址 | 用途 |
| --- | --- | --- |
| Postgres | `harbor:5432` | 开发数据库（studio 连这个，本机不装） |
| n8n | `http://harbor:5678` | 工作流 |
| Uptime Kuma | `http://harbor:3001` | 存活监控 + 推送告警 |
| Dozzle | `http://harbor:8080` | 容器日志 |

全部只在 tailnet 内可见，公网零暴露。tailnet 内流量本身是 WireGuard 加密的，所以先用 http。

### 3.1 compose 文件

```bash
# [harbor]
mkdir -p /srv/stacks/base && cd /srv/stacks/base
cat > compose.yaml <<'EOF'
name: base

services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${PG_USER}
      POSTGRES_PASSWORD: ${PG_PASSWORD}
      POSTGRES_DB: ${PG_DB}
    ports:
      - "${TS_IP:?TS_IP 未设置}:5432:5432"
    volumes:
      - /srv/data/postgres:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${PG_USER}"]
      interval: 30s
      timeout: 5s
      retries: 5
    logging: { driver: json-file, options: { max-size: "10m", max-file: "3" } }

  n8n:
    image: docker.n8n.io/n8nio/n8n:latest
    restart: unless-stopped
    environment:
      N8N_HOST: harbor
      N8N_PORT: "5678"
      N8N_PROTOCOL: http
      WEBHOOK_URL: http://harbor:5678/
      GENERIC_TIMEZONE: America/Chicago
      N8N_SECURE_COOKIE: "false"
    ports:
      - "${TS_IP:?TS_IP 未设置}:5678:5678"
    volumes:
      - /srv/data/n8n:/home/node/.n8n
    logging: { driver: json-file, options: { max-size: "10m", max-file: "3" } }

  uptime-kuma:
    image: louislam/uptime-kuma:1
    restart: unless-stopped
    ports:
      - "${TS_IP:?TS_IP 未设置}:3001:3001"
    volumes:
      - /srv/data/uptime-kuma:/app/data

  dozzle:
    image: amir20/dozzle:latest
    restart: unless-stopped
    environment:
      DOZZLE_AUTH_PROVIDER: simple
    ports:
      - "${TS_IP:?TS_IP 未设置}:8080:8080"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - /srv/data/dozzle:/data
EOF
```

这个文件里有三处是故意的：

- **`${TS_IP:?...}` 而不是 `${TS_IP}`**。变量为空时 Docker 会把 `""` 当成「所有接口」，服务静默地绑到 `0.0.0.0`、暴露在整个局域网上。`:?` 让它直接报错退出，fail closed。Docker 还会绕过 UFW 自己插 iptables 规则，所以不能指望防火墙兜底。
- **`N8N_SECURE_COOKIE: "false"`**。走 http 时不关掉这个，n8n 登录不进去。
- **Dozzle 开认证**。它挂着 `docker.sock`，能读所有容器的日志 —— 包括 Postgres 启动时打印的密码。

### 3.2 数据目录

```bash
# [harbor]
mkdir -p /srv/data/{postgres,n8n,uptime-kuma,dozzle}
sudo chown 1000:1000 /srv/data/n8n     # n8n 容器以 uid 1000 运行，属主不对会 EACCES
```

### 3.3 密码

密码放在 `.env.secret`，只生成一次。`umask 077` 保证文件从创建那一刻就是 600，而不是先 644 再 chmod：

```bash
# [harbor]
cd /srv/stacks/base
PG_PASSWORD="$(openssl rand -base64 24 | tr -d '/+=')"
( umask 077
  printf 'PG_USER=nextloom\nPG_PASSWORD=%s\nPG_DB=nextloom_dev\n' "$PG_PASSWORD" > .env.secret )
unset PG_PASSWORD

# Dozzle 账号：用 Dozzle 自己的生成器，哈希格式由它决定
DZ_PASSWORD="$(openssl rand -base64 18 | tr -d '/+=')"
echo "Dozzle 密码：$DZ_PASSWORD"          # 记下来，下一步存进 Keychain
( umask 077
  docker run --rm amir20/dozzle:latest generate admin \
    --password "$DZ_PASSWORD" --name admin --email admin@harbor.local \
    > /srv/data/dozzle/users.yml )
unset DZ_PASSWORD
```

存进 studio 的 Keychain。Postgres 密码直接从 harbor 管道过来，不经过屏幕：

```bash
# [studio]  在 work-station 仓库根目录
ssh harbor "grep '^PG_PASSWORD=' /srv/stacks/base/.env.secret | cut -d= -f2-" \
  | tr -d '\n' | ./script/mysec.mjs postgres harbor-dev PG_PASSWORD -

(echo -n '<上面打印的 Dozzle 密码>') | ./script/mysec.mjs dozzle harbor DOZZLE_PASSWORD -
```

### 3.4 生成 `.env` 并启动

`.env` 是派生文件 = 共享变量 + 密码。每次 `TS_IP` 变了就重新拼一次：

```bash
# [harbor]
cd /srv/stacks/base
( umask 077; cat /srv/stacks/.env.shared .env.secret > .env )
docker compose config >/dev/null && echo "compose 配置 OK"    # TS_IP 为空会在这里就报错
docker compose up -d
docker compose ps
```

### 3.5 验证端口没有泄漏到局域网

这一步不要跳过：

```bash
# [harbor]
ss -tlnH | grep -E ':(5432|5678|3001|8080)\b'
```

每一行的地址都必须是 `100.x.x.x:端口`。看到 `0.0.0.0` 或 `*` 就说明 `TS_IP` 没生效，先 `docker compose down`，查 `.env`。

从 studio 访问：

```bash
# [studio]
curl -sI http://harbor:3001 | head -1      # Uptime Kuma
curl -sI http://harbor:8080 | head -1      # Dozzle（会跳登录页）
curl -sI http://harbor:5678 | head -1      # n8n
nc -z -G 3 harbor 5432 && echo "Postgres 端口通"
```

然后浏览器打开 `http://harbor:3001`，建管理员账号；在 Settings → Notifications 里配一个推送渠道（Telegram / Bark / ntfy 任选），后面备份失败和服务掉线都靠它通知你。

### 3.6 studio 改用 harbor 上的数据库

项目里的开发数据库连接串改成：

```
postgresql://nextloom:<密码>@harbor:5432/nextloom_dev
```

需要注入到命令里时：

```bash
./script/rw-mysec.mjs postgres:harbor-dev:PG_PASSWORD -- pnpm dev    # 换成你要跑的命令
```

**完成标准**：四个服务 `docker compose ps` 都是 running；`ss` 里没有 `0.0.0.0`；studio 和手机都能打开 Uptime Kuma。

---

## 4. foundry 电源与散热

lingtai 跑在这台上，所以它要长期插电、不休眠、不过热。三件事：

```bash
# [foundry] 接电源时永不休眠（屏幕 10 分钟后熄灭）
sudo pmset -c sleep 0 disksleep 0 displaysleep 10 womp 1
pmset -g custom | sed -n '/AC Power/,/^$/p'      # sleep 应该是 0
```

**充电上限 80%**（2018 款长期插电不管理，电池会鼓包）。二选一：

- 打开 AlDente，拖到 80%，勾开机启动
- 或者 `sudo bclm write 80 && sudo bclm persist`

**散热**：开盖运行或垫高，别合盖塞抽屉。这台满载会重度降频。自查：

```bash
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

```bash
# [harbor]
RESTIC_PW="$(openssl rand -base64 24 | tr -d '/+=')"
echo "harbor restic 密码：$RESTIC_PW"      # 立刻存进 Keychain，丢了备份就永远打不开
printf 'RESTIC_REPOSITORY=/srv/backup/harbor\nRESTIC_PASSWORD=%s\n' "$RESTIC_PW" \
  | sudo install -D -m 600 -o root -g root /dev/stdin /etc/fleet/restic.env
unset RESTIC_PW

sudo mkdir -p /srv/backup/harbor
sudo sh -c 'set -a; . /etc/fleet/restic.env; set +a; restic init'
```

```bash
# [studio]
(echo -n '<harbor restic 密码>') | ./script/mysec.mjs restic harbor RESTIC_PASSWORD -
```

**备份脚本放在 root 拥有的目录**：

```bash
# [harbor]
sudo install -d -m 755 -o root -g root /usr/local/lib/fleet

sudo tee /usr/local/lib/fleet/pg-dump.sh >/dev/null <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
set -a; . /srv/stacks/base/.env; set +a
OUT=/srv/backup/pg
mkdir -p "$OUT"
cid="$(docker compose -f /srv/stacks/base/compose.yaml ps -q postgres)"
docker exec "$cid" pg_dump -U "$PG_USER" -d "$PG_DB" | gzip > "$OUT/${PG_DB}-$(date +%F).sql.gz"
find "$OUT" -name '*.sql.gz' -mtime +7 -delete
EOF

sudo tee /usr/local/lib/fleet/daily.sh >/dev/null <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
set -a; . /etc/fleet/restic.env; set +a

/usr/local/lib/fleet/pg-dump.sh

# 不拷运行中的 PGDATA：那不是一份可用的备份，上面的 pg_dump 才是。
# 也不备份 studio 的仓库，免得把别人的备份再备份一遍。
restic backup /srv/data /srv/backup/pg /srv/stacks \
  --exclude /srv/data/postgres \
  --exclude /srv/backup/studio \
  --exclude '**/*.sock'

restic forget --keep-daily 30 --keep-weekly 12 --keep-monthly 6 --prune
EOF

sudo chmod 755 /usr/local/lib/fleet/*.sh
sudo chown root:root /usr/local/lib/fleet/*.sh
```

> **为什么不能放在 `/srv/backup/` 下**：那个目录属于你的普通用户，而下面的定时器以 root 身份执行这些脚本。任何以你的用户身份运行的东西，都能往脚本里追加一行，然后在凌晨 3:30 以 root 身份执行。

**定时器**：

```bash
# [harbor]
sudo tee /etc/systemd/system/fleet-backup.service >/dev/null <<'EOF'
[Unit]
Description=Fleet daily backup

[Service]
Type=oneshot
ExecStart=/usr/local/lib/fleet/daily.sh
NoNewPrivileges=true
EOF

sudo tee /etc/systemd/system/fleet-backup.timer >/dev/null <<'EOF'
[Unit]
Description=Fleet daily backup timer

[Timer]
OnCalendar=*-*-* 03:30:00
Persistent=true

[Install]
WantedBy=timers.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now fleet-backup.timer
systemctl list-timers fleet-backup.timer
```

### 5.2 恢复演练（不要跳过）

没验证过的备份等于没有备份。仓库是 root 的，演练也用 root：

```bash
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

```bash
# [harbor]
mkdir -p /srv/backup/studio
```

studio 这边用它自己的密码：

```bash
# [studio]
( umask 077; openssl rand -base64 24 | tr -d '/+=\n' > ~/.restic-pass )
cat ~/.restic-pass | ./script/mysec.mjs restic studio RESTIC_PASSWORD -

# 记录 harbor 的主机密钥 —— launchd 是非交互的，没有这一步每晚都会死在
# "Host key verification failed"
ssh -o StrictHostKeyChecking=accept-new harbor true

export RESTIC_PASSWORD_FILE=~/.restic-pass
restic -r sftp:harbor:/srv/backup/studio init
```

`~/.restic-excludes`：

```bash
# [studio]
cat > ~/.restic-excludes <<'EOF'
node_modules
.next
dist
build
out
.turbo
.venv
target
.cache
*.log
.DS_Store
EOF
```

备份脚本：

```bash
# [studio]
mkdir -p ~/bin ~/Library/Logs/fleet
cat > ~/bin/backup-studio.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
export RESTIC_PASSWORD_FILE="$HOME/.restic-pass"
REPO="sftp:harbor:/srv/backup/studio"

restic -r "$REPO" backup "$HOME/workspace" --exclude-file "$HOME/.restic-excludes" --tag studio
restic -r "$REPO" forget --tag studio --keep-daily 30 --keep-weekly 12 --prune
echo "$(date '+%F %T') ok"
EOF
chmod +x ~/bin/backup-studio.sh
~/bin/backup-studio.sh          # 先手动跑一次
```

每天 02:30 自动跑（和 harbor 的 03:30 错开，两边 prune 不抢锁）：

```bash
# [studio]
cat > ~/Library/LaunchAgents/ai.nextloom.backup-studio.plist <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>ai.nextloom.backup-studio</string>
  <key>ProgramArguments</key><array><string>$HOME/bin/backup-studio.sh</string></array>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>2</integer><key>Minute</key><integer>30</integer></dict>
  <key>StandardOutPath</key><string>$HOME/Library/Logs/fleet/backup.out.log</string>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/fleet/backup.err.log</string>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string></dict>
</dict>
</plist>
EOF
launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/ai.nextloom.backup-studio.plist
launchctl print "gui/$(id -u)/ai.nextloom.backup-studio" | head -5
```

**完成标准**：harbor 的定时器在排队、恢复演练通过、`/srv/backup/pg` 有今天的 dump；studio 手动跑过一次成功、launchd 任务已注册；三个 restic 密码都在 Keychain 里。

---

## 全部做完后的体检

```bash
# [studio]
tailscale status
for h in harbor foundry; do ssh -o ConnectTimeout=5 "$h" hostname; done
curl -sI http://harbor:3001 | head -1
./script/mysec.mjs restic harbor RESTIC_PASSWORD >/dev/null && echo "harbor restic 密码在 Keychain"
./script/mysec.mjs restic studio RESTIC_PASSWORD >/dev/null && echo "studio restic 密码在 Keychain"

# [harbor]
docker compose -f /srv/stacks/base/compose.yaml ps
ss -tlnH | grep -E ':(5432|5678|3001|8080)\b'          # 全是 100.x.x.x
systemctl list-timers fleet-backup.timer
stat -c '%U %a %n' /usr/local/lib/fleet/*.sh /etc/fleet/restic.env   # 都是 root，755 / 600

# [foundry]
pmset -g custom | grep -A3 'AC Power'
```

## 日常运维

| 场景 | 命令 |
| --- | --- |
| 看服务状态 | `[harbor]` `docker compose -f /srv/stacks/base/compose.yaml ps` |
| 看日志 | 浏览器 `http://harbor:8080` |
| 重启某个服务 | `[harbor]` `cd /srv/stacks/base && docker compose restart n8n` |
| Tailscale 换了 IP | `[harbor]` 重跑 2.3，再按 3.4 重拼 `.env` 并 `docker compose up -d` |
| 手动备份一次 | `[harbor]` `sudo systemctl start fleet-backup.service` · `[studio]` `~/bin/backup-studio.sh` |
| 看备份日志 | `[harbor]` `journalctl -u fleet-backup -n 50` · `[studio]` `tail ~/Library/Logs/fleet/backup.err.log` |
