#!/bin/sh
set -eu

PROJECT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
DOCKER=/Applications/Docker.app/Contents/Resources/bin/docker

fail() {
  echo "RDMS 更新失败：$1" >&2
  exit 1
}

if [ ! -x "$DOCKER" ]; then
  fail "找不到 Docker Desktop。"
fi

cd "$PROJECT_DIR"
"$DOCKER" info >/dev/null 2>&1 || fail "Docker Desktop 尚未运行。"
"$DOCKER" compose config --quiet || fail "配置文件有误，请检查 .env。"

# Build while the current application is still running. A bad .env must not
# replace a healthy backend before its database credentials are checked.
"$DOCKER" compose build backend migration frontend || fail "构建失败，请查看上方日志。"
if [ -z "$("$DOCKER" compose ps --status running -q db)" ]; then
  "$DOCKER" compose up -d db || fail "数据库未能启动。"
fi
if ! "$DOCKER" compose run --rm --no-deps migration python -c 'from sqlalchemy import create_engine; from app.core.config import get_settings; connection = create_engine(get_settings().database_url).connect(); connection.exec_driver_sql("SELECT 1"); connection.close()' >/dev/null 2>&1; then
  fail "无法用 .env 中的 DATABASE_URL 连接现有数据库。若只是添加 CAS 密钥，请保留原数据库密码，不要重新复制 .env.example。当前服务未切换。"
fi

"$DOCKER" compose up -d --wait --no-build || fail "服务启动失败，请查看上方日志。"
PORT=$("$DOCKER" compose port frontend 80 | /usr/bin/awk -F: 'END {print $NF}')
case "$PORT" in
  ''|*[!0-9]*) fail "无法确定浏览器端口。" ;;
esac
/usr/bin/curl --fail --silent --show-error --max-time 15 "http://127.0.0.1:$PORT/api/health/ready" >/dev/null || fail "服务启动后就绪检查失败。"
echo "RDMS 更新完成：http://127.0.0.1:$PORT/"
