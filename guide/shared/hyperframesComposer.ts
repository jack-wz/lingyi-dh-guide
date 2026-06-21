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
  getSubtitleStyleDefinition,
  normalizeSubtitleStyleId,
  resolveAssSubtitleStyleId,
  type SubtitleStyleRender,
  resolveSubtitleFontFamily,
  resolveSubtitleFontSize,
} from './subtitleStyles';
import { anySegmentUsesHyperframesCaptions } from './hfStyleRegistry.js';
import { buildHfCaptionSeekBootstrap, renderHfCaptionClip } from './hfCaptionRenderer.js';
import { isHyperframesTransitionType, renderHfTransitionClip, buildHfTransitionSeekBootstrap } from './hfTransitionRenderer.js';
import { buildHfGlobalOverlaySeekBootstrap, renderHfGlobalOverlayClips } from './hfGlobalOverlayRenderer.js';
import { resolveHfRenderFontStack } from './hfFontFamily.js';

const GSAP_RUNTIME_URL = 'https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js';

export const HYPERFRAMES_RUNTIME_URL =
  'https://cdn.jsdelivr.net/npm/@hyperframes/core/dist/hyperframe.runtime.iife.js';

interface EditorObject {
  id: string;
  type: string;
  label?: string;
  text?: string;
  asset_url?: string;
  visible?: boolean;
  position: { x: number; y: number };
  scale: number;
  rotation?: number;
  interaction?: { kind: string };
  metadata?: { source?: string; shape_type?: string };
  style?: {
    fill?: string;
    textColor?: string;
    fontSize?: number;
    fontFamily?: string;
    fontWeight?: number;
    background?: string;
    borderRadius?: number;
  };
}

