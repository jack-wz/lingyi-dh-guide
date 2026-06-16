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

/** Opentalking default talking-head placement for narration segments. */
export function opentalkingDigitalHumanDefaults(enabled = true) {
  const preset = OPENTALKING_DH_LAYOUTS.avatar_talking;
  return {
    enabled,
    position: { x: preset.x, y: preset.y },
    scale: 100,
  };
}