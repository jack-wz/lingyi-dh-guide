/** Generate HyperFrames HTML from guide DSL (preview + FFmpeg render path). */

import { getAssetMapFromDsl, resolveOverlayAssetUrl, resolveSegmentOverlays } from './assetResolver';
import { buildBrandTokenInjection, type BrandPackPayload } from './brandPack.js';
import {
  resolveDigitalHumanImageUrl,
  resolveDigitalHumanLayout,
  type DigitalHumanCatalog,
} from './digitalHumanStyle';
import {
  buildSubtitleStyleRenderMap,
  buildSubtitleTextShadow,
  normalizeSubtitleStyleId,
  type SubtitleStyleRender,
} from './subtitleStyles';

export const HYPERFRAMES_RUNTIME_URL =
  'https://cdn.jsdelivr.net/npm/@hyperframes/core/dist/hyperframe.runtime.iife.js';

interface Segment {
  id: string;
  type: string;
  narration_text: string;
  duration_sec: number;
  scene_image_url: string;
  scene_description: string;
  camera_shot?: string;
  subtitle: { enabled: boolean; style_id: string; position: string; animation: string };
  transition: { type: string; duration: number };
  digital_human: { enabled: boolean; position: { x: number; y: number }; scale: number };
  avatar_id?: string;
  layout?: string;
  overlays: Array<{
    id: string;
    asset_url: string;
    asset_key?: string;
    position: { x: number; y: number };
    scale: number;
    seg_start_time: number;
    duration: number;
    animation: string;
    render_width_pct?: number;
    render_height_pct?: number;
    rotation?: number;
    text?: string;
    label?: string;
    style?: {
      fill?: string;
      textColor?: string;
      variant?: string;
      fontSize?: number;
      fontFamily?: string;
      fontWeight?: number;
      outline?: string;
      background?: string;
      borderRadius?: number;
    };
  }>;
}

interface DSL {
  meta: { name: string; type: string; [key: string]: unknown };
  globalConfig: {
    canvas_width: number;
    canvas_height: number;
    fps: number;
    bgm_url: string;
    bgm_volume: number;
    background_color?: string;
    asset_map?: Record<string, string>;
    brand_logo_url?: string;
    brand_pack_id?: string;
    brand_pack?: BrandPackPayload;
    default_font_family?: string;
    digital_human_catalog?: DigitalHumanCatalog;
    [key: string]: unknown;
  };
  segments: Segment[];
}

function getDigitalHumanCatalog(dsl: DSL): DigitalHumanCatalog {
  const catalog = dsl.globalConfig.digital_human_catalog;
  return catalog && typeof catalog === 'object' ? catalog : {};
}

const SUBTITLE_STYLE_MAP = buildSubtitleStyleRenderMap();

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function clipStyle(base: string): string {
  return `position:absolute;${base}`;
}

