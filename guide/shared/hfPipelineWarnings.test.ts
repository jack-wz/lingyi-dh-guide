import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getHyperframesPipelineWarnings } from './hfPipelineWarnings.js';

const hfDsl = {
  meta: { pipeline_key: 'standard' },
  globalConfig: {
    hf_overlays: [{ type: 'hf-grain', enabled: true, opacity: 0.1 }],
  },
  segments: [
    {
      narration_text: '测试口播',
      subtitle: { enabled: true, style_id: 'hf-caption-pill' },
      transition: { type: 'hf-zoom' },
    },
    { transition: { type: 'none' } },
  ],
};

describe('hfPipelineWarnings', () => {
  it('does not warn for HF features on standard/template_editor pipelines', () => {
    assert.deepEqual(getHyperframesPipelineWarnings(hfDsl, 'standard'), []);
    assert.deepEqual(getHyperframesPipelineWarnings(hfDsl, 'template_editor'), []);
  });

  it('warns when hyperframes_template pipeline skips scene generation', () => {
    const warnings = getHyperframesPipelineWarnings(hfDsl, 'hyperframes_template');
    assert.ok(warnings.some((w) => w.includes('跳过场景图')));
  });
});