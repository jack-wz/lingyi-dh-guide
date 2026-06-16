#!/usr/bin/env bash
# 零一数字人导购前端（React 编辑器）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT/guide"
export VITE_API_TARGET="${VITE_API_TARGET:-http://127.0.0.1:8000}"
npm run dev --workspace=web