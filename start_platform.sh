#!/usr/bin/env bash
# 零一数字人导购平台统一启动：FastAPI 网关（含导购 API）+ 导购前端
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

export PIXELLE_PUBLIC_URL="${PIXELLE_PUBLIC_URL:-http://127.0.0.1:8000}"
export GUIDE_PLATFORM_ENABLED="${GUIDE_PLATFORM_ENABLED:-true}"
export GUIDE_WORKER_ENABLED="${GUIDE_WORKER_ENABLED:-true}"
export GUIDE_INTERNAL_PORT="${GUIDE_INTERNAL_PORT:-3001}"

API_PID=""
WEB_PID=""

pixelle_api_up() {
  curl -sf "${PIXELLE_PUBLIC_URL}/docs" >/dev/null 2>&1 \
    || curl -sf "${PIXELLE_PUBLIC_URL}/api/health" >/dev/null 2>&1
}

guide_health_ok() {
  curl -sf "${PIXELLE_PUBLIC_URL}/api/guide/health" 2>/dev/null | grep -q '"status":"ok"'
}

if pixelle_api_up; then
  echo "==> API 网关已在 ${PIXELLE_PUBLIC_URL} 运行（跳过 start_api.sh）"
  if ! guide_health_ok; then
    echo "==> Guide upstream :${GUIDE_INTERNAL_PORT} down — running make start-guide-internal"
    make -C guide start-guide-internal
  else
    echo "==> Guide API healthy (${PIXELLE_PUBLIC_URL}/api/guide/health)"
  fi
else
  echo "==> API 网关 :8000（导购 API 代理：/api/templates|renders|digital-humans|...）"
  ./start_api.sh &
  API_PID=$!
  sleep 2
  if ! guide_health_ok; then
    echo "WARN: Guide health not ok yet — if :8000 was busy, run: make -C guide start-guide-internal" >&2
  fi
fi

echo "==> Guide Web UI (Vite on http://127.0.0.1:5173)"
export VITE_API_TARGET="$PIXELLE_PUBLIC_URL"
./start_guide_web.sh &
WEB_PID=$!

cleanup() {
  [[ -n "$API_PID" ]] && kill "$API_PID" 2>/dev/null || true
  [[ -n "$WEB_PID" ]] && kill "$WEB_PID" 2>/dev/null || true
}
trap cleanup INT TERM

echo ""
echo "Ready:"
echo "  API:    $PIXELLE_PUBLIC_URL"
echo "  Guide:  $PIXELLE_PUBLIC_URL/api/guide/health"
echo "  Web UI: http://127.0.0.1:5173"
echo "  Recovery (orphaned :8000): make -C guide start-guide-internal"
wait