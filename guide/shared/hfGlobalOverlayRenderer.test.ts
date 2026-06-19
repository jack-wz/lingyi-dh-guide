import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateHyperframesHTML } from './hyperframesComposer.js';
import {
  dslUsesHyperframesGlobalOverlays,
  getEnabledHfGlobalOverlays,
  renderGrainOverlay,
  renderHfGlobalOverlayClips,
} from './hfGlobalOverlayRenderer.js';

describe('hfGlobalOverlayRenderer', () => {
  it('normalizes and filters enabled overlays', () => {
    const enabled = getEnabledHfGlobalOverlays([
      { type: 'hf-grain', enabled: true, opacity: 0.2 },
      { type: 'hf-vignette', enabled: false },
    ]);
    assert.equal(enabled.length, 1);
    assert.equal(enabled[0].type, 'hf-grain');
  });

  it('renders grain overlay clip', () => {
    const clip = renderGrainOverlay(
      { type: 'hf-grain', enabled: true, opacity: 0.2 },
      { totalDuration: 10, canvasWidth: 1080, canvasHeight: 1920 },
    );
    assert.match(clip.html, /grain-overlay/);
    assert.match(clip.css, /opacity: 0\.2/);
  });

  it('composer embeds global overlays for full duration', () => {
    const html = generateHyperframesHTML({
      meta: { name: 'Overlay Test', type: 'smoke' },
      globalConfig: {
        canvas_width: 1080,
        canvas_height: 1920,
        fps: 30,
        bgm_url: '',
        bgm_volume: 0.3,
        background_color: '#111827',
        brand_color: '#2563eb',
        hf_overlays: [
          { type: 'hf-grain', enabled: true, opacity: 0.12 },
          { type: 'hf-vignette', enabled: true, intensity: 0.65, vignette_size: 42 },
        ],
      },
      segments: [
        {
          id: 's1',
          type: 'narration',
          narration_text: '测试',
          duration_sec: 5,
          scene_image_url: '',
          scene_description: '',
          subtitle: { enabled: false, style_id: 'default', position: 'bottom', animation: 'none' },
          transition: { type: 'none', duration: 0.5 },
          digital_human: { enabled: false, position: { x: 50, y: 80 }, scale: 100 },
          overlays: [],
        },
      ],
    });
    assert.match(html, /hf-global-grain/);
    assert.match(html, /hf-global-vignette/);
    assert.match(html, /data-duration="5"/);
    assert.equal(
      dslUsesHyperframesGlobalOverlays({
        globalConfig: {
          hf_overlays: [{ type: 'hf-vignette', enabled: true }],
        },
      }),
      true,
    );
  });

  it('returns empty output when all overlays disabled', () => {
    const clips = renderHfGlobalOverlayClips(
      [{ type: 'hf-grain', enabled: false }, { type: 'hf-vignette', enabled: false }],
      { totalDuration: 8, canvasWidth: 1080, canvasHeight: 1920 },
    );
    assert.equal(clips.html.trim(), '');
    assert.equal(clips.css.trim(), '');
  });
});