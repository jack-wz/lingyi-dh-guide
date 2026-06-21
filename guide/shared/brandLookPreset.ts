import type { LookPresetPayload } from './lookPreset.js';

/** Map brand packs to recommended HyperFrames appearance presets (by seed_id). */

export const BRAND_CATEGORY_LOOK_SEEDS: Record<string, string[]> = {
  general: ['look-steady-voice', 'look-editorial-premium'],
  enterprise: ['look-steady-voice', 'look-push-tech'],
  '企业': ['look-steady-voice', 'look-push-tech'],
  maternal: ['look-maternal-soft'],
  '母婴': ['look-maternal-soft'],
  beauty: ['look-circle-beauty', 'look-editorial-premium'],
  '美妆': ['look-circle-beauty', 'look-editorial-premium'],
  promo: ['look-pop-energetic', 'look-promo-fast', 'look-neon-night'],
  '大促': ['look-pop-energetic', 'look-promo-fast'],
  retail: ['look-stagger-guide', 'look-wipe-retail', 'look-promo-fast', 'look-maternal-soft'],
  '导购': ['look-stagger-guide', 'look-wipe-retail', 'look-maternal-soft', 'look-steady-voice'],
};

export interface BrandLookPresetHints {
  defaultSeedId?: string;
  recommendedSeedIds: string[];
  defaultLibraryId?: string;
  recommendedLibraryIds: string[];
}

function normalizeTokens(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean);
}

function normalizeLibraryIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => String(item || '').trim()).filter(Boolean);
}

export function getBrandLookPresetHints(brandPack: Record<string, unknown> | undefined | null): BrandLookPresetHints {
  if (!brandPack) return { recommendedSeedIds: [], recommendedLibraryIds: [] };

  const explicitRecommended = normalizeTokens(brandPack.recommended_look_preset_seed_ids);
  const defaultSeed = String(brandPack.default_look_preset_seed_id || '').trim() || undefined;
  const explicitLibrary = normalizeLibraryIds(brandPack.recommended_look_preset_library_ids);
  const defaultLibrary = String(brandPack.default_look_preset_library_id || '').trim() || undefined;

  if (explicitRecommended.length > 0 || explicitLibrary.length > 0) {
    const recommendedSeedIds = defaultSeed
      ? [defaultSeed, ...explicitRecommended.filter((id) => id !== defaultSeed)]
      : explicitRecommended;
    const recommendedLibraryIds = defaultLibrary
      ? [defaultLibrary, ...explicitLibrary.filter((id) => id !== defaultLibrary)]
      : explicitLibrary;
    return {
      defaultSeedId: defaultSeed || recommendedSeedIds[0],
      recommendedSeedIds: [...new Set(recommendedSeedIds)],
      defaultLibraryId: defaultLibrary || recommendedLibraryIds[0],
      recommendedLibraryIds: [...new Set(recommendedLibraryIds)],
    };
  }

  const category = String(brandPack.category || 'general').trim().toLowerCase();
  const fromCategory = BRAND_CATEGORY_LOOK_SEEDS[category] || BRAND_CATEGORY_LOOK_SEEDS.general;
  const recommendedSeedIds = defaultSeed
    ? [defaultSeed, ...fromCategory.filter((id) => id !== defaultSeed)]
    : fromCategory;

  return {
    defaultSeedId: defaultSeed || recommendedSeedIds[0],
    recommendedSeedIds: [...new Set(recommendedSeedIds)],
    defaultLibraryId: defaultLibrary,
    recommendedLibraryIds: defaultLibrary ? [defaultLibrary] : [],
  };
}

/** True when a library item is recommended by brand pack library IDs and has no built-in seed_id. */
export function isCustomRecommendedLookPreset(
  item: { id: string; payload?: Record<string, unknown> },
  recommendedLibraryIds: readonly string[],
): boolean {
  const libraryId = String(item.id || '').trim();
  if (!libraryId) return false;
  const libSet = new Set(normalizeLibraryIds(recommendedLibraryIds));
  if (!libSet.has(libraryId)) return false;
  return !String(item.payload?.seed_id || '').trim();
}

