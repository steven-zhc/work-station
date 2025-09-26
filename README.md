# mac os setup

## git setup including ssh key

```sh
mkdir ~/.ssh
cp id_ed25519 ~/.ssh/
```

```sh
#~/.ssh/config
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

## checkout dotfile

refer to dotfile project readme file

## 

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

brew install ansible

ansible-playbook mac-local.yml --tags volta
ansible-playbook mac-local.yml --tags ai
ansible-playbook mac-local.yml --tags apps
ansible-playbook mac-local.yml --tags shell --ask-become-pass
ansible-playbook mac-local.yml --tags fonts
ansible-playbook mac-local.yml --tags cli
ansible-playbook mac-local.yml --tags bun
ansible-playbook mac-local.yml --tags python

```