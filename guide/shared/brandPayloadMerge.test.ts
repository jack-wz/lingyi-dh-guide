import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyPayloadNullDeletions, mergeBrandPayloadPatch } from './brandPayloadMerge.js';

describe('brandPayloadMerge', () => {
  it('deletes keys when patch value is null', () => {
    const merged = applyPayloadNullDeletions(
      {
        category: '美妆',
        look_preset_seed_preview_tags: { 'look-grade-cinema': '影院' },
        brand_color: '#111111',
      },
      { look_preset_seed_preview_tags: null },
    );
    assert.equal(merged.category, '美妆');
    assert.equal(merged.brand_color, '#111111');
    assert.equal(merged.look_preset_seed_preview_tags, undefined);
  });

  it('mergeBrandPayloadPatch overlays then applies null deletions', () => {
    const merged = mergeBrandPayloadPatch(
      { category: 'general', brand_color: '#000000' },
      { brand_color: '#ffffff', look_preset_seed_preview_tags: null },
    );
    assert.equal(merged.category, 'general');
    assert.equal(merged.brand_color, '#ffffff');
    assert.equal(merged.look_preset_seed_preview_tags, undefined);
  });

  it('deletes nested keys when patch uses nested null', () => {
    const merged = applyPayloadNullDeletions(
      {
        tokens: {
          colors: { 'digital-orange': '#ff5500' },
          typography: { fonts: [{ name: 'Heading' }] },
        },
      },
      { tokens: { typography: null } },
    );
    const tokens = merged.tokens as { colors?: Record<string, string>; typography?: unknown };
    assert.deepEqual(tokens.colors, { 'digital-orange': '#ff5500' });
    assert.equal(tokens.typography, undefined);
  });
});