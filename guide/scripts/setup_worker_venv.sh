#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENV="${ROOT}/worker/.venv"
PY="${VENV}/bin/python3"

if [[ ! -x "${PY}" ]]; then
  python3 -m venv "${VENV}"
fi

"${PY}" -m pip install -U pip
"${PY}" -m pip install -r "${ROOT}/worker/requirements.txt"

echo "Worker venv ready: ${PY}"
"${PY}" -c "import requests; print('requests:', requests.__version__)"