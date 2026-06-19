import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  hfLayoutMetrics,
  hfOverlayMetrics,
  hfScaleFactor,
  scaleHfCaptionFontSize,
  scaleHfPx,
} from './hfVerticalScale.js';

describe('hfVerticalScale', () => {
  it('uses unity scale on reference canvas', () => {
    assert.equal(hfScaleFactor(1080, 1920), 1);
  });

  it('shrinks typography on 720p vertical canvas', () => {
    const ref = scaleHfCaptionFontSize(48, 1080, 1920);
    const small = scaleHfCaptionFontSize(48, 720, 1280);
    assert.ok(small < ref);
  });

  it('produces smaller padding metrics for narrow canvases', () => {
    const ref = hfLayoutMetrics(1080, 1920);
    const narrow = hfLayoutMetrics(720, 1280);
    assert.ok(narrow.padX < ref.padX);
    assert.ok(narrow.gap < ref.gap);
  });

  it('scales arbitrary pixel values', () => {
    assert.equal(scaleHfPx(20, 1080, 1920), 20);
    assert.ok(scaleHfPx(20, 720, 1280) < 20);
  });

  it('scales overlay blur for narrow canvases', () => {
    const ref = hfOverlayMetrics(1080, 1920);
    const narrow = hfOverlayMetrics(720, 1280);
    assert.ok(narrow.leakBlurPx < ref.leakBlurPx);
    assert.ok(narrow.motionBlurPx(0.35) < ref.motionBlurPx(0.35));
    assert.ok(narrow.leakBandWidthPct >= ref.leakBandWidthPct);
  });
});