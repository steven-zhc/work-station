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
ansible-playbook mac-local.yml --tags volta        # Node.js/Volta
ansible-playbook mac-local.yml --tags ai           # AI tools (Claude Code)
ansible-playbook mac-local.yml --tags apps         # GUI applications
ansible-playbook mac-local.yml --tags shell --ask-become-pass  # Shell config
ansible-playbook mac-local.yml --tags neovim       # Neovim editor
ansible-playbook mac-local.yml --tags fonts        # Nerd fonts
ansible-playbook mac-local.yml --tags cli          # CLI utilities
ansible-playbook mac-local.yml --tags bun          # Bun runtime
ansible-playbook mac-local.yml --tags python       # Python/uv
```

## What Gets Installed

### Development Tools
- **Editors**: Neovim, VS Code
- **Terminal**: iTerm2, Fish shell with Starship prompt
- **Version Control**: Git, Lazygit
- **Workspace**: tmux with custom session management

### Runtimes & Package Managers
- **Node.js**: Volta version manager, pnpm package manager
- **Python**: uv for environment management
- **JavaScript**: Bun alternative runtime

### CLI Utilities
- **File Operations**: fzf, fd, ripgrep, bat, zoxide
- **Network**: curl, wget, httpie
- **Development**: jq, i2cssh
- **AI**: Claude Code CLI

### Applications
- iTerm2 (terminal)
- VS Code (editor)
- AltTab (window switcher)
- Rectangle (window manager)

## Workspace Management

Use the included scripts for enhanced productivity:

```bash
./script/tx    # Launch tmux workspace selector
./script/cht   # Cheat sheet utility
./script/px    # Process management
./script/s     # Search utility
```

The `tx` script provides intelligent workspace switching with tmux sessions for different project directories.