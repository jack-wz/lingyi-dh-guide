#!/usr/bin/env bash
# Start guide Express (:3001) + render worker when FastAPI :8000 is already running
# but embedded guide subprocess did not come up (e.g. port 8000 was already in use).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO_ROOT="$(cd "$ROOT/.." && pwd)"
PORT="${GUIDE_INTERNAL_PORT:-3001}"
API="${SERVER_URL:-http://127.0.0.1:8000}"
DATA_DIR="${DATA_DIR:-$ROOT/data}"

health_code() {
  curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${PORT}/api/health" 2>/dev/null || echo "000"
}

if [[ "$(health_code)" == "200" ]]; then
  echo "OK: Guide server already listening on :${PORT}"
else
  echo "==> Starting guide server on :${PORT} (API proxy at ${API})"
  mkdir -p "$DATA_DIR/uploads" "$DATA_DIR/renders"
  cd "$ROOT"
  PORT="$PORT" SERVER_URL="$API" DATA_DIR="$DATA_DIR" DISABLE_RENDER_WORKER=1 \
    nohup npm run dev --workspace=server >>"$DATA_DIR/guide-server.log" 2>&1 &
  echo "Guide server PID $! — tail -f $DATA_DIR/guide-server.log"

  for _ in $(seq 1 20); do
    if [[ "$(health_code)" == "200" ]]; then
      echo "OK: Guide server healthy"
      break
    fi
    sleep 1
  done
  if [[ "$(health_code)" != "200" ]]; then
    echo "FAIL: Guide server did not become healthy on :${PORT}" >&2
    exit 1
  fi
fi

proxy_code=$(curl -s -o /dev/null -w "%{http_code}" "${API}/api/guide/health" 2>/dev/null || echo "000")
if [[ "$proxy_code" != "200" ]]; then
  echo "WARN: ${API}/api/guide/health returned HTTP ${proxy_code} — FastAPI may need restart to pick up :${PORT}" >&2
fi

if [[ "${GUIDE_WORKER_ENABLED:-true}" =~ ^(1|true|yes)$ ]]; then
  "$ROOT/scripts/restart_worker.sh"
fi

echo "start_internal: guide stack ready (server :${PORT}, worker log $DATA_DIR/worker.log)"