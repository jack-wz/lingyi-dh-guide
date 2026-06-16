#!/usr/bin/env bash
# Pixelle-Video 统一启动：FastAPI 后端（含导购 API）+ 导购前端
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

export PIXELLE_PUBLIC_URL="${PIXELLE_PUBLIC_URL:-http://127.0.0.1:8000}"
export GUIDE_PLATFORM_ENABLED="${GUIDE_PLATFORM_ENABLED:-true}"
export GUIDE_WORKER_ENABLED="${GUIDE_WORKER_ENABLED:-true}"
export GUIDE_INTERNAL_PORT="${GUIDE_INTERNAL_PORT:-3001}"

echo "==> Pixelle API :8000 (guide API proxied at /api/templates|renders|digital-humans|...)"
./start_api.sh &
API_PID=$!

sleep 2
echo "==> Guide Web UI (Vite)"
export VITE_API_TARGET="$PIXELLE_PUBLIC_URL"
./start_guide_web.sh &
WEB_PID=$!

trap 'kill $API_PID $WEB_PID 2>/dev/null' INT TERM
wait