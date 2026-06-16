import { resolveLogoSettings } from './brandLogo.js';
import { parseDesignMarkdown } from './brandYaml.js';
import { designToFlatBrand, type ParsedDesignMd } from './parsers/designMd.js';
import { parseDesignMd } from './parsers/designMd.js';
import { parseFrameMd, subtitlePresetToStyleId, type ParsedFrameMd } from './parsers/frameMd.js';
import { buildSubtitleStyleRenderMap, normalizeSubtitleStyleId } from './subtitleStyles.js';

export type { ParsedDesignMd, ParsedFrameMd };
export { parseDesignMd, parseFrameMd, designToFlatBrand, subtitlePresetToStyleId };

export interface BrandPackPayload {
  external_id?: string;
  source?: string;
  category?: string;
  brand_color?: string;
  background_color?: string;
  accent_color?: string;
  text_color?: string;
  subtitle_style?: string;
  subtitle_position?: string;
  logo_label?: string;
  use_logo?: boolean;
  brand_logo_url?: string;
  logo_element_id?: string;
  active_sub_brand_id?: string;
  sub_brands?: Array<{
    id: string;
    name: string;
    enabled: boolean;
    logoUrl?: string;
    logoLabel?: string;
    elementId?: string;
  }>;
  design_markdown?: string;
  frame_markdown?: string;
  tokens?: {
    colors: Record<string, string>;
    typography: {
      fonts: Array<{ name: string; family: string; style?: string; class?: string; url?: string }>;
      heading?: { fontFamily: string; fontWeight?: number };
      body?: { fontFamily: string; fontWeight?: number };
    };
    rounded?: Record<string, number>;
    spacing?: Record<string, number>;
  };
  presets?: ParsedFrameMd['presets'] & {
    animationPresets?: Array<{ id: string; name: string; type: string; animation: string; duration: number; easing: string }>;
    shapePresets?: Array<{ id: string; name: string; shape: string; fill?: string; stroke?: string; strokeWidth?: number; borderRadius?: number }>;
    elementLibrary?: Array<{ id: string; name: string; type: string; category?: string; previewUrl?: string; defaultContent?: string }>;
  };
  frames?: ParsedFrameMd['frames'];
  brand_pack_id?: string;
}

export interface BrandPackView {
  id: string;
  name: string;
  description: string;
  brandColor: string;
  backgroundColor: string;
  accentColor: string;
  textColor: string;
  subtitleStyle: string;
  subtitlePosition: 'top' | 'center' | 'bottom';
  logoLabel: string;
  logoUrl: string;
  useLogo: boolean;
  activeSubBrandId: string;
  subBrands: NonNullable<BrandPackPayload['sub_brands']>;
  titleText: string;
  defaultFontFamily: string;
  fontCount: number;
  frameCount: number;
  presetCount: number;
  fonts: BrandPackPayload['tokens'] extends infer T ? T extends { typography: { fonts: infer F } } ? F : never : never;
  frames: NonNullable<BrandPackPayload['frames']>;
  presets: NonNullable<BrandPackPayload['presets']>;
  tokens: BrandPackPayload['tokens'];
}

export function buildBrandPackPayload(
  design: ParsedDesignMd,
  frame: ParsedFrameMd | null,
  extras: Partial<BrandPackPayload> = {},
): BrandPackPayload {
  const flat = designToFlatBrand(design);
  const firstSub = frame?.presets.subtitleStyles[0];
  const subtitleStyle = firstSub ? subtitlePresetToStyleId(firstSub.id) : flat.subtitle_style;

  return {
    ...flat,
    ...extras,
    subtitle_style: subtitleStyle,
    design_markdown: design.raw,
    frame_markdown: frame?.raw || '',
    tokens: {
      colors: design.colors,
      typography: {
        fonts: design.typography.fonts.map((f) => ({ ...f })),
        heading: design.typography.heading,
        body: design.typography.body,
      },
      rounded: design.rounded,
      spacing: design.spacing,
    },
    presets: frame?.presets || { colorPalette: [], textStyles: [], subtitleStyles: [], layoutPresets: [] },
    frames: frame?.frames || [],
  };
}

