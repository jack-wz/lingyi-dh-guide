#!/usr/bin/env bash
# Wrapper for integrator smoke — records wall time and delegates to Python.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO_ROOT="$(cd "$ROOT/.." && pwd)"
START_EPOCH=$(date +%s)
export SERVER_URL="${SERVER_URL:-http://127.0.0.1:8000}"
export SMOKE_TEMPLATE_ID="${SMOKE_TEMPLATE_ID:-517a1920-6376-47ef-871b-9badbaa16b53}"
export SMOKE_POLL_TIMEOUT_SEC="${SMOKE_POLL_TIMEOUT_SEC:-3600}"
export SUBMIT_ONLY="${SUBMIT_ONLY:-}"

cd "$REPO_ROOT"
ARGS=()
if [[ "${SUBMIT_ONLY}" == "1" ]]; then
  ARGS+=(--submit-only)
fi

echo "==> smoke-integrator (API=$SERVER_URL template=$SMOKE_TEMPLATE_ID)"
if ((${#ARGS[@]} > 0)); then
  "$ROOT/scripts/run_py.sh" "$ROOT/scripts/smoke_integrator.py" "${ARGS[@]}"
else
  "$ROOT/scripts/run_py.sh" "$ROOT/scripts/smoke_integrator.py"
fi
RC=$?
END_EPOCH=$(date +%s)
WALL=$((END_EPOCH - START_EPOCH))
echo "SMOKE_WALL_CLOCK_SEC=${WALL}"
exit $RC