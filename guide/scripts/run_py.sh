#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO_ROOT="$(cd "$ROOT/.." && pwd)"
export PYTHONPATH="${ROOT}/worker"
cd "$REPO_ROOT"
if command -v uv >/dev/null 2>&1; then
  exec uv run python "$@"
fi
exec python3 "$@"