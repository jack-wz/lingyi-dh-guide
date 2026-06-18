#!/bin/bash
# 启动零一数字人导购平台 API 网关（默认 :8000）

set -euo pipefail
cd "$(dirname "$0")"

echo "Starting Lingyi DH Guide API on http://127.0.0.1:8000"
echo "Docs: http://127.0.0.1:8000/docs"
exec uv run uvicorn api.app:app --host 127.0.0.1 --port 8000 --reload