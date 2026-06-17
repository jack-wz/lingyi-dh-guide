#!/usr/bin/env bash
# Restart the guide render worker (picks up latest worker/*.py without full API restart).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO_ROOT="$(cd "$ROOT/.." && pwd)"
export SERVER_URL="${SERVER_URL:-http://127.0.0.1:8000}"
export DATA_DIR="${DATA_DIR:-$ROOT/data}"

if pkill -f "run_worker.py" 2>/dev/null; then
  echo "Stopped existing worker(s)"
  sleep 1
fi

echo "Starting worker (SERVER_URL=$SERVER_URL)..."
cd "$REPO_ROOT"
nohup "$ROOT/scripts/run_py.sh" "$ROOT/worker/run_worker.py" >>"$DATA_DIR/worker.log" 2>&1 &
echo "Worker PID $! — tail -f $DATA_DIR/worker.log"