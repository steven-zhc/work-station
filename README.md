# macOS Development Environment Setup

Automated macOS development environment configuration using Ansible. Sets up a complete development workspace with tools, applications, shell configuration, and workspace management utilities.

## Prerequisites

### 1. Git Setup with SSH Key

```bash
mkdir ~/.ssh
cp id_ed25519 ~/.ssh/
```

Configure SSH settings in `~/.ssh/config`:
```sh
host *
  AddKeysToAgent yes
  UseKeychain yes
  ServerAliveInterval 120
  TCPKeepAlive no
  IdentityFile ~/.ssh/id_ed25519
  IPQoS=throughput

host github.com
  HostName github.com
  User git
```

### 2. Dotfiles Setup

Refer to dotfile project README for dotfiles configuration.

## Installation

### Install Homebrew and Ansible
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
brew install ansible
```

### Run Setup Modules
```bash
ansible-playbook mac-local.yml --tags js,js-all            # Node.js
ansible-playbook mac-local.yml --tags app                  # GUI applications
ansible-playbook mac-local.yml --tags shell,shell-all --ask-become-pass  # Shell config
ansible-playbook mac-local.yml --tags font,font-all        # Nerd fonts
ansible-playbook mac-local.yml --tags cli,cli-all          # CLI utilities
ansible-playbook mac-local.yml --tags python,python-all    # Python/uv
ansible-playbook mac-local.yml --tags ai,ai-all            # AI tools (Claude Code)
ansible-playbook mac-local.yml --tags docker,docker-all    # Container tools (Podman)
```

## What Gets Installed

### Development Tools
- **Editors**: Neovim, VS Code
- **Terminal**: iTerm2, Fish shell with Starship prompt
- **Version Control**: Git, Lazygit
- **Workspace**: tmux and herdr with custom session management

### Runtimes & Package Managers
- **Node.js**: Volta version manager, pnpm package manager
- **Python**: uv for environment management
- **JavaScript**: Bun alternative runtime

### CLI Utilities
- **File Operations**: fzf, fd, ripgrep, bat, zoxide
- **Network**: curl, wget, httpie
- **Development**: jq, i2cssh
- **AI**: Claude Code CLI
- **Containers**: Podman, podman-compose

### Applications
- iTerm2 (terminal)
- VS Code (editor)
- AltTab (window switcher)
- Rectangle (window manager)

## Workspace Management

Use the included scripts for enhanced productivity:

```bash
./script/tx    # Launch tmux workspace selector
./script/hx    # Launch herdr workspace selector
./script/cht   # Cheat sheet utility
./script/px    # Process management
./script/s     # Search utility
```

The `tx` script provides intelligent workspace switching with tmux sessions for different project directories.

### hx

`hx` is the [herdr](https://herdr.dev) counterpart of `tx` (requires `herdr`, `fzf`, `jq`; uses
`zoxide` when present). Unlike a tmux session, herdr keeps every space alive at once, so `hx` is
less a switcher than a launcher: **search projects, mark as many as you want with `tab`, and each
one is opened as its own space.** `hx` then focuses the first and attaches, and you switch between
the spaces inside herdr.

Each space gets two tabs: `edit` (the editor on top, a shell below it) and `console` (a plain
shell), both in the project directory.

Because herdr tracks the state of the coding agent in every pane, the picker doubles as a "what
needs me" list: projects are labelled `blocked` / `done` / `working` / `idle` and sorted with the
most urgent first. The preview pane shows the live screen of a running agent, or git status and log
for a project that is not open.

```bash
hx [query]           # mark projects, open one space each
hx -s work           # open every space the "work" set declares, no picker
hx -                 # jump back to the previous space
hx -a claude         # also start an agent in each of them
hx -w feat/login     # open a git worktree of the project on that branch
```

For the spaces you always want up, declare a set and bring the whole thing up in one step with
`hx -s <name>` (or `hx -s` for the first set in the file). hx uses the nearest `.hx-space.toml` at
or above the current directory when there is one — a checkout describing its own spaces — and
`~/.config/hx/space.toml` otherwise:

```toml
[[set]]
name = "work"
  [[set.space]]
  dir = "~/Workspace/api"
  agent = "claude"        # optional: start this agent in the space
  [[set.space]]
  dir = "~/Workspace/web"
  name = "web-ui"         # optional: label the space something else

