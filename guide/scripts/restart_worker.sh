#!/usr/bin/env bash
# Restart the guide render worker (picks up latest worker/*.py without full API restart).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO_ROOT="$(cd "$ROOT/.." && pwd)"
DATA_DIR="${DATA_DIR:-$ROOT/data}"
GUIDE_PORT="${GUIDE_INTERNAL_PORT:-3001}"

resolve_server_url() {
  if [[ -n "${SERVER_URL:-}" ]]; then
    echo "$SERVER_URL"
    return
  fi
  if curl -sf "http://127.0.0.1:${GUIDE_PORT}/api/health" >/dev/null 2>&1; then
    echo "http://127.0.0.1:${GUIDE_PORT}"
    return
  fi
  if curl -sf "http://127.0.0.1:8000/api/guide/health" >/dev/null 2>&1; then
    echo "http://127.0.0.1:8000"
    return
  fi
  echo "http://127.0.0.1:${GUIDE_PORT}"
}

export SERVER_URL="$(resolve_server_url)"
export DATA_DIR

if pkill -f "run_worker.py" 2>/dev/null; then
  echo "Stopped existing worker(s)"
  sleep 1
fi

echo "Starting worker (SERVER_URL=$SERVER_URL)..."
cd "$REPO_ROOT"
nohup "$ROOT/scripts/run_py.sh" "$ROOT/worker/run_worker.py" >>"$DATA_DIR/worker.log" 2>&1 &
echo "Worker PID $! — tail -f $DATA_DIR/worker.log"