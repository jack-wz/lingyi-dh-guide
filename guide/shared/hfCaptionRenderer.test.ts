import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateHyperframesHTML } from './hyperframesComposer.js';
import { HF_STYLE_BINDINGS } from './hfStyleRegistry.js';
import {
  buildCaptionWordTimings,
  renderCaptionHighlightClip,
  renderCaptionPillClip,
  renderCaptionPopClip,
  renderCaptionStaggerClip,
  renderCaptionMatrixDecodeClip,
  renderCaptionEmojiPopClip,
  renderCaptionGlitchRgbClip,
  renderCaptionKineticSlamClip,
  renderCaptionNeonAccentClip,
  renderCaptionParallaxLayersClip,
  renderCaptionParticleBurstClip,
  renderCaptionTextureClip,
  renderCaptionWeightShiftClip,
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

  it('renders caption-pop with bounce timeline', () => {
    const clip = renderCaptionPopClip({ ...BASE_CTX, styleId: 'hf-caption-pop' });
    assert.ok(clip);
    assert.match(clip!.html, /data-hf-component="caption-pop-bounce"/);
    assert.match(clip!.script, /back\.out\(2\.4\)/);
  });

  it('renders caption-stagger with slide timeline', () => {
    const clip = renderCaptionStaggerClip({ ...BASE_CTX, styleId: 'hf-caption-stagger' });
    assert.ok(clip);
    assert.match(clip!.html, /data-hf-component="caption-stagger-slide"/);
    assert.match(clip!.script, /power3\.out/);
  });

  it('marks pill karaoke layering for HF layout inspect', () => {
    const clip = renderCaptionPillClip({ ...BASE_CTX, styleId: 'hf-caption-pill' });
    assert.ok(clip);
    assert.match(clip!.html, /data-layout-allow-occlusion/);
    assert.match(clip!.script, /overwrite: 'auto'/);
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

  it('renders caption-matrix-decode with scramble timeline', () => {
    const clip = renderCaptionMatrixDecodeClip({ ...BASE_CTX, styleId: 'hf-caption-matrix-decode' });
    assert.ok(clip);
    assert.match(clip!.html, /data-hf-component="caption-matrix-decode"/);
    assert.match(clip!.script, /caption-matrix-decode-s1/);
    assert.ok(clip!.script.includes('gsap.timeline'));
  });

  it('renders caption-emoji-pop with emoji emphasis', () => {
    const clip = renderCaptionEmojiPopClip({ ...BASE_CTX, styleId: 'hf-caption-emoji-pop', emphasisWords: ['抢购'] });
    assert.ok(clip);
    assert.match(clip!.html, /data-hf-component="caption-emoji-pop"/);
    assert.match(clip!.html, /emoji-pop-emoji/);
    assert.ok(clip!.script.includes('gsap.timeline'));
  });

  it('renders caption-glitch-rgb with chromatic aberration', () => {
    const clip = renderCaptionGlitchRgbClip({ ...BASE_CTX, styleId: 'hf-caption-glitch-rgb' });
    assert.ok(clip);
    assert.match(clip!.html, /data-hf-component="caption-glitch-rgb"/);
    assert.match(clip!.css, /glitch-scanlines/);
    assert.ok(clip!.script.includes('gsap.timeline'));
  });

  it('renders caption-kinetic-slam with alternating entrances', () => {
    const clip = renderCaptionKineticSlamClip({ ...BASE_CTX, styleId: 'hf-caption-kinetic-slam' });
    assert.ok(clip);
    assert.match(clip!.html, /data-hf-component="caption-kinetic-slam"/);
    assert.match(clip!.script, /expo\.out/);
    assert.ok(clip!.script.includes('gsap.timeline'));
  });

  it('renders caption-neon-accent with glow classes', () => {
    const clip = renderCaptionNeonAccentClip({ ...BASE_CTX, styleId: 'hf-caption-neon-accent' });
    assert.ok(clip);
    assert.match(clip!.html, /data-hf-component="caption-neon-accent"/);
    assert.match(clip!.css, /nacc-word--accent/);
    assert.ok(clip!.script.includes('gsap.timeline'));
  });

  it('renders caption-parallax-layers with front and behind text', () => {
    const clip = renderCaptionParallaxLayersClip({ ...BASE_CTX, styleId: 'hf-caption-parallax-layers' });
    assert.ok(clip);
    assert.match(clip!.html, /data-hf-component="caption-parallax-layers"/);
    assert.match(clip!.html, /plx-front/);
    assert.match(clip!.html, /plx-behind/);
    assert.ok(clip!.script.includes('gsap.timeline'));
  });

  it('renders caption-particle-burst with particle elements', () => {
    const clip = renderCaptionParticleBurstClip({ ...BASE_CTX, styleId: 'hf-caption-particle-burst', emphasisWords: ['抢购'] });
    assert.ok(clip);
    assert.match(clip!.html, /data-hf-component="caption-particle-burst"/);
    assert.match(clip!.css, /ptb-particle/);
    assert.ok(clip!.script.includes('gsap.timeline'));
  });

  it('renders caption-texture with lava mask', () => {
    const clip = renderCaptionTextureClip({ ...BASE_CTX, styleId: 'hf-caption-texture' });
    assert.ok(clip);
    assert.match(clip!.html, /data-hf-component="caption-texture"/);
    assert.match(clip!.script, /compositions\/components\/lava\.png/);
    assert.ok(clip!.script.includes('gsap.timeline'));
  });

  it('renders caption-weight-shift with weight transition', () => {
    const clip = renderCaptionWeightShiftClip({ ...BASE_CTX, styleId: 'hf-caption-weight-shift' });
    assert.ok(clip);
    assert.match(clip!.html, /data-hf-component="caption-weight-shift"/);
    assert.match(clip!.script, /fontWeight/);
    assert.ok(clip!.script.includes('gsap.timeline'));
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