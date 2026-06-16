import { join } from 'path';
import { writeFileSync, mkdirSync } from 'fs';
import { getAssetMapFromDsl, resolveOverlayAssetUrl, resolveSegmentOverlays } from '@shared/assetResolver';

interface Segment {
  id: string;
  type: string;
  narration_text: string;
  duration_sec: number;
  scene_image_url: string;
  scene_description: string;
  camera_shot: string;
  subtitle: { enabled: boolean; style_id: string; position: string; animation: string };
  transition: { type: string; duration: number };
  digital_human: { enabled: boolean; position: { x: number; y: number }; scale: number };
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
    text?: string;
    label?: string;
    style?: { fill?: string; textColor?: string; variant?: string };
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
    asset_map?: Record<string, string>;
    brand_logo_url?: string;
    [key: string]: unknown;
  };
  segments: Segment[];
}

const TRANSITION_MAP: Record<string, string> = {
  fade: 'crossfade',
  wipeleft: 'wipe-left',
  wiperight: 'wipe-right',
  circlecrop: 'circle-crop',
  slideup: 'slide-up',
  zoomin: 'zoom-in',
};

const SUBTITLE_STYLE_MAP: Record<string, { color: string; bg: string; size: string }> = {
  default: { color: '#ffffff', bg: 'rgba(0,0,0,0.7)', size: '28px' },
  'bottom-center': { color: '#ffffff', bg: 'rgba(0,0,0,0.5)', size: '32px' },
  'yellow-highlight': { color: '#FFD700', bg: 'rgba(0,0,0,0.8)', size: '30px' },
  'bold-white-stroke': { color: '#ffffff', bg: 'transparent', size: '36px' },
  'subtitle-card': { color: '#ffffff', bg: 'rgba(0,0,0,0.6)', size: '26px' },
};

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function generateHyperframesHTML(dsl: DSL, resolvedSegments?: Segment[]): string {
  const assetMap = getAssetMapFromDsl(dsl);
  const baseSegs = resolvedSegments || dsl.segments;
  const segs = baseSegs.map((seg) => ({
    ...seg,
    overlays: resolveSegmentOverlays(seg.overlays, assetMap),
  }));
  const { canvas_width: w, canvas_height: h, fps, bgm_url, bgm_volume } = dsl.globalConfig;

  let totalDuration = 0;
  const segmentEntries: string[] = [];

  segs.forEach((seg, i) => {
    const start = totalDuration;
    const dur = seg.duration_sec;
    totalDuration += dur;

    const sceneHtml = seg.scene_image_url
      ? `<img class="clip" data-start="${start}" data-duration="${dur}" data-track-index="0"
           src="${escapeHtml(seg.scene_image_url)}" style="width:100%;height:100%;object-fit:cover;" />`
      : `<div class="clip" data-start="${start}" data-duration="${dur}" data-track-index="0"
           style="width:100%;height:100%;background:linear-gradient(135deg,#1a1a2e,#16213e);"></div>`;

    let subtitleHtml = '';
    if (seg.subtitle.enabled && seg.narration_text) {
      const style = SUBTITLE_STYLE_MAP[seg.subtitle.style_id] || SUBTITLE_STYLE_MAP.default;
      const posY = seg.subtitle.position === 'top' ? '8%' : seg.subtitle.position === 'center' ? '45%' : '82%';
      const animClass = seg.subtitle.animation === 'typewriter' ? 'typewriter' : seg.subtitle.animation === 'fadeIn' ? 'fade-in' : '';
      subtitleHtml = `
      <div class="clip subtitle ${animClass}" data-start="${start + 0.3}" data-duration="${dur - 0.3}" data-track-index="2"
           style="position:absolute;bottom:${100 - parseInt(posY)}%;left:5%;right:5%;text-align:center;
                  color:${style.color};font-size:${style.size};font-weight:600;
                  text-shadow:0 2px 8px rgba(0,0,0,0.8);background:${style.bg};
                  padding:8px 16px;border-radius:8px;font-family:'PingFang SC','Microsoft YaHei',sans-serif;">
        ${escapeHtml(seg.narration_text)}
      </div>`;
    }

    let dhHtml = '';
    if (seg.digital_human.enabled) {
      dhHtml = `
      <div class="clip" data-start="${start}" data-duration="${dur}" data-track-index="1"
           style="position:absolute;left:${seg.digital_human.position.x}%;top:${seg.digital_human.position.y}%;
                  transform:translate(-50%,-50%) scale(${seg.digital_human.scale / 100});
                  width:120px;height:120px;border-radius:50%;
                  background:rgba(147,51,234,0.3);border:2px dashed rgba(147,51,234,0.5);
                  display:flex;align-items:center;justify-content:center;">
        <span style="font-size:48px;">👤</span>
      </div>`;
    }

    let overlaysHtml = '';
    seg.overlays.forEach(ov => {
      const ovStart = start + ov.seg_start_time;
      const assetUrl = resolveOverlayAssetUrl(ov, assetMap);
      const widthPct = ov.render_width_pct ?? 20;
      const heightPct = ov.render_height_pct ?? 12;
      const maxW = Math.round((w * widthPct) / 100);
      const maxH = Math.round((h * heightPct) / 100);
      const animClass = ov.animation === 'fadeIn' ? 'fade-in' : ov.animation === 'scaleIn' ? 'scale-in' : '';

      if (ov.text && !assetUrl) {
        const fill = ov.style?.fill || 'rgba(255,255,255,0.9)';
        const color = ov.style?.textColor || '#111827';
        overlaysHtml += `
        <div class="clip ${animClass}" data-start="${ovStart}" data-duration="${ov.duration}" data-track-index="3"
             style="position:absolute;left:${ov.position.x}%;top:${ov.position.y}%;
                    transform:translate(-50%,-50%) scale(${ov.scale / 100});
                    max-width:${maxW}px;padding:8px 14px;border-radius:8px;
                    background:${escapeHtml(fill)};color:${escapeHtml(color)};
                    font-size:${Math.max(14, Math.round(maxH * 0.35))}px;font-weight:600;text-align:center;
                    font-family:'PingFang SC','Microsoft YaHei',sans-serif;">
          ${escapeHtml(ov.text)}
        </div>`;
        return;
      }

      if (assetUrl) {
        const isVideo = assetUrl.match(/\.(mp4|mov|webm|gif)$/i);
        overlaysHtml += `
        <div class="clip ${animClass}" data-start="${ovStart}" data-duration="${ov.duration}" data-track-index="3"
             style="position:absolute;left:${ov.position.x}%;top:${ov.position.y}%;
                    transform:translate(-50%,-50%) scale(${ov.scale / 100});">
          ${isVideo && !assetUrl.match(/\.gif$/i)
            ? `<video src="${escapeHtml(assetUrl)}" muted playsinline style="max-width:${maxW}px;max-height:${maxH}px;"></video>`
            : `<img src="${escapeHtml(assetUrl)}" style="max-width:${maxW}px;max-height:${maxH}px;object-fit:contain;" />`
          }
        </div>`;
      }
    });

    segmentEntries.push(`
      <!-- Segment ${i + 1}: ${seg.type} -->
      ${sceneHtml}
      ${dhHtml}
      ${subtitleHtml}
      ${overlaysHtml}
    `);
  });

  const bgmHtml = bgm_url ? `
    <audio data-start="0" data-duration="${totalDuration}" data-track-index="4"
           data-volume="${bgm_volume}" src="${escapeHtml(bgm_url)}"></audio>
  ` : '';

  const transitionStyles = segs.map((seg, i) => {
    if (i === 0 || seg.transition.type === 'none') return '';
    const t = TRANSITION_MAP[seg.transition.type] || 'crossfade';
    return `.seg-${i} { view-transition-name: seg-${i}; }`;
  }).filter(Boolean).join('\n');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(dsl.meta.name)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #000; }

    .fade-in {
      animation: fadeIn 0.5s ease-in forwards;
      opacity: 0;
    }
    @keyframes fadeIn { to { opacity: 1; } }

    .scale-in {
      animation: scaleIn 0.4s ease-out forwards;
      transform: translate(-50%, -50%) scale(0.6);
    }
    @keyframes scaleIn { to { transform: translate(-50%, -50%) scale(1); } }

    .typewriter {
      overflow: hidden;
      white-space: nowrap;
      animation: typing 2s steps(30) forwards;
      width: 0;
    }
    @keyframes typing { to { width: 100%; } }

    ${transitionStyles}
  </style>
</head>
<body>
  <div id="stage" data-composition-id="guide-video"
       data-start="0" data-width="${w}" data-height="${h}" data-fps="${fps}">
    ${segmentEntries.join('\n')}
    ${bgmHtml}
  </div>
</body>
</html>`;
}

export function writeHyperframesComposition(dsl: DSL, outputDir: string, resolvedSegments?: Segment[]): string {
  mkdirSync(outputDir, { recursive: true });
  const html = generateHyperframesHTML(dsl, resolvedSegments);
  const htmlPath = join(outputDir, 'index.html');
  writeFileSync(htmlPath, html, 'utf-8');
  return htmlPath;
}
