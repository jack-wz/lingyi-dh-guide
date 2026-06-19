#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO_ROOT="$(cd "$ROOT/.." && pwd)"
export PYTHONPATH="${ROOT}/worker"
cd "$REPO_ROOT"
if command -v uv >/dev/null 2>&1; then
  exec uv run pytest "$@"
fi
VENV_PY="${ROOT}/worker/.venv/bin/python3"
if [[ -x "${VENV_PY}" ]]; then
  exec "${VENV_PY}" -m pytest "$@"
fi
exec python3 -m pytest "$@"