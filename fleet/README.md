# fleet · 三台机器

`fleet/` 只负责**装软件**，用 Ansible，一台机器一个 playbook。配置（Tailscale 登录、
harbor 的服务栈、备份、开机自启……）不在这里，全在 [`fleet/SETUP.md`](SETUP.md) 里，
按 fish 语法逐条写好，跟着那份文档一台一台配。

```
fleet/
├── SETUP.md          配置手册（fish 语法，装完软件之后跟着这份走）
├── studio.sh/.yml     Mac mini M4 · 设计台
├── foundry.sh/.yml    MacBook Pro 15 (Intel) · 跑 lingtai
├── harbor.sh/.yml      ThinkPad T450 / Mint 22.2 · 运行时主机
└── module/            fleet 专用的任务文件（studio/foundry 共用 mac-common.yml；
                        harbor 用 linux-common.yml + linux-tailscale.yml）
```

日常开发工具链（Node、Python、CLI、字体、GUI 应用……）不在这三个 playbook 里，走仓库
根目录的 `mac-local.yml` / `mac-intel-local.yml` / `linux-local.yml`。`fleet/` 的三个
playbook只装这条链路额外需要的东西：

| 机器 | 脚本 | 额外装的 |
| --- | --- | --- |
| Mac mini M4 | `./studio.sh` | tailscale, gh, restic |
| MacBook Pro 15 (Intel) | `./foundry.sh` | 以上 + aldente（充电上限 80%） |
| ThinkPad T450 / Mint 22.2 | `./harbor.sh` | apt 基础包, tailscale, restic |

## 用法

每个脚本都是瘦包装：检查系统、缺 ansible 就先装、把 `--dry-run` 翻译成
`--check --diff`，其余参数原样传给 `ansible-playbook`。

```bash
cd fleet
./studio.sh                  # 装全部
./harbor.sh --tags docker    # 只装某个标签（--list-tags 看有哪些）
./harbor.sh --dry-run        # 只看会做什么，不动系统
```

跳过包装脚本也一样：`ansible-playbook fleet/harbor.yml --ask-become-pass`。

标签约定：`[<module>-all, <tool>]`，比如 `common-all` / `tailscale-all`。playbook 都用
`import_tasks`（不是 `include_tasks`），细粒度标签比如 `--tags gh` 能直接选中子任务。

## 顺序

1. 三台各自跑一遍装软件的脚本（上面表格）。
2. 打开 [`SETUP.md`](SETUP.md)，从第 1 节（网络 / Tailscale）开始，按机器标注
   （`# [studio]` `# [harbor]` `# [foundry]`）逐条跑。harbor 的服务栈、密码生成、
   备份都在那份文档里。

## 已经踩过的坑

- **Mint 22.2**：apt 源必须用 `/etc/os-release` 里的 `UBUNTU_CODENAME`（`noble`）。
  它自己的 `VERSION_CODENAME` 是 `zara`，Tailscale／Docker 的源里都没有这个发行版。
  `harbor.yml` 一开始就读出来并 assert 非空。
- **`include_tasks` 会吃掉细粒度标签**：动态 include 的子任务标签匹配不到，
  `--tags gh` 会静默地什么也不装。`fleet/` 下的 playbook 统一用 `import_tasks`。
- **端口绑定到 `0.0.0.0`**：这是有意的（家庭局域网），不是疏漏 —— 见 `SETUP.md` 里
  的说明和端口列表。
- **fish 里的空变量**：不加引号的话会直接消失，不是变成空字符串。
  `--password $X`（X 为空）实际传给命令的是 `--password --next-flag`，报的错是
  "missing value for --password" 而不是什么"变量未定义"。`SETUP.md` 里所有密码变量
  都加了引号 + 空值检查。
