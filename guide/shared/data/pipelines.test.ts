import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveEditorPipelineKey,
  resolveEditorRenderPipelineKey,
  resolveDiagnosticsPipelineKey,
  DEFAULT_EDITOR_PIPELINE_KEY,
  getExposedPipelines,
  validatePipelineKey,
} from './pipelines.js';

describe('pipeline routing contract', () => {
  it('editor always resolves to template_editor regardless of saved key', () => {
    assert.equal(resolveEditorPipelineKey('standard'), DEFAULT_EDITOR_PIPELINE_KEY);
    assert.equal(resolveEditorPipelineKey('digital_human'), DEFAULT_EDITOR_PIPELINE_KEY);
    assert.equal(resolveEditorPipelineKey(undefined), DEFAULT_EDITOR_PIPELINE_KEY);
    assert.equal(resolveEditorPipelineKey('ai_full_auto'), DEFAULT_EDITOR_PIPELINE_KEY);
  });

  it('editor render routes template mode to template_editor', () => {
    assert.equal(resolveEditorRenderPipelineKey('template'), 'template_editor');
  });

  it('editor render routes topic/script mode to ai_full_auto', () => {
    assert.equal(resolveEditorRenderPipelineKey('topic'), 'ai_full_auto');
    assert.equal(resolveEditorRenderPipelineKey('script'), 'ai_full_auto');
  });

  it('diagnostics key maps template_editor to standard', () => {
    assert.equal(resolveDiagnosticsPipelineKey('template_editor'), 'standard');
    assert.equal(resolveDiagnosticsPipelineKey('standard'), 'standard');
    assert.equal(resolveDiagnosticsPipelineKey('ai_full_auto'), 'ai_full_auto');
  });

  it('hyperframes_template is hidden unless ENABLE_HF_TEMPLATE_PIPELINE=1', () => {
    const exposed = getExposedPipelines();
    const keys = exposed.map((p) => p.key);
    assert.ok(!keys.includes('hyperframes_template'));
  });

  it('template_editor is in exposed pipelines', () => {
    const exposed = getExposedPipelines();
    const keys = exposed.map((p) => p.key);
    assert.ok(keys.includes('template_editor'));
    assert.ok(keys.includes('standard'));
    assert.ok(keys.includes('ai_full_auto'));
  });

  it('validatePipelineKey accepts known pipelines', () => {
    assert.ok(validatePipelineKey('template_editor'));
    assert.ok(validatePipelineKey('standard'));
    assert.ok(validatePipelineKey('ai_full_auto'));
    assert.ok(!validatePipelineKey('unknown_pipeline'));
  });
});
