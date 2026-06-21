import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildLookPresetExportDocument,
  parseLookPresetBrandHintsJson,
  parseLookPresetImportDocument,
} from './lookPresetExport.js';

describe('lookPresetExport', () => {
  it('round-trips export document', () => {
    const doc = buildLookPresetExportDocument({
      name: '测试预设',
      description: 'desc',
      payload: {
        subtitle_style_id: 'hf-caption-pop',
        transition_type: 'hf-push-up',
        transition_duration: 0.5,
        hf_overlays: [{ type: 'hf-grain', enabled: true, opacity: 0.12 }],
        pipeline_required: 'template_editor',
      },
    });
    const parsed = parseLookPresetImportDocument(doc);
    assert.equal(parsed.name, '测试预设');
    assert.equal(parsed.payload.subtitle_style_id, 'hf-caption-pop');
    assert.equal(parsed.payload.transition_type, 'hf-push-up');
  });

  it('accepts bare payload JSON', () => {
    const parsed = parseLookPresetImportDocument({
      subtitle_style_id: 'hf-caption-highlight',
      transition_type: 'hf-dissolve',
    });
    assert.equal(parsed.payload.subtitle_style_id, 'hf-caption-highlight');
  });

  it('exports brand_hints for seeded presets', () => {
    const doc = buildLookPresetExportDocument({
      name: '零售擦除',
      payload: {
        seed_id: 'look-wipe-retail',
        subtitle_style_id: 'hf-caption-highlight',
        transition_type: 'hf-wipe-right',
      },
    });
    assert.ok(doc.brand_hints);
    assert.equal(doc.brand_hints?.default_look_preset_seed_id, 'look-wipe-retail');
    assert.equal(doc.brand_hints?.category, '导购');
    assert.ok(doc.brand_hints?.recommended_look_preset_seed_ids.includes('look-wipe-retail'));

    const parsed = parseLookPresetImportDocument(doc);
    assert.equal(parsed.brand_hints?.category, '导购');
  });

  it('exports custom preset brand hints with library id', () => {
    const doc = buildLookPresetExportDocument({
      name: '自定义',
      payload: {
        subtitle_style_id: 'hf-caption-pop',
        transition_type: 'hf-push-up',
      },
      libraryId: 'preset-lib-99',
    });
    assert.equal(doc.brand_hints?.default_look_preset_library_id, 'preset-lib-99');
    assert.equal(doc.brand_hints?.category, '大促');
  });

  it('parses standalone brand_hints JSON', () => {
    const hints = parseLookPresetBrandHintsJson({
      category: '美妆',
      default_look_preset_seed_id: 'look-circle-beauty',
      recommended_look_preset_seed_ids: ['look-circle-beauty', 'look-editorial-premium'],
      default_look_preset_library_id: 'lib-x',
      recommended_look_preset_library_ids: ['lib-x'],
    });
    assert.equal(hints.category, '美妆');
    assert.equal(hints.default_look_preset_library_id, 'lib-x');
  });
});