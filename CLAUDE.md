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
ansible-playbook mac-local.yml --tags volta        # Node.js/Volta setup
ansible-playbook mac-local.yml --tags ai           # AI tools (Claude Code)
ansible-playbook mac-local.yml --tags apps         # GUI applications
ansible-playbook mac-local.yml --tags shell --ask-become-pass  # Shell configuration
ansible-playbook mac-local.yml --tags fonts        # Nerd fonts
ansible-playbook mac-local.yml --tags cli          # CLI tools
ansible-playbook mac-local.yml --tags bun          # Bun runtime
ansible-playbook mac-local.yml --tags python       # Python/uv setup
```

### Workspace Management
```bash
# Launch tmux workspace selector
./script/tx

# Available scripts in script/
./script/cht    # Cheat sheet tool
./script/px     # Process management
./script/s      # Search utility
```

## Architecture Overview

### File Structure
- `mac-local.yml` - Main Ansible playbook for complete macOS setup
- `mac-module/` - Modular Ansible tasks
  - `app.yml` - GUI application installations (iTerm2, VS Code)
  - `node.yml` - Node.js environment setup
  - `terminal.yml` - Terminal configuration
- `script/` - Shell utilities for workspace management
- `inventory/` - Ansible inventory configuration

### Key Technologies Configured
- **Node.js Environment**: Volta for version management, pnpm for package management
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

### Tag-Based Installation
The Ansible playbook uses tags for modular installation:
- `volta` - Node.js runtime and package managers
- `ai` - AI development tools
- `apps` - GUI applications
- `shell` - Shell configuration and prompt
- `fonts` - Development fonts
- `cli` - Command-line utilities
- `bun` - Alternative JavaScript runtime
- `python` - Python development environment

## Development Workflow
1. Use `ansible-playbook` with specific tags to install/update components
2. Use `./script/tx` to quickly jump between workspaces in tmux
3. The environment is optimized for terminal-based development with Fish shell
4. Claude Code is installed globally and ready for use