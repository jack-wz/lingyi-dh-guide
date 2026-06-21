import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateHyperframesHTML } from './hyperframesComposer.js';
import { dslNeedsHyperframesStylePass, pipelineUsesHyperframesStyleLayer } from './hfStylePass.js';

describe('hfStylePass', () => {
  it('detects HF style requirements', () => {
    const dsl = {
      segments: [{ narration_text: 'hi', subtitle: { enabled: true, style_id: 'hf-caption-pill' } }],
    };
    assert.equal(dslNeedsHyperframesStylePass(dsl), true);
  });

  it('style_layer mode uses base video and keeps HF captions', () => {
    const html = generateHyperframesHTML(
      {
        meta: { name: 'test', type: 'demo' },
        globalConfig: { canvas_width: 1080, canvas_height: 1920, fps: 30, bgm_url: '', bgm_volume: 0.3 },
        segments: [{
          id: 's1',
          type: 'scene',
          narration_text: '你好世界',
          duration_sec: 3,
          scene_image_url: '/uploads/scene.png',
          scene_description: '',
          subtitle: { enabled: true, style_id: 'hf-caption-highlight', position: 'bottom', animation: 'none' },
          transition: { type: 'none', duration: 0.5 },
          digital_human: { enabled: false, position: { x: 50, y: 70 }, scale: 100 },
          overlays: [],
        }],
      },
      undefined,
      { mode: 'style_layer', baseVideoUrl: 'base_ffmpeg.mp4' },
    );
    assert.match(html, /id="hf-base-video"/);
    assert.match(html, /data-has-audio="true"/);
    assert.match(html, /src="base_ffmpeg\.mp4"/);
    assert.doesNotMatch(html, /id="scene-bg-s1"/);
    assert.match(html, /hf-caption|subtitle/);
  });

  it('pipelineUsesHyperframesStyleLayer', () => {
    assert.equal(pipelineUsesHyperframesStyleLayer('template_editor'), true);
    assert.equal(pipelineUsesHyperframesStyleLayer('hyperframes_template'), false);
  });
});