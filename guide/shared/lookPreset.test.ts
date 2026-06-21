import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyLookPresetToDsl,
  isLookPresetRegistryStale,
  LOOK_PRESET_REGISTRY_VERSION,
  LOOK_PRESET_SEEDS,
  migrateLookPresetPayload,
  parseLookPresetPayload,
  summarizeHyperframesFeatures,
} from './lookPreset.js';
import type { DSL } from './types/editor.js';

function minimalDsl(): DSL {
  return {
    meta: { name: 'test', type: 'e2e', version: '1' },
    globalConfig: {
      brand_color: '#4f46e5',
      transition_enabled: false,
    },
    segments: [
      {
        id: 'seg_1',
        narration_text: '测试旁白',
        duration_sec: 5,
        subtitle: { enabled: true, style_id: 'default', position: 'bottom' },
        transition: { type: 'none', duration: 0.5 },
        digital_human: { enabled: false },
        objects: [],
      },
      {
        id: 'seg_2',
        narration_text: '第二镜',
        duration_sec: 4,
        subtitle: { enabled: true, style_id: 'default', position: 'bottom' },
        transition: { type: 'fade', duration: 0.5 },
        digital_human: { enabled: false },
        objects: [],
      },
    ],
  };
}

describe('lookPreset', () => {
  it('parses valid payload', () => {
    const parsed = parseLookPresetPayload(LOOK_PRESET_SEEDS[0].payload);
    assert.equal(parsed?.subtitle_style_id, 'hf-caption-highlight');
    assert.equal(parsed?.transition_type, 'hf-dissolve');
  });

  it('applies preset to all segments and global overlays', () => {
    const seed = LOOK_PRESET_SEEDS.find((item) => item.seed_id === 'look-promo-fast');
    assert.ok(seed);
    const next = applyLookPresetToDsl(minimalDsl(), seed!.payload);
    assert.equal(next.segments[0].subtitle.style_id, 'hf-caption-gradient');
    assert.equal(next.segments[1].subtitle.style_id, 'hf-caption-gradient');
    assert.equal(next.segments[0].transition.type, 'hf-push-up');
    assert.equal(next.globalConfig.transition_enabled, true);
    assert.equal(next.globalConfig.hf_overlays?.some((item) => item.type === 'hf-light-leak' && item.enabled), true);
    assert.equal(next.meta.pipeline_key, 'template_editor');
  });

  it('detects stale registry versions', () => {
    assert.equal(isLookPresetRegistryStale(undefined), true);
    assert.equal(isLookPresetRegistryStale('2025.01'), true);
    assert.equal(isLookPresetRegistryStale(LOOK_PRESET_REGISTRY_VERSION), false);
  });

  it('migrates seeded presets from stale registry', () => {
    const seed = LOOK_PRESET_SEEDS.find((item) => item.seed_id === 'look-steady-voice');
    assert.ok(seed);
    const stale = { ...seed!.payload, registry_version: '2025.01' };
    const result = migrateLookPresetPayload(stale);
    assert.equal(result.migrated, true);
    assert.equal(result.reason, 'registry_version');
    assert.equal(result.payload.registry_version, LOOK_PRESET_REGISTRY_VERSION);
    assert.equal(result.payload.subtitle_style_id, seed!.payload.subtitle_style_id);
  });

  it('migrates custom presets by bumping registry only', () => {
    const custom = {
      subtitle_style_id: 'hf-caption-neon',
      transition_type: 'hf-push-right',
      registry_version: '2025.01',
    };
    const result = migrateLookPresetPayload(custom);
    assert.equal(result.migrated, true);
    assert.equal(result.payload.transition_type, 'hf-push-right');
    assert.equal(result.payload.registry_version, LOOK_PRESET_REGISTRY_VERSION);
  });

  it('summarizes hyperframes feature counts', () => {
    const seed = LOOK_PRESET_SEEDS[0];
    const next = applyLookPresetToDsl(minimalDsl(), seed.payload);
    const summary = summarizeHyperframesFeatures(next);
    assert.ok(summary.subtitleCount >= 2);
    assert.ok(summary.transitionCount >= 1);
    assert.ok(summary.overlayCount >= 1);
    assert.ok(summary.total >= 4);
  });
});