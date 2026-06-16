#!/usr/bin/env bash
# Guide platform dependency preflight — run before first start or smoke tests.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO_ROOT="$(cd "$ROOT/.." && pwd)"
FAIL=0

warn() { echo "WARN: $*" >&2; }
fail() { echo "FAIL: $*" >&2; FAIL=1; }
ok() { echo "OK: $*"; }

need_cmd() {
  local name="$1"
  local hint="$2"
  if command -v "$name" >/dev/null 2>&1; then
    ok "$name → $(command -v "$name")"
  else
    fail "$name not found. $hint"
  fi
}

echo "==> Guide preflight (repo: $REPO_ROOT)"

need_cmd curl "Install: brew install curl"
need_cmd node "Install: brew install node  (or https://nodejs.org)"
need_cmd npm "Comes with node"
if command -v uv >/dev/null 2>&1; then
  ok "uv → $(command -v uv)"
elif command -v python3 >/dev/null 2>&1; then
  ok "python3 → $(command -v python3) (uv recommended: brew install uv)"
else
  fail "Neither uv nor python3 found. Install: brew install uv"
fi

if command -v ffmpeg >/dev/null 2>&1; then
  ok "ffmpeg → $(command -v ffmpeg)"
else
  fail "ffmpeg not found. macOS: brew install ffmpeg-full  (subtitle smoke needs full build)"
fi

if [[ -f "$ROOT/.env" ]]; then
  ok "guide/.env exists"
else
  warn "guide/.env missing — copy guide/.env.example → guide/.env and fill API keys"
fi

if [[ -d "$ROOT/node_modules" ]] || [[ -d "$ROOT/web/node_modules" ]]; then
  ok "npm dependencies present"
else
  warn "Run: cd guide && npm install"
fi

API_URL="${SERVER_URL:-http://127.0.0.1:8000}"
if curl -sf "${API_URL}/api/guide/health" >/dev/null 2>&1; then
  ok "Guide API health (${API_URL}/api/guide/health)"
else
  warn "Guide API not reachable at $API_URL — start: ./start_platform.sh  or  make -C guide start-guide-internal"
fi

if [[ "$FAIL" -ne 0 ]]; then
  echo ""
  echo "Preflight failed. Fix the FAIL items above, then re-run:"
  echo "  guide/scripts/preflight.sh"
  exit 1
fi

echo ""
echo "Preflight passed."
exit 0