# Pixelle-Video — top-level Makefile (delegates guide targets)
#
# Examples:
#   make test-guide
#   make validate-renders
#   make validate-renders-ci
#   make batch-reassemble-dry

GUIDE_DIR := guide

.PHONY: help test-guide test-guide-fast test-guide-timeline smoke-brand-render smoke-integrator smoke-integrator-ci verify-playground restart-worker preflight lint-guide \
	validate-renders validate-renders-strict validate-renders-ci validate-render-job \
	batch-reassemble batch-reassemble-dry

help:
	@$(MAKE) -C $(GUIDE_DIR) help

test-guide test-guide-fast test-guide-timeline smoke-brand-render smoke-integrator smoke-integrator-ci verify-playground restart-worker preflight lint-guide \
validate-renders validate-renders-strict validate-renders-ci validate-render-job \
batch-reassemble batch-reassemble-dry:
	@$(MAKE) -C $(GUIDE_DIR) $@