export function partitionLookPresetsForBrand<T extends { payload?: Record<string, unknown> }>(
  brandPack: Record<string, unknown> | undefined | null,
  items: T[],
): { recommended: T[]; others: T[] } {
  const hints = getBrandLookPresetHints(brandPack);
  if (!hints.recommendedSeedIds.length && !hints.recommendedLibraryIds.length) {
    return { recommended: [], others: items };
  }
  const seedSet = new Set(hints.recommendedSeedIds);
  const librarySet = new Set(hints.recommendedLibraryIds);
  const recommended: T[] = [];
  const others: T[] = [];
  for (const item of items) {
    const seedId = String(item.payload?.seed_id || '').trim();
    const libraryId = String((item as { id?: string }).id || '').trim();
    if (libraryId && librarySet.has(libraryId)) recommended.push(item);
    else if (seedId && seedSet.has(seedId)) recommended.push(item);
    else others.push(item);
  }
  const seedOrder = new Map(hints.recommendedSeedIds.map((id, index) => [id, index]));
  const libraryOrder = new Map(hints.recommendedLibraryIds.map((id, index) => [id, index]));
  recommended.sort((a, b) => {
    const aLib = libraryOrder.get(String((a as { id?: string }).id || ''));
    const bLib = libraryOrder.get(String((b as { id?: string }).id || ''));
    if (aLib != null || bLib != null) return (aLib ?? 99) - (bLib ?? 99);
    const aKey = seedOrder.get(String(a.payload?.seed_id || '')) ?? 99;
    const bKey = seedOrder.get(String(b.payload?.seed_id || '')) ?? 99;
    return aKey - bKey;
  });
  return { recommended, others };
}

export function findLookPresetItemBySeedId<T extends { id: string; payload?: Record<string, unknown> }>(
  items: T[],
  seedId: string,
): T | undefined {
  const target = String(seedId || '').trim();
  if (!target) return undefined;
  return items.find((item) => String(item.payload?.seed_id || '').trim() === target);
}

/** Preferred category keys when inferring brand hints from a look seed (UI-facing ids first). */
const BRAND_CATEGORY_PRIORITY = ['导购', '大促', '美妆', '母婴', 'enterprise', 'general'] as const;

export interface LookPresetBrandHints {
  category: string;
  default_look_preset_seed_id?: string;
  recommended_look_preset_seed_ids?: string[];
  default_look_preset_library_id?: string;
  recommended_look_preset_library_ids?: string[];
}

export function isWritableLookPresetBrandHints(hints?: LookPresetBrandHints | null): boolean {
  if (!hints) return false;
  return Boolean(
    hints.default_look_preset_seed_id
    || hints.default_look_preset_library_id
    || hints.recommended_look_preset_seed_ids?.length
    || hints.recommended_look_preset_library_ids?.length,
  );
}

export function inferLookPresetCategory(payload: LookPresetPayload): string {
  const subtitle = String(payload.subtitle_style_id || '');
  const transition = String(payload.transition_type || '');
  const tags = (payload.tags || []).map((tag) => String(tag).toLowerCase());
  if (tags.some((tag) => tag.includes('大促') || tag.includes('promo'))) return '大促';
  if (tags.some((tag) => tag.includes('母婴') || tag.includes('maternal'))) return '母婴';
  if (tags.some((tag) => tag.includes('美妆') || tag.includes('beauty'))) return '美妆';
  if (tags.some((tag) => tag.includes('导购') || tag.includes('retail'))) return '导购';
  if (['hf-caption-pop', 'hf-caption-gradient', 'hf-caption-neon'].includes(subtitle)) return '大促';
  if (subtitle === 'hf-caption-pill') return '母婴';
  if (subtitle === 'hf-caption-editorial') return '美妆';
  if (['hf-caption-stagger', 'hf-caption-highlight'].includes(subtitle) || transition.includes('wipe')) return '导购';
  if (transition === 'hf-circle-reveal') return '美妆';
  if (subtitle === 'hf-caption-highlight') return 'enterprise';
  return 'general';
}

export function getBrandHintsForCustomLookPreset(input: {
  libraryId: string;
  payload: LookPresetPayload;
}): LookPresetBrandHints {
  const category = inferLookPresetCategory(input.payload);
  const categorySeeds = BRAND_CATEGORY_LOOK_SEEDS[category] || BRAND_CATEGORY_LOOK_SEEDS.general;
  return {
    category,
    default_look_preset_library_id: input.libraryId,
    recommended_look_preset_library_ids: [input.libraryId],
    recommended_look_preset_seed_ids: [...categorySeeds],
  };
}

