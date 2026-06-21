import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_EDITOR_PIPELINE_KEY,
  resolveDiagnosticsPipelineKey,
  resolveEditorPipelineKey,
  resolveEditorRenderPipelineKey,
} from './pipelines.js';

describe('editor pipeline resolution', () => {
  it('normalizes legacy meta keys to template_editor', () => {
    assert.equal(resolveEditorPipelineKey(undefined), DEFAULT_EDITOR_PIPELINE_KEY);
    assert.equal(resolveEditorPipelineKey('avatar_talk'), DEFAULT_EDITOR_PIPELINE_KEY);
    assert.equal(resolveEditorPipelineKey('digital_human'), DEFAULT_EDITOR_PIPELINE_KEY);
    assert.equal(resolveEditorPipelineKey('hyperframes_template'), DEFAULT_EDITOR_PIPELINE_KEY);
  });

  it('derives render pipeline from input mode only', () => {
    assert.equal(resolveEditorRenderPipelineKey('template'), 'template_editor');
    assert.equal(resolveEditorRenderPipelineKey('topic'), 'ai_full_auto');
    assert.equal(resolveEditorRenderPipelineKey('script'), 'ai_full_auto');
  });

  it('maps template_editor diagnostics to standard', () => {
    assert.equal(resolveDiagnosticsPipelineKey('template_editor'), 'standard');
    assert.equal(resolveDiagnosticsPipelineKey('avatar_talk'), 'avatar_talk');
  });
});