import {
  getBrandLookPresetHints,
  mergeBrandLookHintsIntoPayload,
  type LookPresetBrandHints,
} from './brandLookPreset.js';
import {
  LOOK_PRESET_SEEDS,
  findLookPresetSeed,
  type LookPresetPayload,
} from './lookPreset.js';
import {
  buildLookPresetExportDocument,
  parseLookPresetImportDocument,
  type LookPresetExportDocument,
} from './lookPresetExport.js';

export const BRAND_LOOK_BUNDLE_FORMAT = 'guide-brand-look-bundle';
export const BRAND_LOOK_BUNDLE_VERSION = 1;

/** Appearance / motion fields safe to migrate without large design markdown blobs. */
export const BRAND_LOOK_BUNDLE_PAYLOAD_KEYS = [
  'category',
  'default_look_preset_seed_id',
  'recommended_look_preset_seed_ids',
  'default_look_preset_library_id',
  'recommended_look_preset_library_ids',
  'look_preset_seed_preview_tags',
  'brand_color',
  'background_color',
  'text_color',
  'accent_color',
  'subtitle_color',
  'logo_label',
  'brand_logo_url',
  'logo_element_id',
] as const;

export function pickBrandLookBundleTokenColors(tokens: unknown): Record<string, string> | undefined {
  if (!tokens || typeof tokens !== 'object') return undefined;
  const colors = (tokens as { colors?: unknown }).colors;
  if (!colors || typeof colors !== 'object') return undefined;
  const picked: Record<string, string> = {};
  for (const [key, value] of Object.entries(colors as Record<string, unknown>)) {
    const color = String(value || '').trim();
    if (color) picked[key] = color;
  }
  return Object.keys(picked).length ? picked : undefined;
}

export function summarizeBrandLookBundleExportFields(payload: Record<string, unknown>): string[] {
  const picked = pickBrandLookBundlePayload(payload);
  const fields: string[] = [];
  for (const key of BRAND_LOOK_BUNDLE_PAYLOAD_KEYS) {
    if (picked[key] !== undefined) fields.push(key);
  }
  if (pickBrandLookBundleTokenColors(payload.tokens)) fields.push('tokens.colors');
  return fields;
}

export function pickBrandLookBundlePayload(payload: Record<string, unknown>): Record<string, unknown> {
  const picked: Record<string, unknown> = {};
  for (const key of BRAND_LOOK_BUNDLE_PAYLOAD_KEYS) {
    if (payload[key] !== undefined) picked[key] = payload[key];
  }
  const colors = pickBrandLookBundleTokenColors(payload.tokens);
  if (colors) picked.tokens = { colors };
  return picked;
}

export function mergeBrandLookBundlePayload(
  current: Record<string, unknown>,
  imported: Record<string, unknown>,
): Record<string, unknown> {
  const picked = pickBrandLookBundlePayload(imported);
  const next: Record<string, unknown> = { ...current, ...picked };
  if (picked.tokens && typeof picked.tokens === 'object') {
    const importedColors = (picked.tokens as { colors?: Record<string, string> }).colors || {};
    const currentTokens = current.tokens && typeof current.tokens === 'object'
      ? current.tokens as Record<string, unknown>
      : {};
    const currentColors = currentTokens.colors && typeof currentTokens.colors === 'object'
      ? currentTokens.colors as Record<string, string>
      : {};
    next.tokens = {
      ...currentTokens,
      colors: { ...currentColors, ...importedColors },
    };
  }
  return next;
}

export interface BrandLookBundleDocument {
  format: typeof BRAND_LOOK_BUNDLE_FORMAT;
  version: typeof BRAND_LOOK_BUNDLE_VERSION;
  exported_at: string;
  brand_name?: string;
  brand_hints: LookPresetBrandHints;
  /** Full brand library payload snapshot for cross-env migration. */
  brand_payload?: Record<string, unknown>;
  look_presets: LookPresetExportDocument[];
}

export interface BrandLookBundleSettingsInput {
  category: string;
  defaultLookPresetSeedId: string;
  recommendedLookPresetSeedIds: string[];
  defaultLookPresetLibraryId?: string;
  recommendedLookPresetLibraryIds?: string[];
}

