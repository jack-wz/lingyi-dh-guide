import type { BrandLogoSettings, DesignSystem, SubBrandConfig } from './brandTypes.js';

export function defaultLogoSettings(name = '品牌'): BrandLogoSettings {
  return {
    enabled: true,
    logoLabel: name.slice(0, 4) || '品牌',
    logoUrl: '',
    elementId: '',
    activeSubBrandId: null,
    subBrands: [],
  };
}

function normalizeSubBrand(raw: unknown): SubBrandConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = String(r.id || '').trim();
  if (!id) return null;
  return {
    id,
    name: String(r.name || id),
    enabled: r.enabled !== false,
    logoUrl: r.logoUrl ? String(r.logoUrl) : r.logo_url ? String(r.logo_url) : undefined,
    logoLabel: r.logoLabel ? String(r.logoLabel) : r.logo_label ? String(r.logo_label) : undefined,
    elementId: r.elementId ? String(r.elementId) : r.element_id ? String(r.element_id) : undefined,
  };
}

/** Parse brandLogo block from design.md frontmatter */
export function parseBrandLogoFromYaml(data: Record<string, unknown>): BrandLogoSettings | undefined {
  const raw = data.brandLogo ?? data.brand_logo;
  if (!raw || typeof raw !== 'object') return undefined;
  const block = raw as Record<string, unknown>;
  const subRaw = block.subBrands ?? block.sub_brands;
  const subBrands = Array.isArray(subRaw)
    ? subRaw.map(normalizeSubBrand).filter((s): s is SubBrandConfig => Boolean(s))
    : [];

  return {
    enabled: block.enabled !== false && block.use_logo !== false,
    logoUrl: String(block.logoUrl || block.logo_url || block.brand_logo_url || ''),
    logoLabel: String(block.logoLabel || block.logo_label || ''),
    elementId: String(block.elementId || block.element_id || block.logo_element_id || ''),
    activeSubBrandId: block.activeSubBrandId
      ? String(block.activeSubBrandId)
      : block.active_sub_brand_id
        ? String(block.active_sub_brand_id)
        : null,
    subBrands,
  };
}

export function logoSettingsFromPayload(payload: Record<string, unknown>, brandName = ''): BrandLogoSettings {
  const subBrands = Array.isArray(payload.sub_brands)
    ? payload.sub_brands.map(normalizeSubBrand).filter((s): s is SubBrandConfig => Boolean(s))
    : [];
  return {
    enabled: payload.use_logo !== false,
    logoUrl: String(payload.brand_logo_url || ''),
    logoLabel: String(payload.logo_label || brandName.slice(0, 4) || '品牌'),
    elementId: String(payload.logo_element_id || ''),
    activeSubBrandId: payload.active_sub_brand_id ? String(payload.active_sub_brand_id) : null,
    subBrands,
  };
}

/** design.md brandLogo 优先，payload 作回填 */
export function resolveLogoSettings(design: DesignSystem, payload: Record<string, unknown> = {}): BrandLogoSettings {
  const base = defaultLogoSettings(design.name);
  const fromPayload = logoSettingsFromPayload(payload, design.name);
  const fromDesign = design.brandLogo;
  if (!fromDesign) return fromPayload;
  return {
    ...base,
    ...fromPayload,
    ...fromDesign,
    logoLabel: fromDesign.logoLabel || fromPayload.logoLabel || base.logoLabel,
    subBrands: fromDesign.subBrands?.length ? fromDesign.subBrands : fromPayload.subBrands,
  };
}

export function attachLogoToDesign(design: DesignSystem, settings: BrandLogoSettings): DesignSystem {
  return { ...design, brandLogo: settings };
}

export function logoSettingsToPayload(settings: BrandLogoSettings): Record<string, unknown> {
  return {
    use_logo: settings.enabled,
    brand_logo_url: settings.logoUrl || '',
    logo_label: settings.logoLabel || '品牌',
    logo_element_id: settings.elementId || '',
    active_sub_brand_id: settings.activeSubBrandId || '',
    sub_brands: settings.subBrands,
  };
}

export function resolveActiveLogo(settings: BrandLogoSettings): { url: string; label: string; enabled: boolean } {
  if (!settings.enabled) return { url: '', label: settings.logoLabel, enabled: false };

  const activeSub = settings.activeSubBrandId
    ? settings.subBrands.find((s) => s.id === settings.activeSubBrandId && s.enabled)
    : null;
  const enabledSub = settings.subBrands.find((s) => s.enabled);

  const pick = activeSub || enabledSub;
  if (pick?.logoUrl) {
    return { url: pick.logoUrl, label: pick.logoLabel || pick.name, enabled: true };
  }
  if (pick?.logoLabel) {
    return { url: settings.logoUrl || '', label: pick.logoLabel, enabled: true };
  }
  return {
    url: settings.logoUrl || '',
    label: settings.logoLabel || '品牌',
    enabled: true,
  };
}