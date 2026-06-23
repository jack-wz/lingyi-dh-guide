import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validatePlan, applySlots, compileLottie, SUPPORTED_ANIMATIONS } from './lottieCompiler.js';

const PLAN = {
  durationMs: 1800, fps: 30,
  elements: [
    { selector: '#price-badge', animation: 'scale_pop', from: 0, to: 420 },
    { selector: '#spark', animation: 'opacity_twinkle', from: 300, to: 1200 },
  ],
  slots: [{ id: 'accent_color', type: 'color', default: '#ff6a00' }, { id: 'label_text', type: 'text', default: '限时优惠' }],
  fallback: 'static_svg',
};

describe('text-to-lottie compiler', () => {
  it('validatePlan accepts a valid plan', () => {
    const r = validatePlan(PLAN as any);
    assert.equal(r.blockers.length, 0);
  });

  it('validatePlan rejects unsupported animation and bad duration', () => {
    const bad = { durationMs: -1, fps: 30, elements: [{ selector: 'x', animation: 'explode', from: 0, to: 10 }], slots: [] };
    const r = validatePlan(bad as any);
    assert.ok(r.blockers.some((b) => b.includes('durationMs')));
    assert.ok(r.blockers.some((b) => b.includes('unsupported animation')));
  });

  it('applySlots merges overrides over defaults', () => {
    const merged = applySlots(PLAN as any, { label_text: '新优惠' });
    assert.equal(merged.accent_color, '#ff6a00');
    assert.equal(merged.label_text, '新优惠');
  });

  it('compileLottie emits a valid Lottie body with poster frames + slot color', () => {
    const res = compileLottie(PLAN as any, '<svg><rect/></svg>');
    assert.equal(res.blockers.length, 0);
    assert.ok(res.lottie.v);
    assert.equal(res.lottie.fr, 30);
    assert.ok((res.lottie.layers as unknown[]).length >= PLAN.elements.length);
    assert.deepEqual(res.posterFrames.length, 3);
    assert.match(JSON.stringify(res.lottie), /scale_pop|opacity_twinkle|static/);
  });

  it('compileLottie downgrades unsafe SVG and surfaces blockers', () => {
    const res = compileLottie(PLAN as any, '<svg><script>alert(1)</script></svg>');
    assert.ok(res.blockers.some((b) => b.includes('script')));
  });

  it('SUPPORTED_ANIMATIONS gates accepted animations', () => {
    assert.ok(SUPPORTED_ANIMATIONS.has('scale_pop'));
    assert.ok(!SUPPORTED_ANIMATIONS.has('mouse_follow'));
  });
});