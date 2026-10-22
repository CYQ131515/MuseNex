#!/usr/bin/env bash
# 启动本地画布服务（静态站点 + APIMart 代理）
#   ./start.sh [port]
# API Key 从 config.local.json 或环境变量 APIMART_API_KEY 读取，不会下发到浏览器。
set -euo pipefail
PORT="${1:-8099}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

NODE_BIN="${NODE_BIN:-}"
if [ -z "$NODE_BIN" ]; then
  for c in "$DIR/../tools/node/bin/node" "$(command -v node || true)"; do
    if [ -n "$c" ] && [ -x "$c" ]; then NODE_BIN="$c"; break; fi
  done
fi
if [ -z "$NODE_BIN" ]; then
  echo "未找到 node，可设置 NODE_BIN=/path/to/node" >&2
  exit 1
fi

echo "无限画布 → http://127.0.0.1:${PORT}/"
echo "API 代理  → APIMart（key 由 config.local.json / APIMART_API_KEY 提供）"
exec PORT="$PORT" "$NODE_BIN" "$DIR/server.mjs"
