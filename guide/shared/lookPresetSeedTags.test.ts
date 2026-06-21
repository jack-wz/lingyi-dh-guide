import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  builtinSeedPreviewTagRows,
  getLookPresetSeedPreviewTag,
  mergeBuiltinSeedPreviewTags,
  mergeSeedTagOverridesFromBrandPayloads,
  resolveLookPresetSeedPreviewTags,
} from './lookPresetSeedTags.js';

describe('lookPresetSeedTags', () => {
  it('returns preview tag for cinema seed', () => {
    assert.equal(getLookPresetSeedPreviewTag('look-grade-cinema'), '影院调色');
  });

  it('returns undefined for unknown seeds', () => {
    assert.equal(getLookPresetSeedPreviewTag('look-unknown'), undefined);
  });

  it('merges integrator overrides from brand payloads', () => {
    const table = mergeSeedTagOverridesFromBrandPayloads([
      { look_preset_seed_preview_tags: { 'look-grade-cinema': '影院质感' } },
      { look_preset_seed_preview_tags: { 'look-stagger-guide': '导购错落' } },
    ]);
    assert.equal(table['look-grade-cinema'], '影院质感');
    assert.equal(table['look-stagger-guide'], '导购错落');
    assert.equal(table['look-circle-beauty'], '圆形美妆');
  });

  it('resolveLookPresetSeedPreviewTags prefers overrides', () => {
    const table = resolveLookPresetSeedPreviewTags({ 'look-grade-cinema': '自定义影院' });
    assert.equal(getLookPresetSeedPreviewTag('look-grade-cinema', table), '自定义影院');
  });

  it('mergeBuiltinSeedPreviewTags keeps custom overrides', () => {
    const merged = mergeBuiltinSeedPreviewTags({ 'look-grade-cinema': '自定义影院' });
    assert.equal(merged['look-grade-cinema'], '自定义影院');
    assert.equal(merged['look-stagger-guide'], '错落导购');
  });

  it('builtinSeedPreviewTagRows lists built-in seeds', () => {
    const rows = builtinSeedPreviewTagRows();
    assert.ok(rows.some((row) => row.seedId === 'look-grade-cinema' && row.label === '影院调色'));
  });
});