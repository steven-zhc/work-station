# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Purpose

This is a macOS development environment setup and workspace management repository using Ansible for automation. It configures a complete development environment including tools, applications, shell configuration, and workspace management scripts.

## Key Commands

### Main Setup Commands
```bash
# Install Homebrew first
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Ansible
brew install ansible

# Run specific setup modules
ansible-playbook mac-local.yml --tags js,js-all   # Node.js via mise + pnpm + bun
ansible-playbook mac-local.yml --tags ai           # AI tools (Claude Code)
ansible-playbook mac-local.yml --tags apps         # GUI applications
ansible-playbook mac-local.yml --tags shell --ask-become-pass  # Shell configuration
ansible-playbook mac-local.yml --tags fonts        # Nerd fonts
ansible-playbook mac-local.yml --tags cli          # CLI tools
ansible-playbook mac-local.yml --tags bun          # Bun runtime
ansible-playbook mac-local.yml --tags python       # Python/uv setup

# Intel Mac: mac-module/ + mac-module-intel/ (brew prefix, bclm, fan control)
ansible-playbook mac-intel-local.yml
ansible-playbook mac-intel-local.yml --tags intel-all

# Linux (Mint 22.2), server subset: cli / shell / js / python / docker
ansible-playbook linux-local.yml --ask-become-pass
ansible-playbook linux-local.yml --tags docker -K
```

### Fleet (Three Machines)
```bash
# fleet/ installs software only. Configuration is out of scope.
cd fleet
./studio.sh                  # Mac mini M4        -> tailscale, gh, restic
./foundry.sh                 # MacBook Pro Intel  -> + aldente
./harbor.sh                  # ThinkPad / Mint    -> apt basics, tailscale, docker-ce

./harbor.sh --tags docker    # other flags pass through to ansible-playbook
./harbor.sh --dry-run        # ansible --check --diff
./harbor.sh --list-tags

ansible-playbook fleet/harbor.yml --ask-become-pass   # same thing without the wrapper
```

### Workspace Management
```bash
# Launch tmux workspace selector
./script/tx

# Launch herdr workspace selector (agent-state aware; see README for keys and .hx layouts)
./script/hx

# Available scripts in script/
./script/cht    # Cheat sheet tool
./script/px     # Process management
./script/s      # Search utility
```

## Architecture Overview

### File Structure
- `mac-local.yml` - Apple Silicon macOS setup
- `mac-module/` - Modular Ansible tasks for macOS (both architectures)
  - `app.yml` - GUI application installations (iTerm2, VS Code)
  - `node.yml` - Node.js environment setup
  - `terminal.yml` - Terminal configuration
- `mac-intel-local.yml` - Intel Mac setup: reuses `mac-module/`, adds `mac-module-intel/`
- `mac-module-intel/` - Only what differs on Intel; asserts `x86_64` before running
  - `brew.yml` - `/usr/local` Homebrew prefix and `brew shellenv`
  - `power.yml` - `bclm` (SMC charge limit, Intel-only), Macs Fan Control, stats
- `linux-local.yml` - Debian/Ubuntu setup (targets Linux Mint 22.2); server subset
- `linux-module/` - Modular Ansible tasks for Linux
  - `cli.yml` `shell.yml` `js.yml` `python.yml` `docker.yml`
- `script/` - Shell utilities for workspace management
- `inventory/` - Ansible inventory configuration
- `fleet/` - Software installation for the three machines (studio / foundry / harbor)
  - `{studio,foundry,harbor}.yml` - One playbook per machine
  - `{studio,foundry,harbor}.sh` - Thin wrappers: check OS, install Ansible, pass flags through
  - `module/` - Task files, same structure as `mac-module/`

### Key Technologies Configured
- **Node.js Environment**: mise for version management, pnpm for package management
- **Shell**: Fish shell with Starship prompt
- **Development Tools**: VS Code, iTerm2, tmux, lazygit, fzf, ripgrep, bat
- **AI Tools**: Claude Code CLI installed globally
- **Python**: uv for Python environment management
- **Fonts**: Nerd fonts (Fira Code, JetBrains Mono) for terminal display

### Workspace Management System
The `tx` script provides a tmux-based workspace selector that:
- Scans multiple directories for projects (`~/Workspace`, `/scratch/helium`, etc.)
- Creates tmux sessions with pre-configured layouts
- Opens vim in main pane with a console pane below
- Automatically changes to project directory

### Platform Playbooks
Three sibling playbooks, one per platform. Shared macOS modules live in `mac-module/`; each
platform directory holds only what is specific to it:

- **`mac-module-intel/`** - things that are meaningless on Apple Silicon: the `/usr/local` brew
  prefix, `bclm` (SMC charge limiting has no Apple Silicon equivalent), fan control.
- **`linux-module/`** - apt translations of the macOS modules. Debian names differ (`bat` ->
  `batcat`, `fd` -> `fdfind`, both symlinked into `~/.local/bin`); `lazygit` and `starship` have no
  apt package and come from upstream releases; `herdr` has no Linux package at all, so `script/hx`
  will not work there.

### Tag-Based Installation
The Ansible playbook uses tags for modular installation:
- `mise` - Node.js runtime and package managers (was `volta`)
- `ai` - AI development tools
- `apps` - GUI applications
- `shell` - Shell configuration and prompt
- `fonts` - Development fonts
- `cli` - Command-line utilities
- `bun` - Alternative JavaScript runtime
- `python` - Python development environment
- `intel` / `intel-all` - Intel Mac only (`mac-intel-local.yml`)

`mac-intel-local.yml` and `linux-local.yml` use `import_tasks`, so single-tool tags like
`--tags fzf` select that one task. `mac-local.yml` uses `include_tasks`, which is dynamic — a tag
that exists only on a child task can never be matched there, which is why its documented commands
always pass both `cli` and `cli-all`. Prefer `import_tasks` in new playbooks.

### Fleet Conventions
When touching anything under `fleet/`:
- **`fleet/` installs software and nothing else.** Machine configuration (Tailscale login, service
  setup, deployment, backups) is handled elsewhere — do not add it here.
- The shell scripts stay thin: OS check, install Ansible if missing, `--ask-become-pass` on Linux,
  `--dry-run` -> `--check --diff`, everything else passed straight to `ansible-playbook`. Package
  installation belongs in the playbooks, never in the scripts.
- Use `import_tasks`, not `include_tasks`. `include_tasks` is dynamic, so a tag that only exists on
  a child task can never be selected — `--tags gh` silently matches nothing. (`mac-local.yml` has
  this property too, which is why its README always passes both `cli` and `cli-all`.)
- Tags follow the repo convention: `[<module>-all, <tool>]`.
- On Linux Mint, never use `VERSION_CODENAME` or `ansible_lsb.codename` for apt sources — both give
  Mint's own codename (`zara` on 22.2), which no upstream repo publishes. Read `UBUNTU_CODENAME`
  from `/etc/os-release` instead. `harbor.yml` does this up front and asserts it is non-empty.

## Development Workflow
1. Use `ansible-playbook` with specific tags to install/update components
2. Use `./script/tx` (tmux) or `./script/hx` (herdr) to quickly jump between workspaces
3. The environment is optimized for terminal-based development with Fish shell
4. Claude Code is installed globally and ready for use
5. To provision one of the three machines, run its script in `fleet/` — see `fleet/README.md`