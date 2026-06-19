/** Canonical subtitle style registry — single source for editor preview + HyperFrames render. */

export interface SubtitleStylePreview {
  text: string;
  color: string;
  bg: string;
  outline?: string;
  fontSize: number;
  fontWeight: number;
  borderRadius?: number;
}

export interface SubtitleStyleRender {
  color: string;
  bg: string;
  size: string;
  weight: number;
  outline?: string;
  borderRadius?: number;
  padding?: string;
}

export type SubtitleEngine = 'css' | 'hyperframes';

export interface SubtitleStyleDefinition {
  id: string;
  name: string;
  description: string;
  aliases?: string[];
  preview: SubtitleStylePreview;
  render: SubtitleStyleRender;
  /** Rendering engine; hyperframes styles use HF caption adapters in composer. */
  engine?: SubtitleEngine;
  hf_component?: string;
  hf_fallback_id?: string;
}

const STROKE_SHADOW = (color: string, width = 2) =>
  [
    `${-width}px ${-width}px 0 ${color}`,
    `${width}px ${-width}px 0 ${color}`,
    `${-width}px ${width}px 0 ${color}`,
    `${width}px ${width}px 0 ${color}`,
    '0 2px 8px rgba(0,0,0,0.45)',
  ].join(', ');

export const SUBTITLE_STYLE_DEFINITIONS: SubtitleStyleDefinition[] = [
  {
    id: 'default',
    name: '白字黑边',
    description: '经典字幕样式，白色文字黑色描边，百搭',
    aliases: ['classic-white-stroke'],
    preview: {
      text: '欢迎选购我们的产品',
      color: '#ffffff',
      bg: 'transparent',
      outline: '#000000',
      fontSize: 14,
      fontWeight: 600,
    },
    render: {
      color: '#ffffff',
      bg: 'transparent',
      size: '28px',
      weight: 600,
      outline: '#000000',
    },
  },
  {
    id: 'bottom-center',
    name: '底部半透底',
    description: '底部半透明黑色底栏，阅读舒适',
    aliases: ['semi-transparent-bar'],
    preview: {
      text: '限时优惠 立即抢购',
      color: '#ffffff',
      bg: 'rgba(0,0,0,0.55)',
      fontSize: 13,
      fontWeight: 500,
      borderRadius: 6,
    },
    render: {
      color: '#ffffff',
      bg: 'rgba(0,0,0,0.55)',
      size: '32px',
      weight: 500,
      borderRadius: 8,
      padding: '8px 16px',
    },
  },
  {
    id: 'bold-yellow',
    name: '醒目黄字',
    description: '黄色文字+深色描边，促销场景首选',
    aliases: ['yellow-highlight'],
    preview: {
      text: '今日特价 仅需99元',
      color: '#FFD700',
      bg: 'transparent',
      outline: '#333333',
      fontSize: 14,
      fontWeight: 700,
    },
    render: {
      color: '#FFD700',
      bg: 'transparent',
      size: '30px',
      weight: 700,
      outline: '#333333',
    },
  },
  {
    id: 'bold-white-stroke',
    name: '描边大字',
    description: '白色大号文字+粗描边，强视觉冲击',
    aliases: ['stroke-large'],
    preview: {
      text: '爆款推荐',
      color: '#ffffff',
      bg: 'transparent',
      outline: '#000000',
      fontSize: 18,
      fontWeight: 800,
    },
    render: {
      color: '#ffffff',
      bg: 'transparent',
      size: '36px',
      weight: 800,
      outline: '#000000',
    },
  },
  {
    id: 'subtitle-card',
    name: '卡片式',
    description: '圆角卡片包裹，现代感强',
    preview: {
      text: '新品首发 限量发售',
      color: '#ffffff',
      bg: 'rgba(51,51,51,0.8)',
      fontSize: 13,
      fontWeight: 500,
      borderRadius: 12,
    },
    render: {
      color: '#ffffff',
      bg: 'rgba(51,51,51,0.8)',
      size: '26px',
      weight: 500,
      borderRadius: 12,
      padding: '8px 16px',
    },
  },
  {
    id: 'brand-elegant',
    name: '品牌优雅',
    description: '香槟金文字+暖棕描边，适合母婴/轻奢品牌',
    preview: {
      text: '品质生活 温柔守护',
      color: '#F5E6CC',
      bg: 'transparent',
      outline: '#8B7355',
      fontSize: 14,
      fontWeight: 500,
    },
    render: {
      color: '#F5E6CC',
      bg: 'transparent',
      size: '28px',
      weight: 500,
      outline: '#8B7355',
    },
  },
  {
    id: 'brand-blue',
    name: '品牌蓝',
    description: '蓝色调字幕，适合科技/企业场景',
    preview: {
      text: '智能科技 改变生活',
      color: '#E0F2FE',
      bg: 'rgba(37,99,235,0.7)',
      fontSize: 13,
      fontWeight: 500,
      borderRadius: 8,
    },
    render: {
      color: '#E0F2FE',
      bg: 'rgba(37,99,235,0.7)',
      size: '26px',
      weight: 500,
      borderRadius: 8,
      padding: '8px 16px',
    },
  },
  {
    id: 'gradient-glow',
    name: '渐变发光',
    description: '渐变文字+光晕效果，高端大气',
    preview: {
      text: '奢华品质 尊享体验',
      color: '#FDE68A',
      bg: 'transparent',
      outline: 'rgba(251,191,36,0.5)',
      fontSize: 14,
      fontWeight: 700,
    },
    render: {
      color: '#FDE68A',
      bg: 'transparent',
      size: '28px',
      weight: 700,
      outline: 'rgba(251,191,36,0.55)',
    },
  },
  {
    id: 'minimal',
    name: '极简单行',
    description: '无背景无描边，纯文字极简风格',
    preview: {
      text: '自然之美',
      color: 'rgba(255,255,255,0.9)',
      bg: 'transparent',
      fontSize: 12,
      fontWeight: 400,
    },
    render: {
      color: 'rgba(255,255,255,0.9)',
      bg: 'transparent',
      size: '24px',
      weight: 400,
    },
  },
  {
    id: 'hf-caption-highlight',
    name: '高亮强调（HF）',
    description: 'HyperFrames 逐词高亮动效字幕，适合卖点口播',
    preview: {
      text: '限时特惠 立即抢购',
      color: '#ffffff',
      bg: '#ff1745',
      fontSize: 14,
      fontWeight: 800,
      borderRadius: 10,
    },
    render: {
      color: '#ffffff',
      bg: '#ff1745',
      size: '32px',
      weight: 800,
      borderRadius: 10,
      padding: '6px 12px',
    },
    engine: 'hyperframes',
    hf_component: 'caption-highlight',
    hf_fallback_id: 'bold-yellow',
  },
];

