#!/bin/bash
# MuseNex 开发模式：用仓库根目录作为 app 入口，源码改动即时生效
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/.runtime/MuseNex.app"
if [ ! -d "$APP" ]; then
  echo "首次运行：准备 Electron 运行时…"
  node "$ROOT/scripts/bootstrap-runtime.mjs" || exit 1
fi
DEV_DATA="$HOME/Library/Application Support/MuseNex-dev"
CFG="$HOME/Library/Application Support/MuseNex/canvas-config.json"
if [ -f "$CFG" ]; then
  mkdir -p "$DEV_DATA"
  cp "$CFG" "$DEV_DATA/canvas-config.json"
fi
exec env -u ELECTRON_RUN_AS_NODE "$APP/Contents/MacOS/MuseNex" "$ROOT" \
  --user-data-dir="$DEV_DATA" \
  --remote-debugging-port="${MUSENEX_DEV_PORT:-9222}"
