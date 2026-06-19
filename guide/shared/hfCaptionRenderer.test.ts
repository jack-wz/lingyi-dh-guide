import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateHyperframesHTML } from './hyperframesComposer.js';
import { HF_STYLE_BINDINGS } from './hfStyleRegistry.js';
import {
  buildCaptionWordTimings,
  renderCaptionHighlightClip,
  renderCaptionPillClip,
  renderHfCaptionClip,
  splitCaptionWords,
} from './hfCaptionRenderer.js';

const BASE_CTX = {
  segmentId: 's1',
  text: '限时特惠 立即抢购',
  clipStart: 0,
  clipDuration: 5,
  canvasWidth: 1080,
  canvasHeight: 1920,
  position: 'bottom' as const,
  fontFamily: 'PingFang SC',
  fontSizePx: 48,
  accentColor: '#2563eb',
  textColor: '#ffffff',
};

describe('hfCaptionRenderer', () => {
  it('splits Chinese narration into timed units', () => {
    const words = splitCaptionWords('限时特惠，立即抢购');
    assert.ok(words.length >= 2);
    const timings = buildCaptionWordTimings(words, 0.2, 3);
    assert.equal(timings.length, words.length);
    assert.ok(timings[0].start >= 0.2);
  });

  it('renders all registered hf caption adapters', () => {
    const captionBindings = HF_STYLE_BINDINGS.filter((binding) => binding.slot === 'subtitle');
    for (const binding of captionBindings) {
      const clip = renderHfCaptionClip({ ...BASE_CTX, styleId: binding.styleId });
      assert.ok(clip, `missing renderer for ${binding.styleId}`);
      assert.match(clip!.html, new RegExp(`data-hf-component="${binding.hfName}"`));
      assert.ok(clip!.script.includes('gsap.timeline'));
    }
  });

  it('renders caption-highlight with timeline id', () => {
    const clip = renderCaptionHighlightClip({ ...BASE_CTX, styleId: 'hf-caption-highlight' });
    assert.ok(clip);
    assert.match(clip!.html, /data-hf-component="caption-highlight"/);
    assert.match(clip!.script, /caption-highlight-s1/);
  });

  it('scales caption layout for narrow vertical canvases', () => {
    const ref = renderCaptionPillClip({ ...BASE_CTX, styleId: 'hf-caption-pill' });
    const narrow = renderCaptionPillClip({
      ...BASE_CTX,
      styleId: 'hf-caption-pill',
      canvasWidth: 720,
      canvasHeight: 1280,
      fontSizePx: 36,
    });
    assert.ok(ref && narrow);
    const refPad = ref!.css.match(/padding: (\d+)px/)?.[1];
    const narrowPad = narrow!.css.match(/padding: (\d+)px/)?.[1];
    assert.ok(refPad && narrowPad);
    assert.ok(Number(narrowPad) < Number(refPad));
  });
});

describe('hyperframesComposer hf captions', () => {
  it('embeds GSAP for each hyperframes subtitle style', () => {
    const captionBindings = HF_STYLE_BINDINGS.filter((binding) => binding.slot === 'subtitle');
    for (const binding of captionBindings) {
      const html = generateHyperframesHTML({
        meta: { name: 'HF Style Test', type: 'smoke' },
        globalConfig: {
          canvas_width: 1080,
          canvas_height: 1920,
          fps: 30,
          bgm_url: '',
          bgm_volume: 0.3,
          background_color: '#111827',
          brand_color: '#ff1745',
        },
        segments: [
          {
            id: 's1',
            type: 'narration',
            narration_text: '限时特惠 立即抢购',
            duration_sec: 5,
            scene_image_url: '',
            scene_description: '',
            subtitle: { enabled: true, style_id: binding.styleId, position: 'bottom', animation: 'fadeIn' },
            transition: { type: 'none', duration: 0.5 },
            digital_human: { enabled: false, position: { x: 50, y: 80 }, scale: 100 },
            overlays: [],
          },
        ],
      });
      assert.match(html, /gsap@3\.14\.2/);
      assert.match(html, new RegExp(`data-hf-component="${binding.hfName}"`));
    }
  });
});