export function lookPresetSettingsToBrandHints(settings: BrandLookBundleSettingsInput): LookPresetBrandHints {
  const recommendedSeeds = settings.recommendedLookPresetSeedIds.filter(Boolean);
  const defaultSeed = settings.defaultLookPresetSeedId || recommendedSeeds[0] || '';
  const orderedSeeds = defaultSeed
    ? [defaultSeed, ...recommendedSeeds.filter((id) => id !== defaultSeed)]
    : recommendedSeeds;
  const libRecommended = (settings.recommendedLookPresetLibraryIds || []).filter(Boolean);
  const defaultLibrary = settings.defaultLookPresetLibraryId || libRecommended[0] || '';
  const libOrdered = defaultLibrary
    ? [defaultLibrary, ...libRecommended.filter((id) => id !== defaultLibrary)]
    : libRecommended;
  return {
    category: settings.category,
    default_look_preset_seed_id: defaultSeed || undefined,
    recommended_look_preset_seed_ids: orderedSeeds.length ? orderedSeeds : undefined,
    default_look_preset_library_id: defaultLibrary || undefined,
    recommended_look_preset_library_ids: libOrdered.length ? libOrdered : undefined,
  };
}

export interface LibraryLookPresetItem {
  id: string;
  name: string;
  description?: string;
  tags?: string[];
  payload?: LookPresetPayload;
}

export function collectLookPresetsForBundle(input: {
  hints: LookPresetBrandHints;
  libraryItems: LibraryLookPresetItem[];
}): LookPresetExportDocument[] {
  const docs: LookPresetExportDocument[] = [];
  const seen = new Set<string>();

  const pushDoc = (doc: LookPresetExportDocument) => {
    const key = doc.payload.seed_id || doc.brand_hints?.default_look_preset_library_id || doc.name;
    if (seen.has(key)) return;
    seen.add(key);
    docs.push(doc);
  };

  for (const seedId of input.hints.recommended_look_preset_seed_ids || []) {
    const inLib = input.libraryItems.find((item) => String(item.payload?.seed_id || '').trim() === seedId);
    if (inLib?.payload) {
      pushDoc(buildLookPresetExportDocument({
        name: inLib.name,
        description: inLib.description,
        tags: inLib.tags,
        payload: inLib.payload,
        libraryId: inLib.id,
      }));
      continue;
    }
    const seed = findLookPresetSeed(seedId) || LOOK_PRESET_SEEDS.find((item) => item.seed_id === seedId);
    if (seed) {
      pushDoc(buildLookPresetExportDocument({
        name: seed.name,
        description: seed.description,
        tags: seed.tags,
        payload: seed.payload,
        brand_hints: input.hints,
      }));
    }
  }

  for (const libraryId of input.hints.recommended_look_preset_library_ids || []) {
    const inLib = input.libraryItems.find((item) => item.id === libraryId);
    if (!inLib?.payload) continue;
    pushDoc(buildLookPresetExportDocument({
      name: inLib.name,
      description: inLib.description,
      tags: inLib.tags,
      payload: inLib.payload,
      libraryId: inLib.id,
      brand_hints: input.hints,
    }));
  }

  return docs;
}

export function buildBrandLookBundleDocument(input: {
  brandName?: string;
  brand_hints: LookPresetBrandHints;
  look_presets: LookPresetExportDocument[];
  brand_payload?: Record<string, unknown>;
}): BrandLookBundleDocument {
  return {
    format: BRAND_LOOK_BUNDLE_FORMAT,
    version: BRAND_LOOK_BUNDLE_VERSION,
    exported_at: new Date().toISOString(),
    brand_name: input.brandName?.trim() || undefined,
    brand_hints: input.brand_hints,
    ...(input.brand_payload && Object.keys(input.brand_payload).length
      ? { brand_payload: pickBrandLookBundlePayload(input.brand_payload) }
      : {}),
    look_presets: input.look_presets,
  };
}

export function remapBrandPayloadLibraryIds(
  payload: Record<string, unknown>,
  idMap: Record<string, string>,
): Record<string, unknown> {
  const hints = getBrandLookPresetHints(payload);
  const exportHints: LookPresetBrandHints = {
    category: String(payload.category || 'general'),
    default_look_preset_seed_id: hints.defaultSeedId,
    recommended_look_preset_seed_ids: hints.recommendedSeedIds,
    default_look_preset_library_id: hints.defaultLibraryId,
    recommended_look_preset_library_ids: hints.recommendedLibraryIds,
  };
  return mergeBrandLookHintsIntoPayload(payload, remapBrandLookLibraryIds(exportHints, idMap));
}

