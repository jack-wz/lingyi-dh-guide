import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateHyperframesHTML } from './hyperframesComposer.js';
import {
  dslUsesHyperframesGlobalOverlays,
  getEnabledHfGlobalOverlays,
  renderGrainOverlay,
  renderLightLeakOverlay,
  renderMotionBlurOverlay,
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

  it('scales light leak blur on narrow canvases', () => {
    const ref = renderLightLeakOverlay(
      { type: 'hf-light-leak', enabled: true, leak_intensity: 0.5 },
      { totalDuration: 8, canvasWidth: 1080, canvasHeight: 1920, accentColor: '#fb8b24' },
    );
    const narrow = renderLightLeakOverlay(
      { type: 'hf-light-leak', enabled: true, leak_intensity: 0.5 },
      { totalDuration: 8, canvasWidth: 720, canvasHeight: 1280, accentColor: '#fb8b24' },
    );
    const refBlur = Number(ref.css.match(/blur\((\d+)px\)/)?.[1] || 0);
    const narrowBlur = Number(narrow.css.match(/blur\((\d+)px\)/)?.[1] || 0);
    assert.ok(refBlur > 0 && narrowBlur > 0);
    assert.ok(narrowBlur < refBlur);
    assert.match(narrow.css, /width: 78%/);
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
      [
        { type: 'hf-grain', enabled: false },
        { type: 'hf-vignette', enabled: false },
        { type: 'hf-light-leak', enabled: false },
        { type: 'hf-motion-blur', enabled: false },
      ],
      { totalDuration: 8, canvasWidth: 1080, canvasHeight: 1920 },
    );
    assert.equal(clips.html.trim(), '');
    assert.equal(clips.css.trim(), '');
    assert.equal(clips.scripts.length, 0);
  });

  it('renders light leak and motion blur with GSAP', () => {
    const leak = renderLightLeakOverlay(
      { type: 'hf-light-leak', enabled: true, leak_intensity: 0.5, leak_color: '#ff5600' },
      { totalDuration: 10, canvasWidth: 1080, canvasHeight: 1920, accentColor: '#ff5600' },
    );
    assert.match(leak.html, /light-leak/);
    assert.match(leak.script || '', /hf-light-leak-a/);

    const blur = renderMotionBlurOverlay(
      { type: 'hf-motion-blur', enabled: true, blur_intensity: 0.4, direction: 'vertical' },
      { totalDuration: 10, canvasWidth: 1080, canvasHeight: 1920 },
    );
    assert.match(blur.html, /motion-blur/);
    assert.match(blur.css, /scaleY/);

    const html = generateHyperframesHTML({
      meta: { name: 'VFX Test', type: 'smoke' },
      globalConfig: {
        canvas_width: 1080,
        canvas_height: 1920,
        fps: 30,
        bgm_url: '',
        bgm_volume: 0.3,
        background_color: '#111827',
        brand_color: '#fb8b24',
        hf_overlays: [
          { type: 'hf-light-leak', enabled: true, leak_intensity: 0.55 },
          { type: 'hf-motion-blur', enabled: true, blur_intensity: 0.4 },
        ],
      },
      segments: [
        {
          id: 's1',
          type: 'narration',
          narration_text: '测试',
          duration_sec: 6,
          scene_image_url: '',
          scene_description: '',
          subtitle: { enabled: false, style_id: 'default', position: 'bottom', animation: 'none' },
          transition: { type: 'none', duration: 0.5 },
          digital_human: { enabled: false, position: { x: 50, y: 80 }, scale: 100 },
          overlays: [],
        },
      ],
    });
    assert.match(html, /hf-global-light-leak/);
    assert.match(html, /hf-global-motion-blur/);
    assert.match(html, /gsap@3\.14\.2/);
  });
});