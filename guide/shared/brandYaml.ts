import YAML from 'js-yaml';
import { logoSettingsToPayload, parseBrandLogoFromYaml } from './brandLogo.js';
import type {
  AnimationPreset,
  BrandAssetDoc,
  BrandPresets,
  DesignSystem,
  ElementLibraryItem,
  FrameTemplate,
  LayoutPreset,
  ShapePreset,
  SubtitleStylePreset,
  TextStylePreset,
} from './brandTypes.js';

export function extractFrontmatter(text: string): Record<string, unknown> {
  const match = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!match) return {};
  try {
    return (YAML.load(match[1]) as Record<string, unknown>) || {};
  } catch {
    return {};
  }
}

export function wrapFrontmatter(data: unknown): string {
  return `---\n${YAML.dump(data, { indent: 2, lineWidth: 120 })}---\n`;
}

export function parseDesignMarkdown(text: string): DesignSystem {
  const data = extractFrontmatter(text);
  const brandLogo = parseBrandLogoFromYaml(data);
  return {
    name: String(data.name || ''),
    description: String(data.description || ''),
    colors: (data.colors as Record<string, string>) || {},
    typography: (data.typography as Record<string, unknown>) || {},
    rounded: (data.rounded as Record<string, number | string>) || {},
    spacing: (data.spacing as Record<string, number | string>) || {},
    ...(brandLogo ? { brandLogo } : {}),
  };
}

function normalizePresets(raw: Record<string, unknown> | undefined): BrandPresets {
  const p = raw || {};
  return {
    colorPalette: Array.isArray(p.colorPalette) ? p.colorPalette as BrandPresets['colorPalette'] : [],
    textStyles: Array.isArray(p.textStyles) ? p.textStyles as TextStylePreset[] : [],
    animationPresets: Array.isArray(p.animationPresets) ? p.animationPresets as AnimationPreset[] : [],
    subtitleStyles: Array.isArray(p.subtitleStyles) ? p.subtitleStyles as SubtitleStylePreset[] : [],
    layoutPresets: Array.isArray(p.layoutPresets) ? p.layoutPresets as LayoutPreset[] : [],
    shapePresets: Array.isArray(p.shapePresets) ? p.shapePresets as ShapePreset[] : [],
    elementLibrary: Array.isArray(p.elementLibrary) ? p.elementLibrary as ElementLibraryItem[] : [],
  };
}

export function parseFrameMarkdown(text: string): { frames: FrameTemplate[]; presets: BrandPresets } {
  const data = extractFrontmatter(text);
  const rawFrames = Array.isArray(data.frames) ? data.frames : [];
  const frames: FrameTemplate[] = rawFrames.map((item) => {
    const r = item as Record<string, unknown>;
    return {
      id: String(r.id || `frame_${Date.now()}`),
      name: String(r.name || ''),
      shotType: String(r.shotType || 'avatar_talking'),
      duration: Number(r.duration || 5),
      description: r.description ? String(r.description) : undefined,
      variables: Array.isArray(r.variables) ? r.variables.map(String) : [],
      defaultData: (r.defaultData as Record<string, unknown>) || {},
      hyperframesTemplate: r.hyperframesTemplate ? String(r.hyperframesTemplate) : undefined,
    };
  });
  return {
    frames,
    presets: normalizePresets(data.presets as Record<string, unknown>),
  };
}

export function designToMarkdown(design: DesignSystem): string {
  const body: Record<string, unknown> = {
    name: design.name,
    description: design.description,
    colors: design.colors,
    typography: design.typography,
    rounded: design.rounded,
    spacing: design.spacing,
  };
  if (design.brandLogo) {
    body.brandLogo = {
      enabled: design.brandLogo.enabled,
      logoLabel: design.brandLogo.logoLabel,
      logoUrl: design.brandLogo.logoUrl || '',
      elementId: design.brandLogo.elementId || '',
      activeSubBrandId: design.brandLogo.activeSubBrandId || '',
      subBrands: (design.brandLogo.subBrands || []).map((s) => ({
        id: s.id,
        name: s.name,
        enabled: s.enabled,
        logoUrl: s.logoUrl || '',
        logoLabel: s.logoLabel || '',
        elementId: s.elementId || '',
      })),
    };
  }
  return wrapFrontmatter(body);
}

export function frameToMarkdown(frames: FrameTemplate[], presets: BrandPresets): string {
  return wrapFrontmatter({
    frames: frames.map((f) => ({
      id: f.id,
      name: f.name,
      shotType: f.shotType,
      duration: f.duration,
      description: f.description,
      variables: f.variables,
      defaultData: f.defaultData,
      hyperframesTemplate: f.hyperframesTemplate,
    })),
    presets,
  });
}

export function parseBrandAssetDocs(designMd: string, frameMd: string): BrandAssetDoc {
  const design = parseDesignMarkdown(designMd);
  const { frames, presets } = parseFrameMarkdown(frameMd);
  return {
    design,
    frames,
    presets,
    design_markdown: designMd.trim() ? designMd : designToMarkdown(design),
    frame_markdown: frameMd.trim() ? frameMd : frameToMarkdown(frames, presets),
  };
}

export function brandDocToLibraryPayload(
  doc: BrandAssetDoc,
  extras: Record<string, unknown> = {},
): Record<string, unknown> {
  const primaryColor = doc.design.colors['digital-orange']
    || doc.presets.colorPalette[0]?.value
    || '#2563eb';
  const bgColor = doc.design.colors['soft-pink'] || '#f6f8fb';
  const textColor = doc.design.colors['light-text'] || '#ffffff';
  const fonts = Array.isArray((doc.design.typography as { fonts?: unknown[] }).fonts)
    ? (doc.design.typography as { fonts: Array<Record<string, string>> }).fonts
    : [];

  const logoFields = doc.design.brandLogo ? logoSettingsToPayload(doc.design.brandLogo) : {};
  return {
    ...extras,
    ...logoFields,
    brand_color: primaryColor,
    background_color: bgColor,
    text_color: textColor,
    accent_color: doc.design.colors['trust-blue'] || '#2563eb',
    subtitle_style: doc.presets.subtitleStyles[0]?.id || 'default',
    subtitle_position: 'bottom',
    logo_label: doc.design.brandLogo?.logoLabel || doc.design.name.slice(0, 4) || '品牌',
    design_markdown: doc.design_markdown,
    frame_markdown: doc.frame_markdown,
    tokens: {
      colors: doc.design.colors,
      typography: doc.design.typography,
      rounded: doc.design.rounded,
      spacing: doc.design.spacing,
    },
    presets: doc.presets,
    frames: doc.frames,
    fonts,
  };
}

export { EMPTY_PRESETS } from './brandTypes.js';