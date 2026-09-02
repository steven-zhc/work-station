#!/usr/bin/env bash
# ============================================================
#  harbor 软件安装（Linux Mint 22.2）
#
#  基础 CLI + Tailscale + Docker CE。这台是三台里唯一 mac-local.yml
#  覆盖不到的。
#
#  用法：
#    ./harbor.sh                 装全部（会问一次 sudo 密码）
#    ./harbor.sh --tags docker   只装 Docker
#    ./harbor.sh --dry-run       只看会做什么（ansible --check --diff）
#    ./harbor.sh --list-tags     列出可用标签
#
#  装完 Docker 需要注销重新登录，docker 组才生效。
# ============================================================
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

PLAY=harbor.yml

[ "$(uname -s)" = Linux ] || { echo "这个脚本只能在 Linux 上跑（当前：$(uname -s)）" >&2; exit 1; }

if ! command -v ansible-playbook >/dev/null 2>&1; then
  echo "==> 安装 ansible"
  sudo apt-get update
  sudo apt-get install -y ansible
fi

# 装包要 root。--list-tags / --dry-run 不动系统，就别问密码了。
BECOME=(--ask-become-pass)
ARGS=()
for a in "$@"; do
  case "$a" in
    --dry-run)   ARGS+=(--check --diff) ;;
    --list-tags) BECOME=() ; ARGS+=("$a") ;;
    *)           ARGS+=("$a") ;;
  esac
done

set -x
exec ansible-playbook "$PLAY" ${BECOME[@]+"${BECOME[@]}"} ${ARGS[@]+"${ARGS[@]}"}
