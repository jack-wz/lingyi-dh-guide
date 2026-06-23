import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { compileGsap, validateSpec, SUPPORTED_GSAP_TYPES, GSAP_CSP } from './gsapCompiler.js';

const baseSpec: any = {
  id: 's1', type: 'price_pop', description: 'price badge pops then breathes',
  durationMs: 1800, fps: 30, canvas: { width: 1080, height: 1920 },
  interactive: false, reducedMotionFallback: true,
  elements: [{ id: 'badge', animation: 'pop', fromMs: 0, toMs: 420 }],
};

describe('gsap motion compiler', () => {
  it('compileGsap emits a deterministic timeline for time-driven spec', () => {
    const r = compileGsap(baseSpec);
    assert.equal(r.blockers.length, 0);
    assert.equal(r.deliveryMode, 'video_overlay');
    assert.equal(r.deliverableToVideo, true);
    assert.match(r.code, /gsap.timeline/);
    assert.match(r.code, /fromTo/);
    assert.match(r.code, /prefers-reduced-motion/);
    assert.ok(!r.code.includes('eval('));
  });

  it('mouse_follow must be interactive and is NOT deliverable to video', () => {
    const spec = { ...baseSpec, type: 'mouse_follow', interactive: true, elements: [{ id: 'glow', animation: 'follow', fromMs: 0, toMs: 1000 }] };
    const r = compileGsap(spec);
    assert.equal(r.blockers.length, 0);
    assert.equal(r.deliveryMode, 'interactive_preview');
    assert.equal(r.deliverableToVideo, false);
  });

  it('mouse_follow interactive=false is blocked', () => {
    const spec = { ...baseSpec, type: 'mouse_follow', interactive: false, elements: [{ id: 'g', animation: 'follow', fromMs: 0, toMs: 100 }] };
    const r = compileGsap(spec);
    assert.ok(r.blockers.some((b) => b.includes('must be interactive')));
    assert.equal(r.code, '');
  });

  it('validateSpec rejects unsupported type and bad canvas', () => {
    const v = validateSpec({ ...baseSpec, type: 'explode_whatever' as any } as any);
    assert.ok(v.blockers.some((b) => b.includes('unsupported gsap type')));
    const v2 = validateSpec({ ...baseSpec, canvas: { width: 0, height: 10 } } as any);
    assert.ok(v2.blockers.some((b) => b.includes('canvas')));
  });

  it('SUPPORTED_GSAP_TYPES + CSP lock the vocabulary', () => {
    assert.ok(SUPPORTED_GSAP_TYPES.has('price_pop'));
    assert.ok(!SUPPORTED_GSAP_TYPES.has('arbitrary_js' as any));
    assert.match(GSAP_CSP, /script-src 'self' 'unsafe-inline'/);
    assert.match(GSAP_CSP, /connect-src 'self'/);
  });
});