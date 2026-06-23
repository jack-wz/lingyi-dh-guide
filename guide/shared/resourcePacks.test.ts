import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  RESOURCE_PACK_CATALOG, RESOURCE_PACK_COUNTS, listByKind, assertCatalogComplete,
} from './resourcePacks.js';
import {
  RECIPE_REGISTRY, getRecipe, detectAssetGaps, buildProductBrief, assertWritebackCompliant,
} from './recipeRegistry.js';
import type { DSL } from './types/editor.js';

const baseDsl = (segs: any[]): DSL => ({
  meta: { id: 't', name: 'x', type: 'template', version: 1, created_at: '', updated_at: '' },
  globalConfig: { canvas_width: 1080, canvas_height: 1920, fps: 30, bgm_url: '', bgm_volume: 0.3, output_format: 'mp4' } as any,
  variables: [],
  segments: segs as any,
}) as any;

describe('resource pack catalog (#23)', () => {
  it('meets the issue-specified counts', () => {
    assert.equal(RESOURCE_PACK_COUNTS.shot_template, 12);
    assert.equal(RESOURCE_PACK_COUNTS.subtitle_system, 8);
    assert.equal(RESOURCE_PACK_COUNTS.motion_effect, 20);
    assert.equal(RESOURCE_PACK_COUNTS.transition, 12);
    assert.equal(RESOURCE_PACK_COUNTS.sfx, 24);
    assert.equal(RESOURCE_PACK_COUNTS.bgm_group, 8);
    assert.equal(RESOURCE_PACK_COUNTS.brand_pack, 4);
    assert.equal(RESOURCE_PACK_CATALOG.length, 12 + 8 + 20 + 12 + 24 + 8 + 4);
  });

  it('every item carries full compliance metadata', () => {
    for (const r of RESOURCE_PACK_CATALOG) {
      assert.ok(r.compliance.license, `${r.id} missing license`);
      assert.ok(r.compliance.source_url, `${r.id} missing source_url`);
      assert.ok(r.compliance.author, `${r.id} missing author`);
      assert.ok(r.compliance.allowed_usage === 'commercial', `${r.id} must be commercial-OK`);
    }
    assert.equal(assertCatalogComplete().length, 0);
  });

  it('listByKind returns only matching items', () => {
    assert.equal(listByKind('sfx').length, 24);
    assert.equal(listByKind('brand_pack').length, 4);
  });
});

describe('recipe registry + gap detection (#23)', () => {
  it('has the 6 named recipes with writeback rules', () => {
    const ids = RECIPE_REGISTRY.map((r) => r.id).sort();
    assert.deepEqual(ids, ['product_image_to_scene', 'product_to_broll_prompt', 'script_compress_cn', 'shot_variant_regenerate', 'svg_to_lottie', 'title_to_gsap_motion'].sort());
    assert.equal(getRecipe('svg_to_lottie')?.required_asset_writeback, true);
    assert.equal(getRecipe('script_compress_cn')?.required_asset_writeback, false);
  });

  it('detectAssetGaps returns user-language fill list', () => {
    const dsl = baseDsl([
      { id: '1', type: 'narration', scene_image_url: '', narration_text: 'x'.repeat(80), voice_id: '', subtitle: { style_id: '' }, digital_human: { enabled: false } },
      { id: '2', type: 'cta', scene_image_url: '/x.png', narration_text: 'cta', voice_id: 'v', subtitle: { style_id: 's' }, objects: [{ id: 'o', type: 'image', position: { x: 0, y: 0 }, scale: 1 }] } as any,
    ]);
    const { gaps, oneLine } = detectAssetGaps(dsl);
    assert.ok(gaps.some((g) => g.fill === '场景图'));
    assert.ok(gaps.some((g) => g.fill === '字幕样式'));
    assert.match(oneLine, /将 AI 补/);
  });

  it('buildProductBrief derives structured proposal', () => {
    const b = buildProductBrief({ topic: '飞鹤奶粉 0-6 岁营养对比 价格优惠 限时秒杀', segment_count: 5 });
    assert.equal(b.shotCount, 5);
    assert.ok(b.sellingPoints.length);
    assert.match(b.emotion, /促销/);
    assert.ok(b.recommendedPacks.includes('shot_opening_hook'));
    assert.ok(b.missingAssets.some((m) => m.includes('场景图')));
  });

  it('assertWritebackCompliant blocks temp URLs for writeback-required recipes', () => {
    assert.equal(assertWritebackCompliant({ file_url: '/tmp/x.webm' }, 'svg_to_lottie').ok, false);
    assert.equal(assertWritebackCompliant({ asset_id: 'a1', file_url: '/u/a1.webm' }, 'svg_to_lottie').ok, true);
    assert.equal(assertWritebackCompliant({ file_url: '/tmp/c.txt' }, 'script_compress_cn').ok, true);
    assert.equal(assertWritebackCompliant({}, 'nope').ok, false);
  });
});