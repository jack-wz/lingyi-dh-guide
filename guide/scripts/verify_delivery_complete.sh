#!/usr/bin/env bash
# Full FFmpeg single-path delivery gate — run before release/tag.
set -euo pipefail

GUIDE_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO_ROOT="$(cd "$GUIDE_ROOT/.." && pwd)"
REFERENCE_JOB="${REFERENCE_JOB:-c6b0e511-1b11-41d7-bbe9-3cd8b47db350}"
MF="make -f guide/Makefile"

echo "==> verify-delivery-complete (reference job: $REFERENCE_JOB)"
cd "$REPO_ROOT"

$MF test-guide-shared
$MF test-guide-fast
$MF test-guide-server
$MF smoke-integrator-ci

if [[ -f "$GUIDE_ROOT/data/renders/job_${REFERENCE_JOB}/final.mp4" ]]; then
  $MF verify-final-delivery JOB="$REFERENCE_JOB"
  $MF validate-render-job JOB="$REFERENCE_JOB"
else
  echo "WARN: reference final.mp4 missing — skip verify-final-delivery (run smoke-integrator first)"
fi

cd "$GUIDE_ROOT/web" && npm run test:e2e

echo "==> verify-delivery-complete: ALL GATES PASSED"