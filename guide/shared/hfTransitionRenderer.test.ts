import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateHyperframesHTML } from './hyperframesComposer.js';
import {
  dslUsesHyperframesTransitions,
  isHyperframesTransitionType,
  renderDissolveTransition,
  renderHfTransitionClip,
} from './hfTransitionRenderer.js';

describe('hfTransitionRenderer', () => {
  it('detects hyperframes transition types', () => {
    assert.equal(isHyperframesTransitionType('hf-dissolve'), true);
    assert.equal(isHyperframesTransitionType('fade'), false);
  });

  it('renders dissolve transition clip', () => {
    const clip = renderDissolveTransition({
      segmentId: 's1',
      transitionType: 'hf-dissolve',
      clipStart: 4.5,
      clipDuration: 0.5,
      canvasWidth: 1080,
      canvasHeight: 1920,
      accentColor: '#2563eb',
    });
    assert.match(clip.html, /data-hf-component="transitions-dissolve"/);
    assert.match(clip.script, /dissolve-veil/);
  });

  it('composer embeds transition between segments', () => {
    const html = generateHyperframesHTML({
      meta: { name: 'Transition Test', type: 'smoke' },
      globalConfig: {
        canvas_width: 1080,
        canvas_height: 1920,
        fps: 30,
        bgm_url: '',
        bgm_volume: 0.3,
        background_color: '#111827',
        brand_color: '#2563eb',
        transition_enabled: true,
      },
      segments: [
        {
          id: 's1',
          type: 'narration',
          narration_text: '第一段',
          duration_sec: 5,
          scene_image_url: '',
          scene_description: '',
          subtitle: { enabled: false, style_id: 'default', position: 'bottom', animation: 'none' },
          transition: { type: 'hf-dissolve', duration: 0.6 },
          digital_human: { enabled: false, position: { x: 50, y: 80 }, scale: 100 },
          overlays: [],
        },
        {
          id: 's2',
          type: 'narration',
          narration_text: '第二段',
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
    assert.match(html, /hf-trans-dissolve/);
    assert.match(html, /gsap@3\.14\.2/);
    assert.equal(
      dslUsesHyperframesTransitions({
        globalConfig: { transition_enabled: true },
        segments: [
          { transition: { type: 'hf-dissolve' } },
          { transition: { type: 'none' } },
        ],
      }),
      true,
    );
  });

  it('renders push variants', () => {
    for (const type of ['hf-push', 'hf-push-left', 'hf-push-right', 'hf-push-up', 'hf-push-down']) {
      const clip = renderHfTransitionClip({
        segmentId: 's1',
        transitionType: type,
        clipStart: 1,
        clipDuration: 0.8,
        canvasWidth: 1080,
        canvasHeight: 1920,
        accentColor: '#ff1745',
      });
      assert.ok(clip);
      assert.match(clip!.html, /transitions-push/);
    }
  });

  it('renders zoom transition clip', () => {
    const clip = renderHfTransitionClip({
      segmentId: 's1',
      transitionType: 'hf-zoom',
      clipStart: 2,
      clipDuration: 0.6,
      canvasWidth: 1080,
      canvasHeight: 1920,
      accentColor: '#2563eb',
    });
    assert.ok(clip);
    assert.match(clip!.html, /transitions-zoom/);
    assert.equal(isHyperframesTransitionType('hf-zoom'), true);
  });
});