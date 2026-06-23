import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CLASSIC_SUBTITLE_STYLES,
  buildSubtitleStyleRenderMap,
  dslUsesHyperframesSubtitles,
  getAssSubtitleFallbackName,
  getHyperframesSubtitlePipelineWarning,
  HF_SUBTITLE_STYLES,
  isHyperframesSubtitleStyle,
  resolveAssSubtitleStyleId,
} from './subtitleStyles.js';

describe('subtitleStyles hf grouping', () => {
  it('exposes classic and hyperframes style groups', () => {
    assert.ok(CLASSIC_SUBTITLE_STYLES.length >= 8);
    assert.equal(HF_SUBTITLE_STYLES.length, 17);
    assert.ok(HF_SUBTITLE_STYLES.some((s) => s.id === 'hf-caption-highlight'));
    assert.ok(HF_SUBTITLE_STYLES.some((s) => s.id === 'hf-caption-pill'));
    assert.ok(HF_SUBTITLE_STYLES.some((s) => s.id === 'hf-caption-pop'));
    assert.ok(HF_SUBTITLE_STYLES.some((s) => s.id === 'hf-caption-stagger'));
    assert.ok(HF_SUBTITLE_STYLES.some((s) => s.id === 'hf-caption-matrix-decode'));
    assert.ok(HF_SUBTITLE_STYLES.some((s) => s.id === 'hf-caption-kinetic-slam'));
    assert.ok(HF_SUBTITLE_STYLES.some((s) => s.id === 'hf-caption-texture'));
  });

  it('detects hyperframes subtitle usage in dsl', () => {
    const dsl = {
      segments: [
        {
          narration_text: '限时特惠',
          subtitle: { enabled: true, style_id: 'hf-caption-highlight' },
        },
      ],
    };
    assert.equal(isHyperframesSubtitleStyle('hf-caption-highlight'), true);
    assert.equal(dslUsesHyperframesSubtitles(dsl), true);
  });

  it('allows hyperframes subtitles on style-layer pipelines', () => {
    assert.equal(getHyperframesSubtitlePipelineWarning('standard'), null);
    assert.equal(getHyperframesSubtitlePipelineWarning('template_editor'), null);
    assert.equal(getHyperframesSubtitlePipelineWarning('hyperframes_template'), null);
  });

  it('maps hyperframes styles to ASS fallbacks', () => {
    assert.equal(resolveAssSubtitleStyleId('hf-caption-pill'), 'subtitle-card');
    assert.equal(resolveAssSubtitleStyleId('hf-caption-highlight'), 'bold-yellow');
    assert.equal(getAssSubtitleFallbackName('hf-caption-pill'), '卡片式');
    const map = buildSubtitleStyleRenderMap();
    assert.equal(map['hf-caption-pill'].bg, map['subtitle-card'].bg);
  });
});