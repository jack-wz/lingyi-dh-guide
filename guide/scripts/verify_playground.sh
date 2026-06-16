#!/usr/bin/env bash
# Quick integrator surface check: API health + web /debug + smoke submit-only.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO_ROOT="$(cd "$ROOT/.." && pwd)"
API="${SERVER_URL:-http://127.0.0.1:8000}"
WEB="${GUIDE_WEB_URL:-http://127.0.0.1:5173}"

echo "==> verify-playground (API=$API WEB=$WEB)"
"$ROOT/scripts/preflight.sh"

code=$(curl -s -o /dev/null -w "%{http_code}" "$WEB/debug" || true)
if [[ "$code" != "200" ]]; then
  echo "FAIL: Guide web /debug returned HTTP $code (is Vite on :5173?)" >&2
  exit 1
fi
echo "OK: Playground page reachable ($WEB/debug)"

cd "$REPO_ROOT"
SUBMIT_ONLY=1 "$ROOT/scripts/smoke_integrator.sh"
echo "verify-playground: all checks passed"