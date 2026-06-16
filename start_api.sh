#!/bin/bash
# 启动 Pixelle-Video HTTP API（纯 API 模式，默认 :8000）

set -euo pipefail
cd "$(dirname "$0")"

echo "Starting Pixelle-Video API on http://127.0.0.1:8000"
echo "Docs: http://127.0.0.1:8000/docs"
exec uv run uvicorn api.app:app --host 127.0.0.1 --port 8000 --reload