const aliasToCanonical = new Map<string, string>();
for (const def of SUBTITLE_STYLE_DEFINITIONS) {
  aliasToCanonical.set(def.id, def.id);
  for (const alias of def.aliases || []) {
    aliasToCanonical.set(alias, def.id);
  }
}

const definitionById = new Map(SUBTITLE_STYLE_DEFINITIONS.map((def) => [def.id, def]));

/** Resolve legacy / alias style ids to canonical registry key. */
export function normalizeSubtitleStyleId(styleId: string): string {
  const trimmed = String(styleId || '').trim();
  if (!trimmed) return 'default';
  return aliasToCanonical.get(trimmed) || trimmed;
}

export function getSubtitleStyleDefinition(styleId: string): SubtitleStyleDefinition | undefined {
  const canonical = normalizeSubtitleStyleId(styleId);
  return definitionById.get(canonical);
}

export function getSubtitlePreviewStyle(styleId: string): SubtitleStylePreview & { borderRadius: number } {
  const def = getSubtitleStyleDefinition(styleId);
  if (!def) {
    return {
      text: '字幕预览',
      color: '#ffffff',
      bg: 'rgba(0,0,0,0.5)',
      fontSize: 14,
      fontWeight: 600,
      borderRadius: 6,
    };
  }
  return {
    ...def.preview,
    borderRadius: def.preview.borderRadius ?? 6,
  };
}

export function buildSubtitleStyleRenderMap(): Record<string, SubtitleStyleRender> {
  const map: Record<string, SubtitleStyleRender> = {};
  for (const def of SUBTITLE_STYLE_DEFINITIONS) {
    map[def.id] = def.render;
    for (const alias of def.aliases || []) {
      map[alias] = def.render;
    }
  }
  return map;
}

export function buildSubtitleTextShadow(outline?: string, width = 2): string {
  if (!outline) return '0 2px 8px rgba(0,0,0,0.8)';
  return STROKE_SHADOW(outline, width);
}

export const SUBTITLE_FONT_SIZE_MIN = 32;
export const SUBTITLE_FONT_SIZE_MAX = 120;
export const SUBTITLE_FONT_SIZE_DEFAULT = 72;