function parseBrandHints(raw: unknown): LookPresetBrandHints | null {
  if (!raw || typeof raw !== 'object') return null;
  const doc = raw as Record<string, unknown>;
  const category = String(doc.category || '').trim();
  if (!category) return null;
  const defaultSeed = String(doc.default_look_preset_seed_id || '').trim() || undefined;
  const recommendedSeeds = Array.isArray(doc.recommended_look_preset_seed_ids)
    ? doc.recommended_look_preset_seed_ids.map((id) => String(id).trim()).filter(Boolean)
    : undefined;
  const defaultLibrary = String(doc.default_look_preset_library_id || '').trim() || undefined;
  const recommendedLibrary = Array.isArray(doc.recommended_look_preset_library_ids)
    ? doc.recommended_look_preset_library_ids.map((id) => String(id).trim()).filter(Boolean)
    : undefined;
  if (!defaultSeed && !recommendedSeeds?.length && !defaultLibrary && !recommendedLibrary?.length) {
    return null;
  }
  return {
    category,
    default_look_preset_seed_id: defaultSeed,
    recommended_look_preset_seed_ids: recommendedSeeds,
    default_look_preset_library_id: defaultLibrary,
    recommended_look_preset_library_ids: recommendedLibrary,
  };
}

export function parseBrandLookBundleDocument(raw: unknown): BrandLookBundleDocument {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid brand look bundle JSON');
  }
  const doc = raw as Record<string, unknown>;
  if (doc.format !== BRAND_LOOK_BUNDLE_FORMAT) {
    throw new Error(`Unsupported bundle format: ${String(doc.format || 'unknown')}`);
  }
  if (Number(doc.version) !== BRAND_LOOK_BUNDLE_VERSION) {
    throw new Error(`Unsupported bundle version: ${String(doc.version)}`);
  }
  const brandHints = parseBrandHints(doc.brand_hints);
  if (!brandHints) throw new Error('Missing or invalid brand_hints');
  const presetsRaw = Array.isArray(doc.look_presets) ? doc.look_presets : [];
  const look_presets = presetsRaw.map((preset) => {
    const parsed = parseLookPresetImportDocument(preset);
    const raw = preset as Record<string, unknown>;
    const sourceLibraryId = String(raw.source_library_id || '').trim() || undefined;
    return buildLookPresetExportDocument({
      name: parsed.name,
      description: parsed.description,
      tags: parsed.tags,
      payload: parsed.payload,
      brand_hints: parsed.brand_hints,
      libraryId: sourceLibraryId,
    });
  });
  const brandPayload = doc.brand_payload && typeof doc.brand_payload === 'object'
    ? doc.brand_payload as Record<string, unknown>
    : undefined;

  return {
    format: BRAND_LOOK_BUNDLE_FORMAT,
    version: BRAND_LOOK_BUNDLE_VERSION,
    exported_at: String(doc.exported_at || new Date().toISOString()),
    brand_name: String(doc.brand_name || '').trim() || undefined,
    brand_hints: brandHints,
    ...(brandPayload ? { brand_payload: brandPayload } : {}),
    look_presets,
  };
}

export interface LookPresetUpsertPlan {
  mode: 'create' | 'update';
  existingId?: string;
  source_library_id?: string;
  name: string;
  description?: string;
  tags?: string[];
  payload: LookPresetPayload;
}

export function remapBrandLookLibraryIds(
  hints: LookPresetBrandHints,
  idMap: Record<string, string>,
): LookPresetBrandHints {
  const remap = (id?: string) => {
    const key = String(id || '').trim();
    if (!key) return undefined;
    return idMap[key] || key;
  };
  const remapList = (ids?: string[]) => {
    if (!ids?.length) return undefined;
    return [...new Set(ids.map((id) => remap(id)).filter(Boolean) as string[])];
  };
  return {
    ...hints,
    default_look_preset_library_id: remap(hints.default_look_preset_library_id),
    recommended_look_preset_library_ids: remapList(hints.recommended_look_preset_library_ids),
  };
}

export function buildLibraryIdRemapFromUpsertResults(
  plans: LookPresetUpsertPlan[],
  resultIds: string[],
): Record<string, string> {
  const map: Record<string, string> = {};
  plans.forEach((plan, index) => {
    const source = String(plan.source_library_id || '').trim();
    const nextId = String(resultIds[index] || '').trim();
    if (!source || !nextId) return;
    map[source] = nextId;
  });
  return map;
}

export function planLookPresetUpserts(
  existingItems: LibraryLookPresetItem[],
  presets: LookPresetExportDocument[],
): LookPresetUpsertPlan[] {
  return presets.map((doc) => {
    const seedId = String(doc.payload.seed_id || '').trim();
    const existing = existingItems.find((item) => {
      if (seedId && String(item.payload?.seed_id || '').trim() === seedId) return true;
      return !seedId && item.name === doc.name;
    });
    return {
      mode: existing ? 'update' : 'create',
      existingId: existing?.id,
      source_library_id: String(doc.source_library_id || '').trim() || undefined,
      name: doc.name,
      description: doc.description,
      tags: doc.tags,
      payload: doc.payload,
    };
  });
}