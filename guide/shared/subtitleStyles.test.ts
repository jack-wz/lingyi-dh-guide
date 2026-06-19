import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CLASSIC_SUBTITLE_STYLES,
  dslUsesHyperframesSubtitles,
  getHyperframesSubtitlePipelineWarning,
  HF_SUBTITLE_STYLES,
  isHyperframesSubtitleStyle,
} from './subtitleStyles.js';

describe('subtitleStyles hf grouping', () => {
  it('exposes classic and hyperframes style groups', () => {
    assert.ok(CLASSIC_SUBTITLE_STYLES.length >= 8);
    assert.equal(HF_SUBTITLE_STYLES.length, 1);
    assert.equal(HF_SUBTITLE_STYLES[0]?.id, 'hf-caption-highlight');
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

  it('warns when non-hf pipeline uses hyperframes subtitles', () => {
    const warning = getHyperframesSubtitlePipelineWarning('standard');
    assert.ok(warning?.includes('HyperFrames'));
    assert.equal(getHyperframesSubtitlePipelineWarning('hyperframes_template'), null);
  });
});