export function libraryPayloadToBrandPack(item: {
  id: string;
  name: string;
  description?: string;
  payload?: Record<string, unknown>;
}): BrandPackView {
  const p = (item.payload || {}) as BrandPackPayload;
  const tokens = p.tokens;
  const fonts = tokens?.typography?.fonts || [];
  const frames = p.frames || [];
  const presets = p.presets || { colorPalette: [], textStyles: [], subtitleStyles: [], layoutPresets: [] };
  const defaultFont = fonts[0]?.family
    || tokens?.typography?.body?.fontFamily
    || tokens?.typography?.heading?.fontFamily
    || "'PingFang SC','Microsoft YaHei',sans-serif";

  const subtitlePosition = String(p.subtitle_position || 'bottom') as 'top' | 'center' | 'bottom';

  const designMd = String(p.design_markdown || '');
  const logoResolved = designMd
    ? resolveLogoSettings(parseDesignMarkdown(designMd), p as Record<string, unknown>)
    : resolveLogoSettings({ name: item.name, description: '', colors: {}, typography: {}, rounded: {}, spacing: {} }, p as Record<string, unknown>);

  return {
    id: item.id,
    name: item.name,
    description: item.description || '',
    brandColor: String(p.brand_color || tokens?.colors?.['digital-orange'] || '#2563eb'),
    backgroundColor: String(p.background_color || tokens?.colors?.['soft-pink'] || '#f6f8fb'),
    accentColor: String(p.accent_color || tokens?.colors?.['trust-blue'] || '#2563eb'),
    textColor: String(p.text_color || tokens?.colors?.['light-text'] || '#ffffff'),
    subtitleStyle: String(p.subtitle_style || 'default'),
    subtitlePosition,
    logoLabel: logoResolved.logoLabel || String(p.logo_label || '品牌'),
    logoUrl: logoResolved.logoUrl || String(p.brand_logo_url || ''),
    useLogo: logoResolved.enabled,
    activeSubBrandId: String(logoResolved.activeSubBrandId || p.active_sub_brand_id || ''),
    subBrands: logoResolved.subBrands,
    titleText: '关键信息',
    defaultFontFamily: defaultFont,
    fontCount: fonts.length,
    frameCount: frames.length,
    presetCount:
      (presets.colorPalette?.length || 0)
      + (presets.textStyles?.length || 0)
      + ((presets as { animationPresets?: unknown[] }).animationPresets?.length || 0)
      + (presets.subtitleStyles?.length || 0)
      + (presets.layoutPresets?.length || 0)
      + ((presets as { shapePresets?: unknown[] }).shapePresets?.length || 0)
      + ((presets as { elementLibrary?: unknown[] }).elementLibrary?.length || 0),
    fonts,
    frames,
    presets,
    tokens,
  };
}

export interface BrandTokenInjection {
  cssVariables: string;
  fontFaceCss: string;
  defaultFontFamily: string;
  subtitleStyleMap: Record<string, { color: string; bg: string; size: string; weight: number; fontFamily: string }>;
}

export function buildBrandTokenInjection(payload?: BrandPackPayload | null): BrandTokenInjection {
  const tokens = payload?.tokens;
  const colors = tokens?.colors || {};
  const fonts = tokens?.typography?.fonts || [];
  const defaultFont = fonts[0]?.family
    || tokens?.typography?.body?.fontFamily
    || "'PingFang SC','Microsoft YaHei',sans-serif";

  const cssVars = [
    `--brand-primary:${colors['digital-orange'] || payload?.brand_color || '#ff5600'}`,
    `--brand-accent:${colors['trust-blue'] || payload?.accent_color || '#2563eb'}`,
    `--brand-bg:${colors['soft-pink'] || payload?.background_color || '#fff0e8'}`,
    `--brand-text:${colors['light-text'] || payload?.text_color || '#ffffff'}`,
    `--font-sans:${defaultFont}`,
  ].join(';');

  const fontFaceCss = fonts
    .filter((f) => f.url)
    .map((f) => {
      const url = String(f.url);
      const fmt = /\.woff2($|\?)/i.test(url) ? 'woff2'
        : /\.otf($|\?)/i.test(url) ? 'opentype'
        : /\.woff($|\?)/i.test(url) ? 'woff'
        : 'truetype';
      return `@font-face{font-family:'${f.family}';src:url('${f.url}') format('${fmt}');font-display:swap;}`;
    })
    .join('\n');

  const baseRenderMap = buildSubtitleStyleRenderMap();
  const subtitleStyleMap: BrandTokenInjection['subtitleStyleMap'] = Object.fromEntries(
    Object.entries(baseRenderMap).map(([id, render]) => [
      id,
      {
        color: id === 'bold-yellow' && colors['warm-yellow']
          ? '#111111'
          : render.color,
        bg: id === 'bold-yellow' && colors['warm-yellow']
          ? colors['warm-yellow']
          : render.bg,
        size: render.size,
        weight: render.weight,
        fontFamily: defaultFont,
      },
    ]),
  );

  for (const sub of payload?.presets?.subtitleStyles || []) {
    const styleId = normalizeSubtitleStyleId(subtitlePresetToStyleId(sub.id));
    subtitleStyleMap[styleId] = {
      color: sub.color || '#ffffff',
      bg: sub.backgroundColor || 'rgba(0,0,0,0.6)',
      size: `${sub.fontSize || 32}px`,
      weight: 500,
      fontFamily: sub.fontFamily || defaultFont,
    };
  }

  return {
    cssVariables: cssVars,
    fontFaceCss,
    defaultFontFamily: defaultFont,
    subtitleStyleMap,
  };
}