/** Parse first family from a CSS font-family stack. */
export function parseFontFamilyName(raw: string | undefined): string {
  if (!raw) return '';
  return String(raw).split(',')[0].trim().replace(/^['"]|['"]$/g, '');
}

/** Resolve subtitle font: segment → global subtitle_font_family → default_font_family → 苹方. */
export function resolveSubtitleFontFamily(options: {
  fontFamily?: string;
  globalSubtitleFontFamily?: string;
  defaultFontFamily?: string;
}): string {
  const fromSeg = parseFontFamilyName(options.fontFamily);
  if (fromSeg) return fromSeg;
  const fromGlobal = parseFontFamilyName(options.globalSubtitleFontFamily);
  if (fromGlobal) return fromGlobal;
  const fromDefault = parseFontFamilyName(options.defaultFontFamily);
  if (fromDefault) return fromDefault;
  return 'PingFang SC';
}

export function parseSubtitleRenderSizePx(size: string): number {
  const match = String(size || '').match(/(\d+(?:\.\d+)?)/);
  return match ? Math.round(Number(match[1])) : 28;
}

function clampSubtitleFontSize(value: number): number {
  return Math.max(SUBTITLE_FONT_SIZE_MIN, Math.min(SUBTITLE_FONT_SIZE_MAX, Math.round(value)));
}

/** Resolve ASS / render font size (px at 1080×1920 baseline) from overrides, global default, or style preset. */
export function resolveSubtitleFontSize(options: {
  styleId?: string;
  fontSize?: number;
  globalFontSize?: number;
  canvasHeight?: number;
}): number {
  const { styleId, fontSize, globalFontSize, canvasHeight = 1920 } = options;
  if (typeof fontSize === 'number' && fontSize > 0) {
    return clampSubtitleFontSize(fontSize);
  }
  if (typeof globalFontSize === 'number' && globalFontSize > 0) {
    return clampSubtitleFontSize(globalFontSize);
  }
  const def = getSubtitleStyleDefinition(styleId || 'default');
  const px = def ? parseSubtitleRenderSizePx(def.render.size) : 28;
  const scaled = Math.round(px * (canvasHeight / 1080) * 1.8);
  return clampSubtitleFontSize(Math.max(SUBTITLE_FONT_SIZE_DEFAULT, scaled));
}

/** CSS font-size for HyperFrames / editor preview (scales with preview width). */
export function resolveSubtitlePreviewFontSizePx(options: {
  styleId?: string;
  fontSize?: number;
  globalFontSize?: number;
  canvasWidth?: number;
  previewWidth?: number;
}): number {
  const canvasWidth = options.canvasWidth || 1080;
  const previewWidth = options.previewWidth || canvasWidth;
  const assSize = resolveSubtitleFontSize({
    styleId: options.styleId,
    fontSize: options.fontSize,
    globalFontSize: options.globalFontSize,
    canvasHeight: Math.round(canvasWidth * (16 / 9)),
  });
  return Math.max(10, Math.round(assSize * (previewWidth / canvasWidth)));
}

/** Editor asset-library card list (canonical ids only). */
export const SUBTITLE_STYLES = SUBTITLE_STYLE_DEFINITIONS.map((def) => ({
  id: def.id,
  name: def.name,
  description: def.description,
  preview: def.preview,
  engine: def.engine || ('css' as SubtitleEngine),
  hf_component: def.hf_component,
  hf_fallback_id: def.hf_fallback_id,
}));

export const CLASSIC_SUBTITLE_STYLES = SUBTITLE_STYLES.filter((s) => s.engine !== 'hyperframes');
export const HF_SUBTITLE_STYLES = SUBTITLE_STYLES.filter((s) => s.engine === 'hyperframes');

export function isHyperframesSubtitleStyle(styleId: string): boolean {
  const def = getSubtitleStyleDefinition(styleId);
  return def?.engine === 'hyperframes';
}

export function dslUsesHyperframesSubtitles(dsl: {
  segments?: Array<{ subtitle?: { enabled?: boolean; style_id?: string }; narration_text?: string }>;
}): boolean {
  return (dsl.segments || []).some((seg) => {
    if (!seg.subtitle?.enabled || !String(seg.narration_text || '').trim()) return false;
    return isHyperframesSubtitleStyle(String(seg.subtitle.style_id || ''));
  });
}

export function getHyperframesSubtitlePipelineWarning(pipelineKey?: string): string | null {
  if (!pipelineKey || pipelineKey === 'hyperframes_template') return null;
  return '模板含 HyperFrames 动效字幕；当前流水线将降级为静态字幕，完整动效请选「HyperFrames 模板」流水线';
}