import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSubtitleStyleRenderMap,
  getSubtitleStyleDefinition,
  normalizeSubtitleStyleId,
  resolveSubtitleFontSize,
  SUBTITLE_FONT_SIZE_DEFAULT,
} from '../../shared/subtitleStyles';

test('normalizeSubtitleStyleId maps legacy aliases to canonical keys', () => {
  assert.equal(normalizeSubtitleStyleId('yellow-highlight'), 'bold-yellow');
  assert.equal(normalizeSubtitleStyleId('classic-white-stroke'), 'default');
  assert.equal(normalizeSubtitleStyleId('stroke-large'), 'bold-white-stroke');
  assert.equal(normalizeSubtitleStyleId('semi-transparent-bar'), 'bottom-center');
  assert.equal(normalizeSubtitleStyleId('brand-elegant'), 'brand-elegant');
});

test('buildSubtitleStyleRenderMap covers all canonical and alias keys', () => {
  const map = buildSubtitleStyleRenderMap();
  assert.ok(map.default);
  assert.ok(map['bold-yellow']);
  assert.ok(map['yellow-highlight']);
  assert.ok(map['brand-elegant']);
  assert.ok(map['bold-white-stroke']);
});

test('resolveSubtitleFontSize honors segment and global overrides', () => {
  assert.equal(resolveSubtitleFontSize({ fontSize: 96 }), 96);
  assert.equal(resolveSubtitleFontSize({ globalFontSize: 80 }), 80);
  assert.ok(resolveSubtitleFontSize({ styleId: 'bold-white-stroke' }) >= SUBTITLE_FONT_SIZE_DEFAULT);
});

test('brand-elegant preview uses champagne palette', () => {
  const def = getSubtitleStyleDefinition('brand-elegant');
  assert.equal(def?.preview.color, '#F5E6CC');
  assert.equal(def?.render.outline, '#8B7355');
});