interface Segment {
  id: string;
  type: string;
  narration_text: string;
  duration_sec: number;
  scene_image_url: string;
  scene_description: string;
  camera_shot?: string;
  subtitle: { enabled: boolean; style_id: string; position: string; animation: string; font_size?: number };
  transition: { type: string; duration: number };
  digital_human: { enabled: boolean; position: { x: number; y: number }; scale: number };
  avatar_id?: string;
  layout?: string;
  objects?: EditorObject[];
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

function renderEditorObjectHtml(obj: EditorObject, segStart: number, segDuration: number, index: number): string {
  if (obj.visible === false) return '';
  const id = `obj-${escapeHtml(obj.id || String(index))}`;
  const duration = Math.max(0.1, segDuration);
  const left = Number(obj.position?.x ?? 50);
  const top = Number(obj.position?.y ?? 50);
  const scale = Number(obj.scale || 100) / 100;
  const rotation = Number(obj.rotation || 0);
  const fill = obj.style?.fill || '#ffffff';
  const textColor = obj.style?.textColor || '#111827';
  const label = obj.text || obj.label || (obj.metadata?.source === 'record' ? '屏幕录制' : obj.type);
  const commonStyle = `left:${left}%;top:${top}%;transform:translate(-50%,-50%) scale(${scale}) rotate(${rotation}deg);z-index:${30 + index};`;

  if (obj.asset_url) {
    const isVideo = obj.asset_url.match(/\.(mp4|mov|webm)$/i);
    return `
      <div id="${id}" class="clip hf-object" data-start="${segStart}" data-duration="${duration}" data-track-index="${10 + index}"
           style="${clipStyle(commonStyle)}">
        ${isVideo
          ? `<video src="${escapeHtml(obj.asset_url)}" muted playsinline style="max-width:320px;max-height:320px;border-radius:12px;"></video>`
          : `<img src="${escapeHtml(obj.asset_url)}" style="max-width:320px;max-height:320px;object-fit:contain;" />`
        }
      </div>`;
  }

  const isInteractive = Boolean(obj.interaction);
  const isRecord = obj.metadata?.source === 'record';
  const shapeType = obj.metadata?.shape_type;
  const radius = obj.type === 'sticker' && shapeType === 'Circle' ? '999px' : isInteractive ? '18px' : '10px';
  const borderStyle = obj.type === 'sticker' && !isInteractive && !isRecord
    ? `border:2px solid ${escapeHtml(fill)};background:rgba(255,255,255,0.08);`
    : `background:${escapeHtml(fill)};`;

  return `
    <div id="${id}" class="clip hf-object" data-start="${segStart}" data-duration="${duration}" data-track-index="${10 + index}"
         style="${clipStyle(`${commonStyle}min-width:${isRecord ? 260 : 120}px;max-width:520px;padding:${isRecord ? '28px 36px' : '14px 22px'};${borderStyle}color:${escapeHtml(textColor)};
                border-radius:${radius};font-family:'PingFang SC','Microsoft YaHei',sans-serif;font-weight:700;text-align:center;
                box-shadow:0 10px 30px rgba(0,0,0,0.18);`)}">
      ${escapeHtml(label)}
    </div>`;
}

function resolveAccentColor(dsl: DSL, brandInjection: ReturnType<typeof buildBrandTokenInjection>): string {
  const gc = dsl.globalConfig;
  const fromFlat = String(gc.brand_color || gc.accent_color || '').trim();
  if (fromFlat) return fromFlat;
  const pack = gc.brand_pack as BrandPackPayload | undefined;
  const fromPack = String(pack?.brand_color || pack?.tokens?.colors?.['digital-orange'] || '').trim();
  if (fromPack) return fromPack;
  const cssMatch = brandInjection.cssVariables.match(/--brand-primary:([^;]+)/);
  return cssMatch?.[1]?.trim() || '#ff1745';
}

export interface HyperframesComposeOptions {
  /** full = editor preview / legacy HF pipeline; style_layer = FFmpeg base + HF effects only */
  mode?: 'full' | 'style_layer';
  /** Relative or absolute URL to pre-assembled base video (required for style_layer). */
  baseVideoUrl?: string;
}

export function generateHyperframesHTML(
  dsl: DSL,
  resolvedSegments?: Segment[],
  options?: HyperframesComposeOptions,
): string {
  const assetMap = getAssetMapFromDsl(dsl);
  const skipObjects = Boolean(resolvedSegments);
  const styleLayer = options?.mode === 'style_layer' && Boolean(options.baseVideoUrl);
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
  const stageFontStack = resolveHfRenderFontStack(defaultFont, brandInjection.fontFaceCss);
  const stageBg = background_color || brandInjection.cssVariables.match(/--brand-bg:([^;]+)/)?.[1] || '#000';

  let totalDuration = 0;
  /** Reserved: 0 scene, 1 DH, 2 caption, 4 BGM, 20+ transitions, 30+ global VFX, 40+ segment overlays. */
  let overlayTrackCursor = 40;
  let transitionTrackCursor = 20;
  const segmentEntries: string[] = [];
  const hfCaptionCss: string[] = [];
  const hfCaptionScripts: string[] = [];
  const hfTransitionCss: string[] = [];
  const hfTransitionScripts: string[] = [];
  const transitionEntries: string[] = [];
  const transitionsEnabled = dsl.globalConfig.transition_enabled !== false;
  const accentColor = resolveAccentColor(dsl, brandInjection);

  segs.forEach((seg, i) => {
    const start = totalDuration;
    const dur = Math.max(0.1, Number(seg.duration_sec || 5));
    totalDuration += dur;

    const sceneHtml = styleLayer
      ? ''
      : seg.scene_image_url
        ? `<img class="clip" id="scene-bg-${escapeHtml(seg.id)}" data-start="${start}" data-duration="${dur}" data-track-index="0"
           src="${escapeHtml(seg.scene_image_url)}" style="${clipStyle('inset:0;width:100%;height:100%;object-fit:cover;')}" />`
        : `<div class="clip" id="scene-bg-${escapeHtml(seg.id)}" data-start="${start}" data-duration="${dur}" data-track-index="0"
           style="${clipStyle(`inset:0;background:${escapeHtml(background_color || '#1a1a2e')};`)}"></div>`;

    let subtitleHtml = '';
    if (seg.subtitle.enabled && seg.narration_text) {
      const styleId = normalizeSubtitleStyleId(seg.subtitle.style_id);
      const styleDef = getSubtitleStyleDefinition(styleId);
      const cssStyleId = styleDef?.engine === 'hyperframes'
        ? resolveAssSubtitleStyleId(styleId)
        : styleId;
      const style = styleMap[cssStyleId] || styleMap[styleId] || styleMap.default;
      const subFont = resolveSubtitleFontFamily({
        fontFamily: (seg.subtitle as { font_family?: string }).font_family,
        globalSubtitleFontFamily: (dsl.globalConfig as { subtitle_font_family?: string }).subtitle_font_family,
        defaultFontFamily: brandInjection.subtitleStyleMap[styleId]?.fontFamily
          || brandInjection.subtitleStyleMap[seg.subtitle.style_id]?.fontFamily
          || defaultFont,
      });
      const fontSizePx = resolveSubtitleFontSize({
        styleId,
        fontSize: seg.subtitle.font_size,
        globalFontSize: (dsl.globalConfig as { subtitle_font_size?: number }).subtitle_font_size,
        canvasHeight: Number((dsl.globalConfig as { canvas_height?: number }).canvas_height) || 1920,
      });
      const hfParams = (seg.subtitle as {
        hf_params?: {
          emphasis_words?: string[];
          accent_color?: string;
          word_timings?: Array<{ text: string; start: number; end: number }>;
        };
      }).hf_params;
      const phraseTimings = (seg as { subtitle_phrase_timings?: Array<{ text: string; start: number; end: number }> })
        .subtitle_phrase_timings;
      const hfFontStack = resolveHfRenderFontStack(subFont, brandInjection.fontFaceCss);
      const hfClip = styleDef?.engine === 'hyperframes'
        ? renderHfCaptionClip({
          styleId,
          segmentId: String(seg.id || `seg-${i}`),
          text: seg.narration_text,
          clipStart: start,
          clipDuration: dur,
          canvasWidth: w,
          canvasHeight: h,
          position: seg.subtitle.position,
          fontFamily: hfFontStack,
          fontSizePx,
          accentColor: hfParams?.accent_color || accentColor,
          textColor: style.color,
          emphasisWords: hfParams?.emphasis_words,
          wordTimings: hfParams?.word_timings,
          phraseTimings,
        })
        : null;

      if (hfClip) {
        subtitleHtml = hfClip.html;
        hfCaptionCss.push(hfClip.css);
        hfCaptionScripts.push(hfClip.script);
      } else {
        const posY = seg.subtitle.position === 'top' ? '8%' : seg.subtitle.position === 'center' ? '45%' : '82%';
        const animClass = seg.subtitle.animation === 'typewriter' ? 'typewriter' : seg.subtitle.animation === 'fadeIn' ? 'fade-in' : '';
        const textShadow = buildSubtitleTextShadow(style.outline, style.weight >= 700 ? 2 : 1);
        const bg = style.bg === 'transparent' ? 'transparent' : style.bg;
        const padding = style.padding || (bg === 'transparent' ? '4px 8px' : '8px 16px');
        const borderRadius = style.borderRadius ?? 8;
        subtitleHtml = `
      <div id="subtitle-${escapeHtml(seg.id)}" class="clip subtitle ${animClass}" data-start="${start + 0.3}" data-duration="${Math.max(0.1, dur - 0.3)}" data-track-index="2"
           style="${clipStyle(`left:5%;right:5%;bottom:${100 - parseInt(posY, 10)}%;text-align:center;
                  color:${style.color};font-size:${fontSizePx}px;font-weight:${style.weight};
                  text-shadow:${textShadow};background:${bg};
                  padding:${padding};border-radius:${borderRadius}px;font-family:${subFont};`)}">
        ${escapeHtml(seg.narration_text)}
      </div>`;
      }
    }

    let dhHtml = '';
    if (!styleLayer && seg.digital_human.enabled) {
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
      <div id="hf-digital-human-${escapeHtml(seg.id)}" class="clip hf-digital-human" data-start="${start}" data-duration="${dur}" data-track-index="1"
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
      <div id="hf-digital-human-${escapeHtml(seg.id)}" class="clip hf-digital-human" data-start="${start}" data-duration="${dur}" data-track-index="1"
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
    if (!styleLayer) seg.overlays.forEach((ov) => {
      const relStart = Math.max(0, Number(ov.seg_start_time || 0));
      const ovStart = start + relStart;
      const maxDur = Math.max(0.1, start + dur - ovStart);
      const ovDur = Math.min(Math.max(0.1, Number(ov.duration || dur)), maxDur);
      const overlayTrack = overlayTrackCursor++;
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
        <div id="overlay-${escapeHtml(ov.id)}" class="clip hf-overlay ${animClass}" data-start="${ovStart}" data-duration="${ovDur}" data-track-index="${overlayTrack}"
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
        <div id="overlay-${escapeHtml(ov.id)}" class="clip hf-overlay ${animClass}" data-start="${ovStart}" data-duration="${ovDur}" data-track-index="${overlayTrack}"
             style="${clipStyle(`left:${ov.position.x}%;top:${ov.position.y}%;
                    transform:translate(-50%,-50%) scale(${ov.scale / 100})${rot};`)}">
          ${isVideo && !isGif
            ? `<video src="${escapeHtml(assetUrl)}" muted playsinline style="max-width:${maxW}px;max-height:${maxH}px;"></video>`
            : `<img src="${escapeHtml(assetUrl)}" style="max-width:${maxW}px;max-height:${maxH}px;object-fit:contain;" />`
          }
        </div>`;
      }
    });

    let objectsHtml = '';
    if (!styleLayer && !skipObjects) {
      (seg.objects || []).forEach((obj, objectIndex) => {
        objectsHtml += renderEditorObjectHtml(obj, start, dur, objectIndex);
      });
    }

    segmentEntries.push(sceneHtml + dhHtml + subtitleHtml + overlaysHtml + objectsHtml);

    if (transitionsEnabled && i < segs.length - 1) {
      const transType = String(seg.transition?.type || 'none');
      if (transType !== 'none' && isHyperframesTransitionType(transType)) {
        const transDur = Math.max(0.2, Math.min(Number(seg.transition.duration) || 0.5, dur * 0.45));
        const transStart = start + dur - transDur;
        const transClip = renderHfTransitionClip({
          segmentId: String(seg.id || `seg-${i}`),
          transitionType: transType,
          clipStart: transStart,
          clipDuration: transDur,
          canvasWidth: w,
          canvasHeight: h,
          accentColor,
          direction: (seg.transition as { direction?: 'left' | 'right' | 'up' | 'down' }).direction,
          trackIndex: transitionTrackCursor++,
        });
        if (transClip) {
          transitionEntries.push(transClip.html);
          hfTransitionCss.push(transClip.css);
          hfTransitionScripts.push(transClip.script);
        }
      }
    }
  });

  const globalOverlayClips = renderHfGlobalOverlayClips(dsl.globalConfig.hf_overlays, {
    totalDuration,
    canvasWidth: w,
    canvasHeight: h,
    accentColor,
    trackStart: 30,
  });

  const styleLayerBaseHtml = styleLayer && options?.baseVideoUrl
    ? `<video id="hf-base-video" class="clip" data-start="0" data-duration="${totalDuration}" data-track-index="0"
           data-has-audio="true" src="${escapeHtml(options.baseVideoUrl)}" playsinline
           style="${clipStyle('inset:0;width:100%;height:100%;object-fit:cover;')}"></video>`
    : '';

  const bgmHtml = !styleLayer && bgm_url ? `
    <audio id="hf-bgm" class="clip" data-start="0" data-duration="${totalDuration}" data-track-index="4"
           data-volume="${bgm_volume}" src="${escapeHtml(bgm_url)}"></audio>
  ` : '';

  const needsGsap = anySegmentUsesHyperframesCaptions(segs)
    || hfCaptionScripts.length > 0
    || hfTransitionScripts.length > 0
    || globalOverlayClips.requiresGsap;
  const gsapScriptTag = needsGsap ? `<script src="${GSAP_RUNTIME_URL}"></script>` : '';
  const hfMotionScripts = [...hfCaptionScripts, ...hfTransitionScripts, ...globalOverlayClips.scripts];
  const hfMotionScriptBlock = hfMotionScripts.length
    ? `<script>${hfMotionScripts.join('\n')}${buildHfCaptionSeekBootstrap()}${buildHfTransitionSeekBootstrap()}${buildHfGlobalOverlaySeekBootstrap()}</script>`
    : '';

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
      font-family: ${stageFontStack};
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
    ${hfCaptionCss.join('\n')}
    ${hfTransitionCss.join('\n')}
    ${globalOverlayClips.css}
  </style>
  ${gsapScriptTag}
</head>
<body>
  <div id="stage"
       data-composition-id="guide-video"
       data-start="0"
       data-duration="${totalDuration}"
       data-width="${w}"
       data-height="${h}"
       data-fps="${fps}">
    ${styleLayerBaseHtml}
    ${segmentEntries.join('\n')}
    ${transitionEntries.join('\n')}
    ${globalOverlayClips.html}
    ${bgmHtml}
  </div>
  <script src="${HYPERFRAMES_RUNTIME_URL}"></script>
  ${hfMotionScriptBlock}
</body>
</html>`;
}