/**
 * Digital human layout tokens from opentalking frame.md / Canvas.tsx.
 * Reference: layout_avatar_intro, Toolbar.addAvatarElement.
 */

export interface DigitalHumanLayoutPreset {
  x: number;
  y: number;
  width: number;
  height: number;
  objectFit: 'contain' | 'cover';
}

/** 1080×1920 reference canvas (opentalking shopping-guide). */
export const OPENTALKING_DH_LAYOUTS = {
  /** frame.md layout_avatar_intro — centered intro talking head */
  avatar_intro: { x: 50, y: 45, width: 900, height: 900, objectFit: 'contain' },
  /** Toolbar.addAvatarElement — side placement */
  avatar_side: { x: 20, y: 60, width: 360, height: 480, objectFit: 'contain' },
  /** Typical narration segment in opentalking demo templates */
  avatar_talking: { x: 50, y: 72, width: 420, height: 560, objectFit: 'contain' },
} as const satisfies Record<string, DigitalHumanLayoutPreset>;

export interface DigitalHumanCatalogEntry {
  name?: string;
  half_body_photo_url?: string;
  half_body_cutout_url?: string;
  face_photo_url?: string;
}

export type DigitalHumanCatalog = Record<string, DigitalHumanCatalogEntry>;

export function resolveDigitalHumanLayout(
  layout: string | undefined,
  position: { x: number; y: number },
  scale: number,
  canvasWidth = 1080,
): DigitalHumanLayoutPreset & { scale: number } {
  let preset: DigitalHumanLayoutPreset = OPENTALKING_DH_LAYOUTS.avatar_talking;
  if (layout === 'avatar-left') preset = { ...OPENTALKING_DH_LAYOUTS.avatar_side, x: 22 };
  else if (layout === 'avatar-right') preset = { ...OPENTALKING_DH_LAYOUTS.avatar_side, x: 78 };
  else if (layout === 'avatar-center') preset = OPENTALKING_DH_LAYOUTS.avatar_talking;

  const width = Math.round((preset.width * Math.max(20, scale)) / 100);
  const height = Math.round((preset.height * Math.max(20, scale)) / 100);
  const x = Number.isFinite(position.x) ? position.x : preset.x;
  const y = Number.isFinite(position.y) ? position.y : preset.y;

  return {
    x,
    y,
    width: Math.min(width, canvasWidth),
    height,
    objectFit: preset.objectFit,
    scale,
  };
}

export function resolveDigitalHumanImageUrl(
  avatarId: string | undefined,
  catalog: DigitalHumanCatalog | undefined,
): string {
  if (!avatarId || !catalog?.[avatarId]) return '';
  const entry = catalog[avatarId];
  return String(entry.half_body_cutout_url || entry.half_body_photo_url || '').trim();
}