/** Short preview labels for built-in look preset seeds on asset hub cards. */

export const LOOK_PRESET_SEED_PREVIEW_TAGS_BUILTIN: Record<string, string> = {
  'look-grade-cinema': '影院调色',
  'look-circle-beauty': '圆形美妆',
  'look-stagger-guide': '错落导购',
  'look-pop-energetic': '弹跳活力',
};

/** @deprecated use LOOK_PRESET_SEED_PREVIEW_TAGS_BUILTIN */
export const LOOK_PRESET_SEED_PREVIEW_TAGS = LOOK_PRESET_SEED_PREVIEW_TAGS_BUILTIN;

export function parseLookPresetSeedPreviewTagOverrides(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const seedId = String(key || '').trim();
    const label = String(value || '').trim();
    if (seedId && label) out[seedId] = label;
  }
  return out;
}

export function resolveLookPresetSeedPreviewTags(
  overrides?: Record<string, string> | null,
): Record<string, string> {
  return {
    ...LOOK_PRESET_SEED_PREVIEW_TAGS_BUILTIN,
    ...parseLookPresetSeedPreviewTagOverrides(overrides),
  };
}

export function mergeSeedTagOverridesFromBrandPayloads(
  payloads: Array<Record<string, unknown> | undefined | null>,
): Record<string, string> {
  const merged = { ...LOOK_PRESET_SEED_PREVIEW_TAGS_BUILTIN };
  for (const payload of payloads) {
    if (!payload) continue;
    Object.assign(merged, parseLookPresetSeedPreviewTagOverrides(payload.look_preset_seed_preview_tags));
  }
  return merged;
}

export function builtinSeedPreviewTagRows(): Array<{ seedId: string; label: string }> {
  return Object.entries(LOOK_PRESET_SEED_PREVIEW_TAGS_BUILTIN).map(([seedId, label]) => ({
    seedId,
    label,
  }));
}

export function mergeBuiltinSeedPreviewTags(
  current?: Record<string, string> | null,
): Record<string, string> {
  return {
    ...LOOK_PRESET_SEED_PREVIEW_TAGS_BUILTIN,
    ...parseLookPresetSeedPreviewTagOverrides(current),
  };
}

export function getLookPresetSeedPreviewTag(
  seedId: string | undefined | null,
  tagTable?: Record<string, string> | null,
): string | undefined {
  const target = String(seedId || '').trim();
  if (!target) return undefined;
  const table = tagTable || LOOK_PRESET_SEED_PREVIEW_TAGS_BUILTIN;
  return table[target];
}