[[set]]
name = "personal"
  [[set.space]]
  dir = "~/.dotfile"
```

Only `dir` is required, and a relative one is resolved against the file that declares it, so a
monorepo's `.hx-space.toml` can just name its neighbours:

```toml
[[set]]
name = "all"
  [[set.space]]
  dir = "packages/api"
  [[set.space]]
  dir = "packages/web"
```

Each space is still laid out by its own `.hx.toml` or the default, an already-open one is left alone,
and a directory that no longer exists is skipped with a warning.

Inside the picker: `tab` mark/unmark, `enter` open the marked projects, `ctrl-a` start an agent in
each, `ctrl-x` close the spaces, `ctrl-w` new worktree, `ctrl-d` remove a worktree checkout. The
last two act on a single project, so mark exactly one for those.

Projects are discovered through `~/.config/hx/roots` (one path or glob per line, seeded on first
run) plus any git repo that zoxide knows about.

A project can override the default layout with a `.hx.toml` file at its root, in TOML — one `[[tab]]` per
tab, and a `[[tab.pane]]` for each extra pane split off the one before it in that tab:

```toml
[[tab]]
name = "edit"
command = "nvim ."
  [[tab.pane]]
  name = "shell"
  size = 15               # percent of the space the new pane takes
  split = "down"          # "down" (default) or "right"

[[tab]]
name = "server"
command = "pnpm dev"
  [[tab.pane]]
  name = "logs"
  command = "tail -f log"
  size = 30

[[tab]]
name = "console"
```

Every key is optional: a tab with no command is a plain shell, a pane with no size splits in half.
Commands are sent to the pane's shell verbatim. Reading `.hx.toml` needs `python3` (for its stdlib
`tomllib`); a project without one uses the built-in default and needs nothing. The layout is read
once, when the space is created, so an edited `.hx.toml` takes effect after closing and reopening the
space.

## Secrets (macOS Keychain via keytar)

This repo includes small helpers to store secrets in your OS credential store and inject them into a command without pasting tokens into chat or committing them.

### Install deps (one-time)

```bash
npm install
```

### Naming convention (3 dimensions)

We organize secrets by:
- **service**: SaaS name (e.g. `vercel`, `stripe`, `openai`)
- **account**: category (project/env/free-form), e.g. `nextloom.ai-dev`, `nextloom.ai-prod`
- **KEY_NAME**: environment variable name, e.g. `GITHUB_TOKEN`, `DEPLOY_TOKEN`

Recommendation: keep **account** free of `:` (use `-` or `/`) so wildcard lookups stay unambiguous.

### Store a secret

Prefer stdin so it doesn’t land in shell history:

```bash
(echo -n 'YOUR_TOKEN') | ./script/mysec.mjs <service> <account> <KEY_NAME> -
```

Example:

```bash
# openai, personal
(echo -n 'sk-...') | ./script/mysec.mjs openai steven OPENAI_API_KEY -

# vercel, project=nextloom.ai, env=dev
(echo -n '...') | ./script/mysec.mjs vercel nextloom.ai-dev GITHUB_TOKEN -
(echo -n '...') | ./script/mysec.mjs vercel nextloom.ai-dev DEPLOY_TOKEN -
```

### Read a secret

```bash
./script/mysec.mjs openai steven OPENAI_API_KEY
```

### Run a command with secrets injected

```bash
# exact list
./script/rw-mysec.mjs \
  openai:steven:OPENAI_API_KEY,stripe:work:STRIPE_API_KEY \
  -- node ./your-script.mjs

# wildcard: inject ALL secrets for vercel + category prefix (e.g. project/env)
./script/rw-mysec.mjs vercel:nextloom.ai-dev -- node ./your-script.mjs
```

Notes:
- Secrets are pulled from Keychain at runtime and exist only in the child process environment.
- Don’t print env vars in logs.
