# Guide platform — worker tests & render timeline QA
#
# Usage (from repo root):  make test-guide
#                          make validate-renders

ROOT := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
SCRIPTS := $(ROOT)/scripts
RENDERS_DIR := $(ROOT)/data/renders
AUDIT_JSON := $(ROOT)/data/render_jobs_audit.json
BATCH_JSON := $(ROOT)/data/batch_reassemble_report.json
RUN_PY := "$(SCRIPTS)/run_py.sh"
RUN_PYTEST := "$(SCRIPTS)/run_pytest.sh"
TEMPLATE_ID ?= 517a1920-6376-47ef-871b-9badbaa16b53
MIN_SEGMENTS ?= 4

.PHONY: help setup-worker-venv test-guide test-guide-fast test-guide-timeline smoke-brand-render smoke-integrator smoke-integrator-ci verify-playground lint-guide \
	validate-renders validate-renders-strict validate-renders-ci validate-render-job \
	batch-reassemble batch-reassemble-dry preflight

help:
	@echo "Guide Makefile targets:"
	@echo "  test-guide              Run all worker unit tests"
	@echo "  test-guide-fast         Timeline / ASS / audit unit tests only"
	@echo "  smoke-brand-render      E2E: brand TTF → ASS → FFmpeg MP4 (needs ffmpeg-full)"
	@echo "  smoke-integrator        Integrator smoke: health → POST render → poll (SUBMIT_ONLY=1 to skip poll)"
	@echo "  preflight               Check node/uv/ffmpeg and guide/.env"
	@echo "  smoke-integrator-ci     CI gate: preflight + compile smoke script (no live API)"
	@echo "  verify-playground       Preflight + /debug reachable + smoke submit-only"
	@echo "  validate-renders        Audit all jobs under data/renders (fail on errors)"
	@echo "  validate-renders-strict Also fail on warnings"
	@echo "  validate-renders-ci     CI gate: timeline/ASS/audit unit tests only"
	@echo "  validate-render-job     Audit one job (make validate-render-job JOB=<uuid>)"
	@echo "  batch-reassemble-dry    Preview jobs that would be reassembled"
	@echo "  batch-reassemble        Reassemble misaligned jobs (--needs-fix)"
	@echo "  setup-worker-venv       Install worker venv deps (requests, pytest, ...)"

setup-worker-venv:
	@"$(SCRIPTS)/setup_worker_venv.sh"

test-guide: setup-worker-venv
	$(RUN_PYTEST) guide/worker/tests -q

test-guide-timeline:
	$(RUN_PYTEST) \
		guide/worker/tests/test_timeline_sync.py \
		guide/worker/tests/test_ass_generator.py \
		guide/worker/tests/test_audit_render_job.py \
		guide/worker/tests/test_timeline_validate_pipeline.py \
		guide/worker/tests/test_whisper_aligner.py \
		-q

test-guide-fast: test-guide-timeline

smoke-brand-render: setup-worker-venv
	PATH="/opt/homebrew/opt/ffmpeg-full/bin:$$PATH" $(RUN_PYTEST) guide/worker/tests/test_brand_render_smoke.py -q

preflight:
	@"$(SCRIPTS)/preflight.sh"

smoke-integrator:
	@"$(SCRIPTS)/smoke_integrator.sh"

smoke-integrator-ci: preflight
	@$(RUN_PY) -m py_compile "$(SCRIPTS)/smoke_integrator.py"
	@echo "smoke-integrator-ci: preflight + py_compile passed"

verify-playground:
	@chmod +x "$(SCRIPTS)/verify_playground.sh" 2>/dev/null || true
	@"$(SCRIPTS)/verify_playground.sh"

lint-guide:
	@command -v ruff >/dev/null 2>&1 || { echo "ruff not installed; skip lint-guide"; exit 0; }
	ruff check "$(ROOT)/worker/worker" "$(SCRIPTS)"

validate-renders:
	$(RUN_PY) "$(SCRIPTS)/validate_render_jobs.py" \
		--renders-dir "$(RENDERS_DIR)" \
		--json-out "$(AUDIT_JSON)"

validate-renders-strict: validate-renders
	$(RUN_PY) "$(SCRIPTS)/validate_render_jobs.py" \
		--renders-dir "$(RENDERS_DIR)" \
		--json-out "$(AUDIT_JSON)" \
		--fail-on-warn

validate-renders-ci: test-guide-timeline
	@echo "validate-renders-ci: timeline unit tests passed"

validate-render-job:
	@test -n "$(JOB)" || { echo "Usage: make validate-render-job JOB=<job-uuid>"; exit 1; }
	$(RUN_PY) "$(SCRIPTS)/validate_render_jobs.py" \
		--renders-dir "$(RENDERS_DIR)" \
		--job "$(JOB)"

batch-reassemble-dry:
	$(RUN_PY) "$(SCRIPTS)/batch_reassemble.py" \
		--audit "$(AUDIT_JSON)" \
		--needs-fix \
		--min-segments $(MIN_SEGMENTS) \
		--template-id "$(TEMPLATE_ID)" \
		--dry-run

batch-reassemble:
	@test -f "$(AUDIT_JSON)" || $(MAKE) validate-renders
	$(RUN_PY) "$(SCRIPTS)/batch_reassemble.py" \
		--audit "$(AUDIT_JSON)" \
		--needs-fix \
		--min-segments $(MIN_SEGMENTS) \
		--template-id "$(TEMPLATE_ID)" \
		--json-out "$(BATCH_JSON)"
	@$(MAKE) validate-renders