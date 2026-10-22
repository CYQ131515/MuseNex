#!/bin/bash
# 构建并安装 MuseNex 到 /Applications
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
node scripts/build-app.mjs --install
open -a "/Applications/MuseNex.app"