export function generateHyperframesHTML(dsl: DSL, resolvedSegments?: Segment[]): string {
  const assetMap = getAssetMapFromDsl(dsl);
  const baseSegs = resolvedSegments || dsl.segments;
  const segs = baseSegs.map((seg) => ({
    ...seg,
    overlays: resolveSegmentOverlays(seg.overlays, assetMap),
  }));
  const { canvas_width: w, canvas_height: h, fps, bgm_url, bgm_volume, background_color } = dsl.globalConfig;
  const brandInjection = buildBrandTokenInjection(
    (dsl.globalConfig.brand_pack as BrandPackPayload | undefined) || null,
  );
  const styleMap: Record<string, SubtitleStyleRender> = {
    ...SUBTITLE_STYLE_MAP,
    ...Object.fromEntries(
      Object.entries(brandInjection.subtitleStyleMap).map(([k, v]) => [
        normalizeSubtitleStyleId(k),
        { color: v.color, bg: v.bg, size: v.size, weight: v.weight },
      ]),
    ),
  };
  const defaultFont = String(dsl.globalConfig.default_font_family || brandInjection.defaultFontFamily);
  const stageBg = background_color || brandInjection.cssVariables.match(/--brand-bg:([^;]+)/)?.[1] || '#000';

  let totalDuration = 0;
  const segmentEntries: string[] = [];

  segs.forEach((seg, i) => {
    const start = totalDuration;
    const dur = Math.max(0.1, Number(seg.duration_sec || 5));
    totalDuration += dur;

    const sceneHtml = seg.scene_image_url
      ? `<img class="clip" data-start="${start}" data-duration="${dur}" data-track-index="0"
           src="${escapeHtml(seg.scene_image_url)}" style="${clipStyle('inset:0;width:100%;height:100%;object-fit:cover;')}" />`
      : `<div class="clip" data-start="${start}" data-duration="${dur}" data-track-index="0"
           style="${clipStyle(`inset:0;background:${escapeHtml(background_color || '#1a1a2e')};`)}"></div>`;

    let subtitleHtml = '';
    if (seg.subtitle.enabled && seg.narration_text) {
      const styleId = normalizeSubtitleStyleId(seg.subtitle.style_id);
      const style = styleMap[styleId] || styleMap.default;
      const subFont = brandInjection.subtitleStyleMap[styleId]?.fontFamily
        || brandInjection.subtitleStyleMap[seg.subtitle.style_id]?.fontFamily
        || defaultFont;
      const posY = seg.subtitle.position === 'top' ? '8%' : seg.subtitle.position === 'center' ? '45%' : '82%';
      const animClass = seg.subtitle.animation === 'typewriter' ? 'typewriter' : seg.subtitle.animation === 'fadeIn' ? 'fade-in' : '';
      const textShadow = buildSubtitleTextShadow(style.outline, style.weight >= 700 ? 2 : 1);
      const bg = style.bg === 'transparent' ? 'transparent' : style.bg;
      const padding = style.padding || (bg === 'transparent' ? '4px 8px' : '8px 16px');
      const borderRadius = style.borderRadius ?? 8;
      subtitleHtml = `
      <div class="clip subtitle ${animClass}" data-start="${start + 0.3}" data-duration="${Math.max(0.1, dur - 0.3)}" data-track-index="2"
           style="${clipStyle(`left:5%;right:5%;bottom:${100 - parseInt(posY, 10)}%;text-align:center;
                  color:${style.color};font-size:${style.size};font-weight:${style.weight};
                  text-shadow:${textShadow};background:${bg};
                  padding:${padding};border-radius:${borderRadius}px;font-family:${subFont};`)}">
        ${escapeHtml(seg.narration_text)}
      </div>`;
    }

    let dhHtml = '';
    if (seg.digital_human.enabled) {
      const catalog = getDigitalHumanCatalog(dsl);
      const avatarId = String(seg.avatar_id || (dsl.meta.digital_human_id as string | undefined) || '').trim();
      const imageUrl = resolveDigitalHumanImageUrl(avatarId, catalog);
      const layout = resolveDigitalHumanLayout(
        seg.layout,
        seg.digital_human.position,
        seg.digital_human.scale,
        w,
      );
      if (imageUrl) {
        dhHtml = `
      <div class="clip" data-start="${start}" data-duration="${dur}" data-track-index="1"
           style="${clipStyle(`left:${layout.x}%;top:${layout.y}%;
                  transform:translate(-50%,-50%);
                  width:${layout.width}px;height:${layout.height}px;
                  display:flex;align-items:flex-end;justify-content:center;
                  pointer-events:none;`)}">
        <img src="${escapeHtml(imageUrl)}" alt="数字人"
             style="width:100%;height:100%;object-fit:${layout.objectFit};display:block;" />
      </div>`;
      } else {
        dhHtml = `
      <div class="clip" data-start="${start}" data-duration="${dur}" data-track-index="1"
           style="${clipStyle(`left:${layout.x}%;top:${layout.y}%;
                  transform:translate(-50%,-50%) scale(${seg.digital_human.scale / 100});
                  width:120px;height:120px;border-radius:50%;
                  background:rgba(147,51,234,0.3);border:2px dashed rgba(147,51,234,0.5);
                  display:flex;align-items:center;justify-content:center;`)}">
        <span style="font-size:48px;">👤</span>
      </div>`;
      }
    }

    let overlaysHtml = '';
    seg.overlays.forEach((ov) => {
      const ovStart = start + Number(ov.seg_start_time || 0);
      const ovDur = Math.max(0.1, Number(ov.duration || dur));
      const assetUrl = resolveOverlayAssetUrl(ov, assetMap);
      const widthPct = ov.render_width_pct ?? 20;
      const heightPct = ov.render_height_pct ?? 12;
      const maxW = Math.round((w * widthPct) / 100);
      const maxH = Math.round((h * heightPct) / 100);
      const animClass = ov.animation === 'fadeIn' ? 'fade-in' : ov.animation === 'scaleIn' ? 'scale-in' : '';
      const rotation = Number(ov.rotation || 0);
      const rot = rotation ? ` rotate(${rotation}deg)` : '';

      if (ov.text && !assetUrl) {
        const fill = ov.style?.background || ov.style?.fill || 'rgba(255,255,255,0.9)';
        const color = ov.style?.textColor || '#111827';
        const fontSize = ov.style?.fontSize ?? Math.max(14, Math.round(maxH * 0.35));
        const fontWeight = ov.style?.fontWeight ?? 600;
        const fontFamily = ov.style?.fontFamily || defaultFont;
        const borderRadius = ov.style?.borderRadius ?? 8;
        const outline = ov.style?.outline ? `text-shadow:0 0 2px ${escapeHtml(ov.style.outline)};` : '';
        overlaysHtml += `
        <div class="clip ${animClass}" data-start="${ovStart}" data-duration="${ovDur}" data-track-index="3"
             style="${clipStyle(`left:${ov.position.x}%;top:${ov.position.y}%;
                    transform:translate(-50%,-50%) scale(${ov.scale / 100})${rot};
                    max-width:${maxW}px;padding:8px 14px;border-radius:${borderRadius}px;
                    background:${escapeHtml(fill)};color:${escapeHtml(color)};
                    font-size:${fontSize}px;font-weight:${fontWeight};text-align:center;
                    font-family:${fontFamily};${outline}`)}">
          ${escapeHtml(ov.text)}
        </div>`;
        return;
      }

      if (assetUrl) {
        const isVideo = assetUrl.match(/\.(mp4|mov|webm)$/i);
        const isGif = assetUrl.match(/\.gif$/i);
        overlaysHtml += `
        <div class="clip ${animClass}" data-start="${ovStart}" data-duration="${ovDur}" data-track-index="3"
             style="${clipStyle(`left:${ov.position.x}%;top:${ov.position.y}%;
                    transform:translate(-50%,-50%) scale(${ov.scale / 100})${rot};`)}">
          ${isVideo && !isGif
            ? `<video src="${escapeHtml(assetUrl)}" muted playsinline style="max-width:${maxW}px;max-height:${maxH}px;"></video>`
            : `<img src="${escapeHtml(assetUrl)}" style="max-width:${maxW}px;max-height:${maxH}px;object-fit:contain;" />`
          }
        </div>`;
      }
    });

    segmentEntries.push(sceneHtml + dhHtml + subtitleHtml + overlaysHtml);
  });

  const bgmHtml = bgm_url ? `
    <audio class="clip" data-start="0" data-duration="${totalDuration}" data-track-index="4"
           data-volume="${bgm_volume}" src="${escapeHtml(bgm_url)}"></audio>
  ` : '';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=${w}, height=${h}" />
  <title>${escapeHtml(dsl.meta.name)}</title>
  <style>
    :root { ${brandInjection.cssVariables}; }
    ${brandInjection.fontFaceCss}
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: ${w}px;
      height: ${h}px;
      overflow: hidden;
      background: #000;
      font-family: var(--font-sans, ${defaultFont});
    }
    #stage {
      position: relative;
      width: ${w}px;
      height: ${h}px;
      overflow: hidden;
      background: ${escapeHtml(String(stageBg))};
    }
    .fade-in { animation: fadeIn 0.5s ease-in forwards; opacity: 0; }
    @keyframes fadeIn { to { opacity: 1; } }
    .scale-in { animation: scaleIn 0.4s ease-out forwards; transform: translate(-50%, -50%) scale(0.6); }
    @keyframes scaleIn { to { transform: translate(-50%, -50%) scale(1); } }
    .typewriter {
      overflow: hidden; white-space: nowrap;
      animation: typing 2s steps(30) forwards; width: 0;
    }
    @keyframes typing { to { width: 100%; } }
  </style>
</head>
<body>
  <div id="stage"
       data-composition-id="guide-video"
       data-start="0"
       data-duration="${totalDuration}"
       data-width="${w}"
       data-height="${h}"
       data-fps="${fps}">
    ${segmentEntries.join('\n')}
    ${bgmHtml}
  </div>
  <script src="${HYPERFRAMES_RUNTIME_URL}"></script>
</body>
</html>`;
}