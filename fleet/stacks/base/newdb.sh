#!/usr/bin/env bash
# 建一对角色 + 同名的库（在 base 这个 Postgres 实例里）。
#
# 用法（在 harbor 上，任何 shell 都行，不依赖 fish 会话状态）：
#   ./newdb.sh nextloom-ai-dev
#   ./newdb.sh nextloom-ai-dev lingtai-my     # 一次建多个
#
# 密码只打印在屏幕上，不写文件、不进 Keychain（那块以后有单独方案）——自己记下来。
# 见 fleet/SETUP.md 3.5。
set -euo pipefail

if [ "$#" -eq 0 ]; then
  echo "用法：$0 <库名> [<库名> ...]" >&2
  exit 1
fi

set -a
. /srv/stacks/base/.env
set +a

cid="$(docker compose -f /srv/stacks/base/compose.yaml ps -q postgres)"
if [ -z "$cid" ]; then
  echo "postgres 容器没在跑 —— 先 cd /srv/stacks/base && docker compose up -d" >&2
  exit 1
fi

for name in "$@"; do
  pw="$(openssl rand -base64 24 | tr -d '/+=')"
  docker exec "$cid" psql -U "$PG_ADMIN_USER" -d postgres -v ON_ERROR_STOP=1 -c \
    "CREATE ROLE \"$name\" LOGIN PASSWORD '$pw'; CREATE DATABASE \"$name\" OWNER \"$name\";"
  echo "$name 密码：$pw"
  echo "$name 连接串：postgresql://$name:$pw@harbor:5432/$name"
done
