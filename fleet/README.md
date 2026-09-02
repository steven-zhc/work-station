# fleet · 三台机器的软件安装

只做一件事：**装好三机流水线额外需要的软件**。配置（Tailscale 登录、compose、服务编排、备份）不在这里。

通用开发环境不在这里 —— 那是仓库根的三个 playbook 的事，两边不重复：

| 机器 | 通用开发环境 | fleet 额外的 |
| --- | --- | --- |
| Mac mini M4 | `mac-local.yml` | `fleet/studio.sh` |
| MacBook Pro Intel | `mac-intel-local.yml` | `fleet/foundry.sh` |
| ThinkPad / Mint | `linux-local.yml` | `fleet/harbor.sh` |

约定和仓库其余部分一致：**Ansible 装软件**，每台机器一个薄 shell wrapper 负责把 ansible 本身准备好。

```
fleet/
├── studio.sh   studio.yml    Mac mini M4（arm64）
├── foundry.sh  foundry.yml   MacBook Pro 15 2018（Intel）
├── harbor.sh   harbor.yml    ThinkPad T450 / Linux Mint 22.2
└── module/
    ├── mac-common.yml       tailscale · gh · restic
    ├── mac-foundry.yml      aldente
    ├── linux-common.yml     restic
    └── linux-tailscale.yml  tailscale 官方源
```

## 用法

在对应的机器上：

```bash
cd work-station/fleet

./studio.sh                 # Mac mini
./foundry.sh                # MacBook Pro
./harbor.sh                 # ThinkPad（会问一次 sudo 密码）
```

常用参数（三个脚本一致，其余参数原样透传给 ansible-playbook）：

```bash
./harbor.sh --dry-run       # 只看会做什么，不动系统（ansible --check --diff）
./harbor.sh --list-tags     # 列出可用标签
./harbor.sh --tags tailscale # 只装 Tailscale
./studio.sh --tags gh
```

wrapper 只负责三件事：确认在对的操作系统上、ansible 不在就装上、Linux 上补 `--ask-become-pass`。
不想用 wrapper 就直接跑 playbook，效果一样：

```bash
ansible-playbook fleet/studio.yml
ansible-playbook fleet/harbor.yml --ask-become-pass --tags tailscale
```

标签风格与 `mac-module/` 一致：`[<模块>-all, <工具>]`。

## 装了什么

| | studio | foundry | harbor |
| --- | :-: | :-: | :-: |
| tailscale | ✓ | ✓ | ✓ |
| gh | ✓ | ✓ | |
| restic | ✓ | ✓ | ✓ |
| aldente（充电上限 80%） | | ✓ | |

CLI 工具、Node、Python、Docker 都不在这张表里 —— 那些是通用开发环境，
分别由 `mac-local.yml` / `mac-intel-local.yml` / `linux-local.yml` 负责。

## 装完还需要手动做的

ansible 只能装软件，这几件事得你自己来：

| 在哪 | 做什么 |
| --- | --- |
| 三台 | 登录 Tailscale。Mac 上打开 Tailscale.app 登录并勾 Run on login；harbor 上 `sudo tailscale up --hostname=harbor --ssh` |
| harbor | 先跑 `ansible-playbook linux-local.yml -K` 装 Docker 等通用环境，然后**注销重新登录**让 docker 组生效 |
| foundry | 打开 AlDente，把充电上限拖到 80% 并勾开机启动 |

## 一个坑（已经在 playbook 里处理了）

Mint 22.2 的 `VERSION_CODENAME` 是它自己的代号 `zara`，Tailscale 和 Docker 的 apt 源里都没有
这个发行版；`ansible_lsb.codename` 拿到的也是它。`harbor.yml` 和 `linux-local.yml` 开头都会从
`/etc/os-release` 读 `UBUNTU_CODENAME`（`noble`）再去拼源地址，并断言它非空。
