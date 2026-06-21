import {
  LOOK_PRESET_REGISTRY_VERSION,
  parseLookPresetPayload,
  type LookPresetPayload,
} from './lookPreset.js';
import {
  getBrandHintsForLookSeed,
  resolveLookPresetBrandHints,
  type LookPresetBrandHints,
} from './brandLookPreset.js';

export const LOOK_PRESET_EXPORT_FORMAT = 'guide-look-preset';
export const LOOK_PRESET_EXPORT_VERSION = 1;

export interface LookPresetExportDocument {
  format: typeof LOOK_PRESET_EXPORT_FORMAT;
  version: typeof LOOK_PRESET_EXPORT_VERSION;
  name: string;
  description?: string;
  tags?: string[];
  payload: LookPresetPayload;
  exported_at: string;
  registry_version: string;
  brand_hints?: LookPresetBrandHints;
  /** Original library row id when exported from asset hub (for cross-env remap). */
  source_library_id?: string;
}

export function buildLookPresetExportDocument(input: {
  name: string;
  description?: string;
  tags?: string[];
  payload: LookPresetPayload;
  brand_hints?: LookPresetBrandHints;
  libraryId?: string;
}): LookPresetExportDocument {
  const payload = parseLookPresetPayload(input.payload);
  if (!payload) {
    throw new Error('Invalid look preset payload');
  }
  const brandHints = input.brand_hints ?? resolveLookPresetBrandHints({
    payload,
    libraryId: input.libraryId,
  });
  return {
    format: LOOK_PRESET_EXPORT_FORMAT,
    version: LOOK_PRESET_EXPORT_VERSION,
    name: String(input.name || '外观预设').trim() || '外观预设',
    description: input.description?.trim() || undefined,
    tags: input.tags?.length ? input.tags.map(String) : undefined,
    payload,
    exported_at: new Date().toISOString(),
    registry_version: LOOK_PRESET_REGISTRY_VERSION,
    ...(brandHints ? { brand_hints: brandHints } : {}),
    ...(input.libraryId ? { source_library_id: input.libraryId } : {}),
  };
}

export function parseLookPresetBrandHintsJson(raw: unknown): LookPresetBrandHints {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid brand_hints JSON');
  }
  const doc = raw as Record<string, unknown>;
  const hints = parseBrandHints(doc.brand_hints ?? doc);
  if (!hints) throw new Error('Missing brand_hints fields');
  return hints;
}

export function parseLookPresetImportDocument(raw: unknown): {
  name: string;
  description: string;
  tags?: string[];
  payload: LookPresetPayload;
  brand_hints?: LookPresetBrandHints;
} {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid JSON');
  }
  const doc = raw as Record<string, unknown>;
  if (doc.format === LOOK_PRESET_EXPORT_FORMAT) {
    const payload = parseLookPresetPayload(doc.payload);
    if (!payload) throw new Error('Missing or invalid payload');
    const brandHints = parseBrandHints(doc.brand_hints);
    return {
      name: String(doc.name || '导入的外观预设').trim() || '导入的外观预设',
      description: String(doc.description || '').trim(),
      tags: Array.isArray(doc.tags) ? doc.tags.map(String) : undefined,
      payload,
      ...(brandHints ? { brand_hints: brandHints } : {}),
    };
  }
  const payload = parseLookPresetPayload(doc.payload ?? doc);
  if (!payload) throw new Error('Missing subtitle_style_id / transition_type / hf_overlays');
  const brandHints = parseBrandHints(doc.brand_hints);
  return {
    name: String(doc.name || '导入的外观预设').trim() || '导入的外观预设',
    description: String(doc.description || '').trim(),
    tags: Array.isArray(doc.tags) ? doc.tags.map(String) : undefined,
    payload,
    ...(brandHints ? { brand_hints: brandHints } : {}),
  };
}

function parseBrandHints(raw: unknown): LookPresetBrandHints | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const hints = raw as Record<string, unknown>;
  const defaultSeed = String(hints.default_look_preset_seed_id || '').trim();
  const recommended = Array.isArray(hints.recommended_look_preset_seed_ids)
    ? hints.recommended_look_preset_seed_ids.map((id) => String(id).trim()).filter(Boolean)
    : [];
  const defaultLibrary = String(hints.default_look_preset_library_id || '').trim();
  const recommendedLibrary = Array.isArray(hints.recommended_look_preset_library_ids)
    ? hints.recommended_look_preset_library_ids.map((id) => String(id).trim()).filter(Boolean)
    : [];
  const category = String(hints.category || '').trim();
  if (!defaultSeed && !recommended.length && !defaultLibrary && !recommendedLibrary.length && !category) {
    return undefined;
  }
  const ordered = defaultSeed
    ? [defaultSeed, ...recommended.filter((id) => id !== defaultSeed)]
    : recommended;
  const libOrdered = defaultLibrary
    ? [defaultLibrary, ...recommendedLibrary.filter((id) => id !== defaultLibrary)]
    : recommendedLibrary;
  return {
    category: category || 'general',
    ...(defaultSeed || ordered.length
      ? {
        default_look_preset_seed_id: defaultSeed || ordered[0] || undefined,
        recommended_look_preset_seed_ids: ordered.length ? [...new Set(ordered)] : undefined,
      }
      : {}),
    ...(defaultLibrary || libOrdered.length
      ? {
        default_look_preset_library_id: defaultLibrary || libOrdered[0] || undefined,
        recommended_look_preset_library_ids: libOrdered.length ? [...new Set(libOrdered)] : undefined,
      }
      : {}),
  };
}