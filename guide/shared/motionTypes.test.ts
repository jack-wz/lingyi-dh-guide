import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  judgeDeliveryMode,
  isDeliverableToVideo,
  sanitizeSvgSafelist,
  looksLikeLottieJson,
} from '../shared/types/motion.js';

describe('motion asset data model', () => {
  it('judgeDeliveryMode classifies interactivity vs export vs overlay', () => {
    assert.equal(judgeDeliveryMode('scale_pop', false), 'video_overlay');
    assert.equal(judgeDeliveryMode('mouse_follow', true), 'interactive_preview');
    assert.equal(judgeDeliveryMode('web_code_export', false), 'web_code');
  });

  it('isDeliverableToVideo only allows video_overlay', () => {
    assert.equal(isDeliverableToVideo('video_overlay'), true);
    assert.equal(isDeliverableToVideo('interactive_preview'), false);
    assert.equal(isDeliverableToVideo('web_code'), false);
  });

  it('sanitizeSvgSafelist blocks dangerous constructs', () => {
    const r = sanitizeSvgSafelist('<svg><script>alert(1)</script><rect onmouseover="evil"/><foreignObject/></svg>');
    assert.ok(r.blockers.some((b) => b.includes('script')));
    assert.ok(r.blockers.some((b) => b.includes('foreignObject') || b.includes('handler')));
    assert.ok(!r.clean.includes('<script'));
    assert.ok(!r.clean.includes('onmouseover'));
  });

  it('sanitizeSvgSafelist warns on external image href but keeps content', () => {
    const r = sanitizeSvgSafelist('<svg><image href="https://cdn/x.png"/></svg>');
    assert.ok(r.warnings.some((w) => w.includes('external')));
    assert.ok(!r.clean.includes('javascript:'));
  });

  it('looksLikeLottieJson detects lottie bodies', () => {
    assert.equal(looksLikeLottieJson('{"v":"5.0","layers":[]}'), true);
    assert.equal(looksLikeLottieJson('{"v":"5.0","fr":30,"assets":[]}'), true);
    assert.equal(looksLikeLottieJson('{"name":"not lottie"}'), false);
    assert.equal(looksLikeLottieJson(''), false);
  });
});