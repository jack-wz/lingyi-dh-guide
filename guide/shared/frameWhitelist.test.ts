import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getBrandFrameWhitelist,
  validateSegmentFrames,
  validateDslFrames,
} from './frameWhitelist.js';

describe('frame whitelist validation', () => {
  it('empty brand pack allows all frames', () => {
    const result = validateSegmentFrames(
      [{ frame_template_id: 'random' }],
      { frames: [] },
    );
    assert.ok(result.valid);
    assert.equal(result.violations.length, 0);
  });

  it('undefined brand pack allows all frames', () => {
    const result = validateSegmentFrames(
      [{ frame_template_id: 'anything' }],
      undefined,
    );
    assert.ok(result.valid);
  });

  it('segments with whitelisted frames pass', () => {
    const result = validateSegmentFrames(
      [{ frame_template_id: 'close-up' }, { frame_template_id: 'wide' }],
      { frames: [{ frame_template_id: 'close-up' }, { frame_template_id: 'wide' }] },
    );
    assert.ok(result.valid);
    assert.equal(result.violations.length, 0);
  });

  it('segments with non-whitelisted frames are rejected', () => {
    const result = validateSegmentFrames(
      [{ frame_template_id: 'close-up' }, { frame_template_id: 'drone-shot' }],
      { frames: [{ frame_template_id: 'close-up' }, { frame_template_id: 'wide' }] },
    );
    assert.ok(!result.valid);
    assert.equal(result.violations.length, 1);
    assert.equal(result.violations[0].index, 1);
    assert.equal(result.violations[0].frame, 'drone-shot');
  });

  it('validateDslFrames checks full DSL', () => {
    const result = validateDslFrames({
      segments: [{ frame_template_id: 'bad-frame' }],
      globalConfig: { brand_pack: { frames: [{ frame_template_id: 'good-frame' }] } },
    });
    assert.ok(!result.valid);
    assert.equal(result.violations[0].frame, 'bad-frame');
  });

  it('getBrandFrameWhitelist returns set of ids', () => {
    const wl = getBrandFrameWhitelist({ frames: [{ frame_template_id: 'a' }, { frame_template_id: 'b' }] });
    assert.ok(wl.has('a'));
    assert.ok(wl.has('b'));
    assert.ok(!wl.has('c'));
    assert.equal(wl.size, 2);
  });
});
