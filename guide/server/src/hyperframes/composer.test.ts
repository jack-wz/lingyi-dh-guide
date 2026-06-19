import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateHyperframesHTML } from './composer.js';
import type { DSL } from '@shared/types/editor';

function makeDsl(): DSL {
  return {
    meta: {
      id: 'template-1',
      name: 'HyperFrames Preview',
      type: 'test',
      version: 1,
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    },
    globalConfig: {
      canvas_width: 1080,
      canvas_height: 1920,
      fps: 30,
      bgm_url: '',
      bgm_volume: 0.3,
      output_format: 'mp4',
      background_color: '#f5f1ec',
    },
    variables: [],
    segments: [
      {
        id: 'seg-1',
        type: 'narration',
        narration_text: '欢迎了解产品',
        duration_sec: 5,
        scene_image_url: '',
        scene_description: '',
        camera_shot: '',
        segment_bgm_url: '',
        subtitle: { enabled: true, style_id: 'default', position: 'bottom', animation: 'fadeIn' },
        transition: { type: 'none', duration: 0.5 },
        digital_human: { enabled: true, position: { x: 50, y: 80 }, scale: 100 },
        overlays: [],
        objects: [
          {
            id: 'title-1',
            type: 'text',
            label: '标题',
            text: '导购标题',
            position: { x: 50, y: 20 },
            scale: 120,
            style: { fill: '#ff5600', textColor: '#111111' },
          },
        ],
      },
    ],
  };
}

describe('hyperframes composer', () => {
  it('materializes editor objects into timed HyperFrames clips', () => {
    const html = generateHyperframesHTML(makeDsl());

    assert.match(html, /data-composition-id="guide-video"/);
    assert.match(html, /id="obj-title-1"/);
    assert.match(html, /class="clip hf-object"/);
    assert.match(html, /data-start="0"/);
    assert.match(html, /data-duration="5"/);
    assert.match(html, /data-track-index="10"/);
    assert.match(html, /导购标题/);
  });

  it('embeds HF captions, transitions, and global overlays', () => {
    const dsl = makeDsl();
    dsl.globalConfig = {
      ...dsl.globalConfig,
      brand_color: '#2563eb',
      transition_enabled: true,
      hf_overlays: [
        { type: 'hf-grain', enabled: true, opacity: 0.15 },
        { type: 'hf-vignette', enabled: true, intensity: 0.6, vignette_size: 42 },
      ],
    };
    dsl.segments[0].narration_text = '限时特惠 立即抢购';
    dsl.segments[0].subtitle = {
      enabled: true,
      style_id: 'hf-caption-pill',
      position: 'bottom',
      animation: 'fadeIn',
      hf_params: {
        word_timings: [
          { text: '限时', start: 0.2, end: 0.8 },
          { text: '特惠', start: 0.85, end: 1.4 },
        ],
        word_timing_source: 'heuristic',
      },
    };
    dsl.segments[0].transition = { type: 'hf-zoom', duration: 0.6 };
    dsl.segments.push({
      ...dsl.segments[0],
      id: 'seg-2',
      narration_text: '第二段口播',
      transition: { type: 'none', duration: 0.5 },
    });

    const html = generateHyperframesHTML(dsl);
    assert.match(html, /caption-pill-karaoke/);
    assert.match(html, /hf-trans-zoom/);
    assert.match(html, /grain-overlay/);
    assert.match(html, /vignette/);
    assert.match(html, /gsap@3\.14\.2/);
  });
});