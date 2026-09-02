#!/usr/bin/env bash
# ============================================================
#  studio 软件安装（macOS）
#
#  只装 fleet 这条链路额外需要的东西。日常开发工具链走仓库根的
#  mac-local.yml，这里不重复。
#
#  用法：
#    ./studio.sh                 装全部
#    ./studio.sh --tags gh       只装某一项
#    ./studio.sh --dry-run       只看会做什么（ansible --check --diff）
#    ./studio.sh --list-tags     列出可用标签
# ============================================================
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

PLAY=studio.yml

[ "$(uname -s)" = Darwin ] || { echo "这个脚本只能在 macOS 上跑（当前：$(uname -s)）" >&2; exit 1; }
command -v brew >/dev/null 2>&1 || { echo "先装 Homebrew：https://brew.sh" >&2; exit 1; }

if ! command -v ansible-playbook >/dev/null 2>&1; then
  echo "==> 安装 ansible"
  brew install ansible
fi

ARGS=()
for a in "$@"; do
  case "$a" in
    --dry-run) ARGS+=(--check --diff) ;;   # ansible 自己的 dry-run
    *)         ARGS+=("$a") ;;
  esac
done

set -x
exec ansible-playbook "$PLAY" ${ARGS[@]+"${ARGS[@]}"}
