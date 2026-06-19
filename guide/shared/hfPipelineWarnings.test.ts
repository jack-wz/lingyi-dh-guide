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
  it('warns for HF transitions and overlays on standard pipeline', () => {
    const warnings = getHyperframesPipelineWarnings(hfDsl, 'standard');
    assert.ok(warnings.some((w) => w.includes('动效转场')));
    assert.ok(warnings.some((w) => w.includes('全局质感')));
  });

  it('suppresses transition and overlay warnings on hyperframes_template', () => {
    const warnings = getHyperframesPipelineWarnings(hfDsl, 'hyperframes_template');
    assert.equal(warnings.some((w) => w.includes('动效转场')), false);
    assert.equal(warnings.some((w) => w.includes('全局质感')), false);
  });
});