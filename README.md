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
./script/cht   # Cheat sheet utility
./script/px    # Process management
./script/s     # Search utility
```

The `tx` script provides intelligent workspace switching with tmux sessions for different project directories.

## Secrets (macOS Keychain via keytar)

This repo includes small helpers to store secrets in your OS credential store and inject them into a command without pasting tokens into chat or committing them.

### Install deps (one-time)

```bash
npm install
```

### Store a secret

Prefer stdin so it doesn’t land in shell history:

```bash
(echo -n 'YOUR_TOKEN') | ./script/mysec.mjs <service> <account> <KEY_NAME> -
```

Example:

```bash
(echo -n 'sk-...') | ./script/mysec.mjs openai steven OPENAI_API_KEY -
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

# wildcard: inject ALL secrets that start with "vercel:nextloom.ai"
./script/rw-mysec.mjs vercel:nextloom.ai -- node ./your-script.mjs
```

Notes:
- Secrets are pulled from Keychain at runtime and exist only in the child process environment.
- Don’t print env vars in logs.
