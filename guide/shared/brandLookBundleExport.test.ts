import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildBrandLookBundleDocument,
  buildLibraryIdRemapFromUpsertResults,
  collectLookPresetsForBundle,
  lookPresetSettingsToBrandHints,
  parseBrandLookBundleDocument,
  mergeBrandLookBundlePayload,
  pickBrandLookBundlePayload,
  planLookPresetUpserts,
  summarizeBrandLookBundleExportFields,
  remapBrandLookLibraryIds,
  remapBrandPayloadLibraryIds,
} from './brandLookBundleExport.js';
import { BRAND_LOOK_BUNDLE_FORMAT, BRAND_LOOK_BUNDLE_VERSION } from './brandLookBundleExport.js';

describe('brandLookBundleExport', () => {
  it('converts settings to brand hints', () => {
    const hints = lookPresetSettingsToBrandHints({
      category: '美妆',
      defaultLookPresetSeedId: 'look-circle-beauty',
      recommendedLookPresetSeedIds: ['look-circle-beauty', 'look-editorial-premium'],
      defaultLookPresetLibraryId: 'lib-custom-1',
      recommendedLookPresetLibraryIds: ['lib-custom-1'],
    });
    assert.equal(hints.category, '美妆');
    assert.equal(hints.default_look_preset_seed_id, 'look-circle-beauty');
    assert.deepEqual(hints.recommended_look_preset_library_ids, ['lib-custom-1']);
  });

  it('collects seeded and custom presets for bundle export', () => {
    const hints = lookPresetSettingsToBrandHints({
      category: '大促',
      defaultLookPresetSeedId: 'look-promo-fast',
      recommendedLookPresetSeedIds: ['look-promo-fast'],
      recommendedLookPresetLibraryIds: ['lib-custom-promo'],
    });
    const docs = collectLookPresetsForBundle({
      hints,
      libraryItems: [
        {
          id: 'lib-custom-promo',
          name: '自定义大促',
          payload: {
            subtitle_style_id: 'hf-caption-pop',
            transition_type: 'hf-push-up',
            hf_overlays: [{ type: 'hf-grain', enabled: true, opacity: 0.12 }],
          },
        },
      ],
    });
    assert.ok(docs.some((doc) => doc.payload.seed_id === 'look-promo-fast'));
    assert.ok(docs.some((doc) => doc.name === '自定义大促'));
  });

  it('round-trips bundle parse/build', () => {
    const bundle = buildBrandLookBundleDocument({
      brandName: 'Demo Brand',
      brand_hints: {
        category: '导购',
        default_look_preset_seed_id: 'look-stagger-guide',
        recommended_look_preset_seed_ids: ['look-stagger-guide'],
      },
      look_presets: [],
    });
    const parsed = parseBrandLookBundleDocument(bundle);
    assert.equal(parsed.format, BRAND_LOOK_BUNDLE_FORMAT);
    assert.equal(parsed.version, BRAND_LOOK_BUNDLE_VERSION);
    assert.equal(parsed.brand_name, 'Demo Brand');
    assert.equal(parsed.brand_hints.category, '导购');
  });

  it('plans upsert by seed_id or name', () => {
    const plans = planLookPresetUpserts(
      [
        {
          id: 'lib-seed-1',
          name: '口播稳重',
          payload: { seed_id: 'look-steady-voice', subtitle_style_id: 'hf-caption-highlight' },
        },
      ],
      [
        {
          format: 'guide-look-preset',
          version: 1,
          name: '口播稳重',
          payload: { seed_id: 'look-steady-voice', subtitle_style_id: 'hf-caption-highlight' },
          exported_at: new Date().toISOString(),
          registry_version: '2026.06.3',
        },
        {
          format: 'guide-look-preset',
          version: 1,
          name: '自定义导购',
          payload: { subtitle_style_id: 'hf-caption-stagger', transition_type: 'hf-dissolve' },
          exported_at: new Date().toISOString(),
          registry_version: '2026.06.3',
        },
      ],
    );
    assert.equal(plans[0].mode, 'update');
    assert.equal(plans[0].existingId, 'lib-seed-1');
    assert.equal(plans[1].mode, 'create');
  });

  it('remaps brand library ids after cross-env upsert', () => {
    const hints = {
      category: '大促',
      default_look_preset_library_id: 'lib-old-a',
      recommended_look_preset_library_ids: ['lib-old-a', 'lib-old-b'],
    };
    const plans = [
      { mode: 'create' as const, source_library_id: 'lib-old-a', name: 'A', payload: { subtitle_style_id: 'hf-caption-pop' } },
      { mode: 'create' as const, source_library_id: 'lib-old-b', name: 'B', payload: { subtitle_style_id: 'hf-caption-pop' } },
    ];
    const idMap = buildLibraryIdRemapFromUpsertResults(plans, ['lib-new-a', 'lib-new-b']);
    const remapped = remapBrandLookLibraryIds(hints, idMap);
    assert.equal(remapped.default_look_preset_library_id, 'lib-new-a');
    assert.deepEqual(remapped.recommended_look_preset_library_ids, ['lib-new-a', 'lib-new-b']);
  });

  it('summarizes export preview field list', () => {
    const fields = summarizeBrandLookBundleExportFields({
      category: '导购',
      brand_color: '#112233',
      look_preset_seed_preview_tags: { 'look-grade-cinema': '影院' },
      tokens: { colors: { 'trust-blue': '#2563eb' }, typography: { fonts: [] } },
      design_markdown: 'ignored',
    });
    assert.ok(fields.includes('category'));
    assert.ok(fields.includes('brand_color'));
    assert.ok(fields.includes('tokens.colors'));
    assert.equal(fields.includes('design_markdown'), false);
    assert.equal(fields.includes('typography'), false);
  });

  it('picks only appearance-safe keys from brand payload', () => {
    const picked = pickBrandLookBundlePayload({
      category: '美妆',
      brand_color: '#aabbcc',
      look_preset_seed_preview_tags: { 'look-grade-cinema': '影院' },
      design_markdown: '# huge design doc',
      frame_markdown: '# huge frame doc',
      tokens: {
        colors: { 'digital-orange': '#ff5500', 'soft-pink': '#f6f8fb' },
        typography: { fonts: [{ name: 'Heading' }] },
      },
    });
    assert.equal(picked.category, '美妆');
    assert.equal(picked.brand_color, '#aabbcc');
    assert.deepEqual(picked.look_preset_seed_preview_tags, { 'look-grade-cinema': '影院' });
    assert.equal(picked.design_markdown, undefined);
    assert.equal(picked.frame_markdown, undefined);
    assert.deepEqual(picked.tokens, {
      colors: { 'digital-orange': '#ff5500', 'soft-pink': '#f6f8fb' },
    });
  });

  it('mergeBrandLookBundlePayload merges token colors without typography', () => {
    const merged = mergeBrandLookBundlePayload(
      {
        tokens: {
          colors: { 'digital-orange': '#111111' },
          typography: { fonts: [{ name: 'KeepMe' }] },
        },
      },
      {
        tokens: {
          colors: { 'trust-blue': '#2563eb' },
          typography: { fonts: [{ name: 'DropMe' }] },
        },
        design_markdown: 'ignored',
      },
    );
    const tokens = merged.tokens as { colors?: Record<string, string>; typography?: { fonts: unknown[] } };
    assert.equal(tokens.colors?.['digital-orange'], '#111111');
    assert.equal(tokens.colors?.['trust-blue'], '#2563eb');
    assert.deepEqual(tokens.typography?.fonts, [{ name: 'KeepMe' }]);
    assert.equal(merged.design_markdown, undefined);
  });

  it('round-trips brand_payload in bundle documents', () => {
    const bundle = buildBrandLookBundleDocument({
      brand_hints: { category: '企业', default_look_preset_seed_id: 'look-steady-voice' },
      look_presets: [],
      brand_payload: {
        category: '企业',
        default_look_preset_seed_id: 'look-steady-voice',
        look_preset_seed_preview_tags: { 'look-grade-cinema': '影院质感' },
        brand_color: '#112233',
        design_markdown: 'should be stripped',
      },
    });
    const parsed = parseBrandLookBundleDocument(bundle);
    assert.equal(parsed.brand_payload?.brand_color, '#112233');
    assert.deepEqual(parsed.brand_payload?.look_preset_seed_preview_tags, {
      'look-grade-cinema': '影院质感',
    });
    assert.equal(parsed.brand_payload?.design_markdown, undefined);
  });

  it('remaps library ids inside brand_payload snapshot', () => {
    const remapped = remapBrandPayloadLibraryIds(
      {
        category: '大促',
        default_look_preset_library_id: 'lib-old',
        recommended_look_preset_library_ids: ['lib-old'],
      },
      { 'lib-old': 'lib-new' },
    );
    assert.equal(remapped.default_look_preset_library_id, 'lib-new');
    assert.deepEqual(remapped.recommended_look_preset_library_ids, ['lib-new']);
  });

  it('preserves source_library_id on bundle preset export docs', () => {
    const docs = collectLookPresetsForBundle({
      hints: {
        category: '大促',
        recommended_look_preset_library_ids: ['lib-src-1'],
      },
      libraryItems: [
        {
          id: 'lib-src-1',
          name: '源环境预设',
          payload: {
            subtitle_style_id: 'hf-caption-pop',
            transition_type: 'hf-push-up',
          },
        },
      ],
    });
    assert.equal(docs[0]?.source_library_id, 'lib-src-1');
  });
});