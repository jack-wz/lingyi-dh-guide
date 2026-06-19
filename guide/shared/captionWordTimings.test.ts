import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateHyperframesHTML } from './hyperframesComposer.js';
import {
  buildCaptionWordTimings,
  resolveCaptionWordTimings,
  splitCaptionWords,
} from './captionWordTimings.js';

describe('captionWordTimings', () => {
  it('splits Chinese narration into timed units', () => {
    const words = splitCaptionWords('限时特惠，立即抢购');
    assert.ok(words.length >= 2);
    const timings = buildCaptionWordTimings(words, 0.2, 3);
    assert.equal(timings.length, words.length);
    assert.ok(timings[0].start >= 0.2);
  });

  it('prefers explicit TTS word timings', () => {
    const resolved = resolveCaptionWordTimings({
      text: '限时特惠',
      clipDuration: 5,
      wordTimings: [
        { text: '限', start: 0.3, end: 0.5 },
        { text: '时', start: 0.55, end: 0.75 },
        { text: '特', start: 0.8, end: 1.0 },
        { text: '惠', start: 1.05, end: 1.3 },
      ],
    });
    assert.equal(resolved.source, 'tts');
    assert.equal(resolved.words.length, 4);
    assert.equal(resolved.words[2].text, '特');
  });

  it('subdivides phrase timings when word timings are absent', () => {
    const resolved = resolveCaptionWordTimings({
      text: '限时特惠',
      clipDuration: 5,
      clipStart: 10,
      phraseTimings: [
        { text: '限时特惠', start: 10.2, end: 11.4 },
      ],
    });
    assert.equal(resolved.source, 'phrase');
    assert.equal(resolved.words.length, 4);
    assert.ok(resolved.words[0].start >= 0.15);
    assert.ok(resolved.words[3].end <= 1.5);
  });

  it('composer uses hf_params word timings in GSAP payload', () => {
    const html = generateHyperframesHTML({
      meta: { name: 'Word Timing Test', type: 'smoke' },
      globalConfig: {
        canvas_width: 1080,
        canvas_height: 1920,
        fps: 30,
        bgm_url: '',
        bgm_volume: 0.3,
        background_color: '#111827',
        brand_color: '#2563eb',
      },
      segments: [
        {
          id: 's1',
          type: 'narration',
          narration_text: '限时特惠',
          duration_sec: 5,
          scene_image_url: '',
          scene_description: '',
          subtitle: {
            enabled: true,
            style_id: 'hf-caption-pill',
            position: 'bottom',
            animation: 'none',
            hf_params: {
              word_timings: [
                { text: '限', start: 0.4, end: 0.7 },
                { text: '时', start: 0.75, end: 1.0 },
                { text: '特', start: 1.05, end: 1.3 },
                { text: '惠', start: 1.35, end: 1.7 },
              ],
              word_timing_source: 'whisper',
            },
          },
          transition: { type: 'none', duration: 0.5 },
          digital_human: { enabled: false, position: { x: 50, y: 80 }, scale: 100 },
          overlays: [],
        },
      ],
    });
    assert.match(html, /"start":0\.4/);
    assert.match(html, /caption-pill-karaoke/);
  });
});