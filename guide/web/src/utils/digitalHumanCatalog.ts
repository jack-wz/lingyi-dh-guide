import type { DSL } from '../store/editorStore';
import { OPENTALKING_DH_LAYOUTS } from '@shared/digitalHumanStyle';

export interface DigitalHumanRecord {
  id: string;
  name?: string;
  half_body_photo_url?: string;
  half_body_cutout_url?: string;
  face_photo_url?: string;
}

export function buildDigitalHumanCatalogEntry(dh: DigitalHumanRecord) {
  return {
    name: dh.name || '',
    half_body_photo_url: dh.half_body_photo_url || '',
    half_body_cutout_url: dh.half_body_cutout_url || '',
    face_photo_url: dh.face_photo_url || '',
  };
}

export async function fetchDigitalHumanRecord(id: string): Promise<DigitalHumanRecord | null> {
  if (!id) return null;
  const res = await fetch(`/api/digital-humans/${id}`);
  if (!res.ok) return null;
  return res.json() as Promise<DigitalHumanRecord>;
}

export function applyDigitalHumanCatalogToDsl(dsl: DSL, dh: DigitalHumanRecord): DSL {
  const catalog = {
    ...(dsl.globalConfig.digital_human_catalog || {}),
    [dh.id]: buildDigitalHumanCatalogEntry(dh),
  };
  return {
    ...dsl,
    globalConfig: {
      ...dsl.globalConfig,
      digital_human_catalog: catalog,
    },
  };
}

/**
 * Fully bind a digital human to the DSL: updates meta.digital_human_id,
 * every segment's avatar_id, and the digital_human_catalog entry.
 *
 * Use this instead of applyDigitalHumanCatalogToDsl when switching the
 * active digital human — the catalog-only helper leaves meta/segments
 * pointing at the previous DH, causing render-time voice/avatar mismatches.
 */
export function bindDigitalHumanToDsl(dsl: DSL, dhId: string): DSL {
  if (!dhId) return dsl;
  const talkingDefaults = opentalkingDigitalHumanDefaults(true);
  return {
    ...dsl,
    meta: { ...dsl.meta, digital_human_id: dhId },
    segments: (dsl.segments || []).map((seg) => ({
      ...seg,
      avatar_id: dhId,
      digital_human: {
        ...talkingDefaults,
        ...(seg.digital_human || {}),
        enabled: seg.type === 'narration' ? true : (seg.digital_human?.enabled ?? false),
      },
    })),
  };
}

/**
 * Returns the canonical digital human id for a DSL: prefers meta, then the
 * first segment avatar_id. Returns '' when none is set.
 */
export function dslDigitalHumanId(dsl: { meta?: { digital_human_id?: string }; segments?: Array<{ avatar_id?: string }> }): string {
  const fromMeta = (dsl.meta?.digital_human_id || '').trim();
  if (fromMeta) return fromMeta;
  const seg = (dsl.segments || []).find((s) => (s.avatar_id || '').trim());
  return seg ? (seg.avatar_id as string) : '';
}

/** Opentalking default talking-head placement for narration segments. */
export function opentalkingDigitalHumanDefaults(enabled = true) {
  const preset = OPENTALKING_DH_LAYOUTS.avatar_talking;
  return {
    enabled,
    position: { x: preset.x, y: preset.y },
    scale: 100,
  };
}