/** Suggest brand-pack fields when sharing/importing a seeded look preset. */
export function getBrandHintsForLookSeed(seedId: string | undefined | null): LookPresetBrandHints | undefined {
  const target = String(seedId || '').trim();
  if (!target) return undefined;

  for (const category of BRAND_CATEGORY_PRIORITY) {
    const seeds = BRAND_CATEGORY_LOOK_SEEDS[category];
    if (seeds?.includes(target)) {
      return {
        category,
        default_look_preset_seed_id: target,
        recommended_look_preset_seed_ids: [...seeds],
      };
    }
  }

  for (const [category, seeds] of Object.entries(BRAND_CATEGORY_LOOK_SEEDS)) {
    if (seeds.includes(target)) {
      return {
        category,
        default_look_preset_seed_id: target,
        recommended_look_preset_seed_ids: [...seeds],
      };
    }
  }

  return {
    category: 'general',
    default_look_preset_seed_id: target,
    recommended_look_preset_seed_ids: [target],
  };
}

export function buildBrandLookApplyAllToastMessage(defaultName: string, alternativeCount: number): string {
  const name = String(defaultName || '').trim() || '品牌推荐外观';
  const alt = Math.max(0, alternativeCount);
  if (alt <= 0) return `已套用默认：${name}`;
  return `已套用默认：${name}，另有 ${alt} 个备选可单独选择`;
}

export function pickDefaultBrandLookPresetItem<T extends { id: string; payload?: Record<string, unknown> }>(
  hints: BrandLookPresetHints,
  items: T[],
): T | undefined {
  if (!items.length) return undefined;
  const defaultLibrary = String(hints.defaultLibraryId || '').trim();
  if (defaultLibrary) {
    const found = items.find((item) => item.id === defaultLibrary);
    if (found) return found;
  }
  for (const libraryId of hints.recommendedLibraryIds) {
    const found = items.find((item) => item.id === libraryId);
    if (found) return found;
  }
  const defaultSeed = String(hints.defaultSeedId || '').trim();
  if (defaultSeed) {
    const found = items.find((item) => String(item.payload?.seed_id || '').trim() === defaultSeed);
    if (found) return found;
  }
  for (const seedId of hints.recommendedSeedIds) {
    const found = items.find((item) => String(item.payload?.seed_id || '').trim() === seedId);
    if (found) return found;
  }
  return items[0];
}

export function mergeBrandLookHintsIntoPayload(
  payload: Record<string, unknown>,
  hints: LookPresetBrandHints,
): Record<string, unknown> {
  const recommended = (hints.recommended_look_preset_seed_ids || []).filter(Boolean);
  const defaultId = hints.default_look_preset_seed_id || recommended[0] || '';
  const ordered = defaultId
    ? [defaultId, ...recommended.filter((id) => id !== defaultId)]
    : recommended;
  const libRecommended = (hints.recommended_look_preset_library_ids || []).filter(Boolean);
  const defaultLibrary = hints.default_look_preset_library_id || libRecommended[0] || '';
  const libOrdered = defaultLibrary
    ? [defaultLibrary, ...libRecommended.filter((id) => id !== defaultLibrary)]
    : libRecommended;
  return {
    ...payload,
    category: hints.category || String(payload.category || 'general'),
    ...(defaultId ? { default_look_preset_seed_id: defaultId } : {}),
    ...(ordered.length ? { recommended_look_preset_seed_ids: [...new Set(ordered)] } : {}),
    ...(defaultLibrary ? { default_look_preset_library_id: defaultLibrary } : {}),
    ...(libOrdered.length ? { recommended_look_preset_library_ids: [...new Set(libOrdered)] } : {}),
  };
}

export function resolveLookPresetBrandHints(input: {
  payload?: LookPresetPayload | null;
  explicit?: LookPresetBrandHints | null;
  libraryId?: string;
}): LookPresetBrandHints | undefined {
  if (input.explicit && isWritableLookPresetBrandHints(input.explicit)) {
    return input.explicit;
  }
  if (input.payload?.seed_id) {
    return getBrandHintsForLookSeed(input.payload.seed_id);
  }
  if (input.libraryId && input.payload) {
    return getBrandHintsForCustomLookPreset({
      libraryId: input.libraryId,
      payload: input.payload,
    });
  }
  return undefined;
}