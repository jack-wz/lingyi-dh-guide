import { parseDesignMarkdown } from './brandYaml.js';
import { resolveActiveLogo, resolveLogoSettings } from './brandLogo.js';

export interface BrandPackRow {
  id: string;
  payload: Record<string, unknown>;
}

/** Merge library brand pack into DSL globalConfig for preview/render parity. */
export function hydrateBrandPackInDsl<T extends { globalConfig?: Record<string, unknown> }>(
  dsl: T,
  brandPack?: BrandPackRow | null,
): T {
  const draft = structuredClone(dsl);
  const gc = { ...(draft.globalConfig || {}) } as Record<string, unknown>;
  draft.globalConfig = gc;

  const packId = String(gc.brand_pack_id || '').trim();
  if (!packId || !brandPack || brandPack.id !== packId) return draft;

  const payload = brandPack.payload || {};
  const existing = (gc.brand_pack || {}) as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...payload, ...existing };

  const freshTokens = payload.tokens as Record<string, unknown> | undefined;
  const existTokens = existing.tokens as Record<string, unknown> | undefined;
  const freshTypography = freshTokens?.typography as Record<string, unknown> | undefined;
  const existTypography = existTokens?.typography as Record<string, unknown> | undefined;
  if (freshTypography?.fonts) {
    merged.tokens = {
      ...(freshTokens || {}),
      ...(existTokens || {}),
      typography: {
        ...(freshTypography || {}),
        ...(existTypography || {}),
        fonts: freshTypography.fonts,
      },
    };
  }

  gc.brand_pack = merged;

  const fonts = ((merged.tokens as Record<string, unknown> | undefined)?.typography as Record<string, unknown> | undefined)?.fonts as Array<{ family?: string }> | undefined;
  if (!gc.default_font_family && fonts?.[0]?.family) {
    gc.default_font_family = fonts[0].family;
  }
  if (!gc.brand_color && payload.brand_color) gc.brand_color = payload.brand_color;
  if (!gc.background_color && payload.background_color) gc.background_color = payload.background_color;
  const designMd = String(payload.design_markdown || '');
  const design = designMd ? parseDesignMarkdown(designMd) : { name: String(payload.logo_label || ''), description: '', colors: {}, typography: {}, rounded: {}, spacing: {} };
  const logoSettings = resolveLogoSettings(design, payload);
  const activeLogo = resolveActiveLogo(logoSettings);
  if (!gc.brand_logo_url && activeLogo.enabled && activeLogo.url) {
    gc.brand_logo_url = activeLogo.url;
  } else if (!gc.brand_logo_url && payload.brand_logo_url) {
    gc.brand_logo_url = payload.brand_logo_url;
  }

  const subtitleStyle = payload.subtitle_style;
  const segments = (draft as { segments?: Array<{ subtitle?: { style_id?: string } }> }).segments;
  if (subtitleStyle && Array.isArray(segments)) {
    for (const seg of segments) {
      if (seg.subtitle && !seg.subtitle.style_id) {
        seg.subtitle.style_id = String(subtitleStyle);
      }
    }
  }

  return draft;
}