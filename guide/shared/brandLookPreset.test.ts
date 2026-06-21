import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getBrandHintsForCustomLookPreset,
  getBrandHintsForLookSeed,
  getBrandLookPresetHints,
  inferLookPresetCategory,
  isCustomRecommendedLookPreset,
  isWritableLookPresetBrandHints,
  mergeBrandLookHintsIntoPayload,
  partitionLookPresetsForBrand,
  buildBrandLookApplyAllToastMessage,
  pickDefaultBrandLookPresetItem,
  resolveLookPresetBrandHints,
} from './brandLookPreset.js';

describe('brandLookPreset', () => {
  it('maps retail category to stagger-guide preset', () => {
    const hints = getBrandLookPresetHints({ category: '导购' });
    assert.ok(hints.recommendedSeedIds.includes('look-stagger-guide'));
    assert.ok(hints.recommendedSeedIds.includes('look-wipe-retail'));
  });

  it('maps maternal category to maternal-soft preset', () => {
    const hints = getBrandLookPresetHints({ category: '母婴' });
    assert.ok(hints.recommendedSeedIds.includes('look-maternal-soft'));
  });

  it('respects explicit recommended seed ids on brand pack', () => {
    const hints = getBrandLookPresetHints({
      recommended_look_preset_seed_ids: ['look-neon-night', 'look-promo-fast'],
      default_look_preset_seed_id: 'look-promo-fast',
    });
    assert.equal(hints.defaultSeedId, 'look-promo-fast');
    assert.deepEqual(hints.recommendedSeedIds, ['look-promo-fast', 'look-neon-night']);
  });

  it('merges brand hints into brand payload', () => {
    const merged = mergeBrandLookHintsIntoPayload(
      { category: 'general', brand_color: '#111111' },
      {
        category: '导购',
        default_look_preset_seed_id: 'look-stagger-guide',
        recommended_look_preset_seed_ids: ['look-stagger-guide', 'look-wipe-retail'],
      },
    );
    assert.equal(merged.category, '导购');
    assert.equal(merged.default_look_preset_seed_id, 'look-stagger-guide');
    assert.deepEqual(merged.recommended_look_preset_seed_ids, ['look-stagger-guide', 'look-wipe-retail']);
    assert.equal(merged.brand_color, '#111111');
  });

  it('resolves explicit brand hints before seed inference', () => {
    const hints = resolveLookPresetBrandHints({
      payload: { seed_id: 'look-wipe-retail' },
      explicit: {
        category: '大促',
        default_look_preset_seed_id: 'look-promo-fast',
        recommended_look_preset_seed_ids: ['look-promo-fast'],
      },
    });
    assert.equal(hints?.category, '大促');
    assert.equal(hints?.default_look_preset_seed_id, 'look-promo-fast');
  });

  it('builds brand hints for custom look preset library id', () => {
    const hints = getBrandHintsForCustomLookPreset({
      libraryId: 'lib-custom-1',
      payload: {
        subtitle_style_id: 'hf-caption-pop',
        transition_type: 'hf-push-up',
      },
    });
    assert.equal(hints.category, '大促');
    assert.equal(hints.default_look_preset_library_id, 'lib-custom-1');
    assert.ok(isWritableLookPresetBrandHints(hints));
  });

  it('infers category from subtitle and transition', () => {
    assert.equal(inferLookPresetCategory({ subtitle_style_id: 'hf-caption-stagger' }), '导购');
    assert.equal(inferLookPresetCategory({ transition_type: 'hf-circle-reveal' }), '美妆');
  });

  it('partitions custom library ids into brand recommended', () => {
    const items = [
      { id: 'lib-a', payload: { subtitle_style_id: 'hf-caption-pop' } },
      { id: 'lib-b', payload: { seed_id: 'look-steady-voice' } },
    ];
    const { recommended, others } = partitionLookPresetsForBrand({
      recommended_look_preset_library_ids: ['lib-a'],
    }, items);
    assert.equal(recommended.length, 1);
    assert.equal(recommended[0].id, 'lib-a');
    assert.equal(others.length, 1);
  });

  it('infers brand hints from look seed id', () => {
    const hints = getBrandHintsForLookSeed('look-wipe-retail');
    assert.ok(hints);
    assert.equal(hints?.category, '导购');
    assert.equal(hints?.default_look_preset_seed_id, 'look-wipe-retail');
  });

  it('partitions library items into brand recommended vs others', () => {
    const items = [
      { id: 'a', payload: { seed_id: 'look-maternal-soft' } },
      { id: 'b', payload: { seed_id: 'look-neon-night' } },
      { id: 'c', payload: { seed_id: 'look-steady-voice' } },
    ];
    const { recommended, others } = partitionLookPresetsForBrand({ category: '母婴' }, items);
    assert.equal(recommended.length, 1);
    assert.equal(recommended[0].id, 'a');
    assert.equal(others.length, 2);
  });

  it('detects custom recommended look presets by library id', () => {
    const custom = { id: 'lib-custom-9', payload: { subtitle_style_id: 'hf-caption-pop' } };
    const seeded = { id: 'lib-seed-9', payload: { seed_id: 'look-promo-fast' } };
    assert.equal(isCustomRecommendedLookPreset(custom, ['lib-custom-9']), true);
    assert.equal(isCustomRecommendedLookPreset(seeded, ['lib-seed-9']), false);
    assert.equal(isCustomRecommendedLookPreset(custom, ['lib-other']), false);
  });

  it('builds apply-all toast with alternative count', () => {
    assert.equal(
      buildBrandLookApplyAllToastMessage('口播稳重', 2),
      '已套用默认：口播稳重，另有 2 个备选可单独选择',
    );
    assert.equal(buildBrandLookApplyAllToastMessage('口播稳重', 0), '已套用默认：口播稳重');
  });

  it('picks default brand look preset by library id then seed id', () => {
    const items = [
      { id: 'lib-seed', payload: { seed_id: 'look-steady-voice' } },
      { id: 'lib-custom', payload: { subtitle_style_id: 'hf-caption-pop' } },
    ];
    const byLibrary = pickDefaultBrandLookPresetItem(
      {
        category: '企业',
        defaultLibraryId: 'lib-custom',
        recommendedLibraryIds: ['lib-custom'],
        defaultSeedId: 'look-steady-voice',
        recommendedSeedIds: ['look-steady-voice'],
      },
      items,
    );
    assert.equal(byLibrary?.id, 'lib-custom');
    const bySeed = pickDefaultBrandLookPresetItem(
      {
        category: '企业',
        defaultLibraryId: '',
        recommendedLibraryIds: [],
        defaultSeedId: 'look-steady-voice',
        recommendedSeedIds: ['look-steady-voice'],
      },
      items,
    );
    assert.equal(bySeed?.id, 'lib-seed');
  });
});