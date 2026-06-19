import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateHyperframesHTML } from './hyperframesComposer.js';
import {
  buildCaptionWordTimings,
  renderCaptionHighlightClip,
  splitCaptionWords,
} from './hfCaptionRenderer.js';

describe('hfCaptionRenderer', () => {
  it('splits Chinese narration into timed units', () => {
    const words = splitCaptionWords('限时特惠，立即抢购');
    assert.ok(words.length >= 2);
    const timings = buildCaptionWordTimings(words, 0.2, 3);
    assert.equal(timings.length, words.length);
    assert.ok(timings[0].start >= 0.2);
  });

  it('renders caption-highlight clip with timeline id and component marker', () => {
    const clip = renderCaptionHighlightClip({
      styleId: 'hf-caption-highlight',
      segmentId: 's1',
      text: '欢迎选购新品',
      clipStart: 0,
      clipDuration: 5,
      canvasWidth: 1080,
      canvasHeight: 1920,
      position: 'bottom',
      fontFamily: 'PingFang SC',
      fontSizePx: 48,
      accentColor: '#2563eb',
      textColor: '#ffffff',
    });
    assert.ok(clip);
    assert.match(clip!.html, /data-hf-component="caption-highlight"/);
    assert.match(clip!.html, /hl-word-text">新</);
    assert.match(clip!.script, /caption-highlight-s1/);
  });
});

describe('hyperframesComposer hf captions', () => {
  it('embeds GSAP and hf caption markup for hyperframes subtitle style', () => {
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
          subtitle: { enabled: true, style_id: 'hf-caption-highlight', position: 'bottom', animation: 'fadeIn' },
          transition: { type: 'none', duration: 0.5 },
          digital_human: { enabled: false, position: { x: 50, y: 80 }, scale: 100 },
          overlays: [],
        },
      ],
    });
    assert.match(html, /gsap@3\.14\.2/);
    assert.match(html, /data-hf-component="caption-highlight"/);
    assert.match(html, /window\.__timelines/);
  });
});