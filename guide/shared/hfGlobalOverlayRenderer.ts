/** Guide-native adapters for HyperFrames global overlays (grain, vignette, VFX). */

import { hfOverlayMetrics } from './hfVerticalScale.js';

export type HfGlobalOverlayType = 'hf-grain' | 'hf-vignette' | 'hf-light-leak' | 'hf-motion-blur' | 'hf-color-grade';
export type HfMotionBlurDirection = 'horizontal' | 'vertical';

export interface HfGlobalOverlayItem {
  type: HfGlobalOverlayType;
  enabled: boolean;
  /** Grain texture opacity (0.05–0.35). */
  opacity?: number;
  /** Vignette edge darkness (0.3–0.9). */
  intensity?: number;
  /** Transparent center radius percent (35–55). */
  vignette_size?: number;
  /** Light leak warmth / brightness (0.2–0.8). */
  leak_intensity?: number;
  /** Optional CSS color for light leak gradients. */
  leak_color?: string;
  /** Motion blur pulse strength (0.15–0.65). */
  blur_intensity?: number;
  direction?: HfMotionBlurDirection;
  /** Color grade warmth 0=cool, 1=warm. */
  grade_warmth?: number;
  /** Color grade blend strength (0.1–0.5). */
  grade_strength?: number;
  /** Saturation multiplier (0.85–1.35). */
  grade_saturation?: number;
}

export interface HfGlobalOverlayRenderContext {
  totalDuration: number;
  canvasWidth: number;
  canvasHeight: number;
  accentColor?: string;
  /** First track index for enabled global overlays (each overlay gets its own track). */
  trackStart?: number;
  trackIndex?: number;
}

export interface HfGlobalOverlayClipOutput {
  html: string;
  css: string;
  script?: string;
  timelineId?: string;
  requiresGsap?: boolean;
}

export interface HfGlobalOverlayClipsResult {
  html: string;
  css: string;
  scripts: string[];
  requiresGsap: boolean;
}

export const HF_GLOBAL_OVERLAY_TYPES = new Set<HfGlobalOverlayType>([
  'hf-grain',
  'hf-vignette',
  'hf-light-leak',
  'hf-motion-blur',
  'hf-color-grade',
]);

export const DEFAULT_HF_GLOBAL_OVERLAYS: HfGlobalOverlayItem[] = [
  { type: 'hf-grain', enabled: false, opacity: 0.15 },
  { type: 'hf-vignette', enabled: false, intensity: 0.7, vignette_size: 45 },
  { type: 'hf-light-leak', enabled: false, leak_intensity: 0.45 },
  { type: 'hf-motion-blur', enabled: false, blur_intensity: 0.35, direction: 'horizontal' },
  { type: 'hf-color-grade', enabled: false, grade_warmth: 0.58, grade_strength: 0.28, grade_saturation: 1.08 },
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function gsapTimelineScript(timelineId: string, body: string): string {
  return `
    (function(){
      if (typeof gsap === 'undefined') return;
      window.__timelines = window.__timelines || {};
      var timelineId = '${timelineId}';
      var root = document.getElementById('hf-global-' + timelineId);
      if (!root) return;
      var tl = gsap.timeline({ paused: true, repeat: -1 });
      ${body}
      tl.seek(0);
      window.__timelines[timelineId] = tl;
    })();
  `;
}

export function normalizeHfGlobalOverlays(
  items: HfGlobalOverlayItem[] | undefined,
): HfGlobalOverlayItem[] {
  const source = Array.isArray(items) ? items : [];
  const merged = DEFAULT_HF_GLOBAL_OVERLAYS.map((defaults) => {
    const found = source.find((item) => item.type === defaults.type);
    return {
      ...defaults,
      ...found,
      enabled: Boolean(found?.enabled),
    };
  });
  const known = new Set(DEFAULT_HF_GLOBAL_OVERLAYS.map((item) => item.type));
  for (const item of source) {
    if (!known.has(item.type)) merged.push(item);
  }
  return merged;
}

export function getEnabledHfGlobalOverlays(
  items: HfGlobalOverlayItem[] | undefined,
): HfGlobalOverlayItem[] {
  return normalizeHfGlobalOverlays(items).filter((item) => item.enabled);
}

export function dslUsesHyperframesGlobalOverlays(dsl: {
  globalConfig?: { hf_overlays?: HfGlobalOverlayItem[] };
}): boolean {
  return getEnabledHfGlobalOverlays(dsl.globalConfig?.hf_overlays).length > 0;
}

export function renderGrainOverlay(
  item: HfGlobalOverlayItem,
  ctx: HfGlobalOverlayRenderContext,
): HfGlobalOverlayClipOutput {
  const opacity = clamp(Number(item.opacity ?? 0.15), 0.05, 0.35);
  const html = `
    <div class="clip hf-global-overlay hf-global-grain" data-hf-component="grain-overlay"
         id="hf-global-grain" data-start="0" data-duration="${ctx.totalDuration}" data-track-index="${ctx.trackIndex ?? 9}"
         style="position:absolute;inset:0;pointer-events:none;z-index:100;overflow:hidden;">
      <div class="grain-texture"></div>
    </div>`;

  const css = `
    .hf-global-grain .grain-texture {
      position: absolute;
      top: -50%;
      left: -50%;
      width: 200%;
      height: 200%;
      background: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
      opacity: ${opacity};
      animation: hf-grain-noise 0.5s steps(1) infinite;
    }
    @keyframes hf-grain-noise {
      0%, 100% { transform: translate(0, 0); }
      10% { transform: translate(-5%, -5%); }
      20% { transform: translate(-10%, 5%); }
      30% { transform: translate(5%, -10%); }
      40% { transform: translate(-5%, 15%); }
      50% { transform: translate(-10%, 5%); }
      60% { transform: translate(15%, 0); }
      70% { transform: translate(0, 10%); }
      80% { transform: translate(-15%, 0); }
      90% { transform: translate(10%, 5%); }
    }
  `;

  return { html, css };
}

export function renderVignetteOverlay(
  item: HfGlobalOverlayItem,
  ctx: HfGlobalOverlayRenderContext,
): HfGlobalOverlayClipOutput {
  const intensity = clamp(Number(item.intensity ?? 0.7), 0.3, 0.9);
  const size = clamp(Number(item.vignette_size ?? 45), 35, 55);
  const edgeAlpha = intensity.toFixed(2);

  const html = `
    <div class="clip hf-global-overlay hf-global-vignette" data-hf-component="vignette"
         id="hf-global-vignette" data-start="0" data-duration="${ctx.totalDuration}" data-track-index="${ctx.trackIndex ?? 8}"
         style="position:absolute;inset:0;pointer-events:none;z-index:90;
                --vignette-size:${size}%;--vignette-color:rgba(0,0,0,${edgeAlpha});"></div>`;

  const css = `
    .hf-global-vignette {
      background: radial-gradient(
        ellipse at center,
        transparent var(--vignette-size, 45%),
        var(--vignette-color, rgba(0, 0, 0, 0.7)) 100%
      );
    }
  `;

  return { html, css };
}

export function renderLightLeakOverlay(
  item: HfGlobalOverlayItem,
  ctx: HfGlobalOverlayRenderContext,
): HfGlobalOverlayClipOutput {
  const timelineId = 'light-leak';
  const leakIntensity = clamp(Number(item.leak_intensity ?? 0.45), 0.2, 0.8);
  const leakColor = String(item.leak_color || ctx.accentColor || '#fb8b24').trim();
  const warm = leakColor;
  const fade = `${leakColor}00`;
  const overlay = hfOverlayMetrics(ctx.canvasWidth, ctx.canvasHeight);

  const html = `
    <div class="clip hf-global-overlay hf-global-light-leak" data-hf-component="light-leak"
         id="hf-global-${timelineId}" data-timeline-id="${timelineId}"
         data-start="0" data-duration="${ctx.totalDuration}" data-track-index="${ctx.trackIndex ?? 7}"
         style="position:absolute;inset:0;pointer-events:none;z-index:85;overflow:hidden;mix-blend-mode:screen;">
      <div class="leak-band leak-a" id="hf-light-leak-a"></div>
      <div class="leak-band leak-b" id="hf-light-leak-b"></div>
    </div>`;

  const css = `
    .hf-global-light-leak .leak-band {
      position: absolute;
      width: ${overlay.leakBandWidthPct}%;
      height: 140%;
      top: -20%;
      border-radius: 50%;
      opacity: 0;
      filter: blur(${overlay.leakBlurPx}px);
      background: radial-gradient(circle at 30% 40%, ${warm} 0%, ${fade} 72%);
      will-change: transform, opacity;
    }
    .hf-global-light-leak .leak-a { left: -35%; transform: rotate(-18deg); }
    .hf-global-light-leak .leak-b { right: -35%; transform: rotate(14deg); }
  `;

  const cycle = Math.max(2.5, Math.min(ctx.totalDuration, 6));
  const script = gsapTimelineScript(timelineId, `
      var leakA = document.getElementById('hf-light-leak-a');
      var leakB = document.getElementById('hf-light-leak-b');
      if (!leakA || !leakB) return;
      var peak = ${leakIntensity};
      tl.fromTo(leakA, { x: '-25%', opacity: 0 }, { x: '35%', opacity: peak, duration: ${cycle * 0.45}, ease: 'sine.inOut' }, 0);
      tl.to(leakA, { x: '95%', opacity: 0, duration: ${cycle * 0.55}, ease: 'sine.inOut' }, ${cycle * 0.45});
      tl.fromTo(leakB, { x: '25%', opacity: 0 }, { x: '-35%', opacity: peak * 0.85, duration: ${cycle * 0.5}, ease: 'sine.inOut' }, ${cycle * 0.25});
      tl.to(leakB, { x: '-95%', opacity: 0, duration: ${cycle * 0.5}, ease: 'sine.inOut' }, ${cycle * 0.75});
  `);

  return { html, css, script, timelineId, requiresGsap: true };
}

export function renderColorGradeOverlay(
  item: HfGlobalOverlayItem,
  ctx: HfGlobalOverlayRenderContext,
): HfGlobalOverlayClipOutput {
  const warmth = clamp(Number(item.grade_warmth ?? 0.58), 0, 1);
  const strength = clamp(Number(item.grade_strength ?? 0.28), 0.1, 0.5);
  const saturation = clamp(Number(item.grade_saturation ?? 1.08), 0.85, 1.35);
  const timelineId = 'color-grade';
  const warmTint = warmth >= 0.5
    ? `rgba(251, 146, 60, ${0.12 + strength * 0.35})`
    : `rgba(96, 165, 250, ${0.1 + strength * 0.32})`;
  const coolTint = warmth >= 0.5
    ? `rgba(59, 130, 246, ${0.06 + strength * 0.18})`
    : `rgba(30, 64, 175, ${0.08 + strength * 0.22})`;
  const baseOpacity = (0.55 + strength * 0.35).toFixed(2);

  const html = `
    <div class="clip hf-global-overlay hf-global-color-grade" data-hf-component="color-grade"
         id="hf-global-${timelineId}" data-timeline-id="${timelineId}"
         data-start="0" data-duration="${ctx.totalDuration}" data-track-index="${ctx.trackIndex ?? 7}"
         style="position:absolute;inset:0;pointer-events:none;z-index:85;overflow:hidden;">
      <div class="hf-color-grade-filter"></div>
    </div>`;

  const css = `
    .hf-global-color-grade .hf-color-grade-filter {
      position: absolute;
      inset: 0;
      background: linear-gradient(155deg, ${warmTint} 0%, transparent 48%, ${coolTint} 100%);
      mix-blend-mode: soft-light;
      opacity: ${baseOpacity};
      filter: saturate(${saturation});
      will-change: opacity, filter;
    }
  `;

  const cycle = Math.max(2.4, Math.min(ctx.totalDuration * 0.4, 5));
  const script = gsapTimelineScript(timelineId, `
      var filterEl = root.querySelector('.hf-color-grade-filter');
      if (!filterEl) return;
      var baseSat = ${saturation};
      var peak = ${(0.5 + strength * 0.4).toFixed(2)};
      var low = ${(0.35 + strength * 0.25).toFixed(2)};
      tl.fromTo(filterEl, { opacity: low }, { opacity: peak, duration: ${cycle * 0.45}, ease: 'sine.inOut' }, 0);
      tl.to(filterEl, { opacity: low, duration: ${cycle * 0.55}, ease: 'sine.inOut' }, ${cycle * 0.45});
      tl.fromTo(filterEl, { filter: 'saturate(' + (baseSat - 0.04) + ')' },
        { filter: 'saturate(' + (baseSat + 0.06) + ')', duration: ${cycle}, ease: 'sine.inOut' }, 0);
  `);

  return { html, css, script, timelineId, requiresGsap: true };
}

export function renderMotionBlurOverlay(
  item: HfGlobalOverlayItem,
  ctx: HfGlobalOverlayRenderContext,
): HfGlobalOverlayClipOutput {
  const timelineId = 'motion-blur';
  const blurIntensity = clamp(Number(item.blur_intensity ?? 0.35), 0.15, 0.65);
  const direction = item.direction === 'vertical' ? 'vertical' : 'horizontal';
  const overlay = hfOverlayMetrics(ctx.canvasWidth, ctx.canvasHeight);
  const blurPx = overlay.motionBlurPx(blurIntensity);
  const streakOpacity = (blurIntensity * 0.55).toFixed(2);
  const gradient = direction === 'vertical'
    ? `linear-gradient(180deg, transparent 0%, rgba(255,255,255,${streakOpacity}) 48%, transparent 100%)`
    : `linear-gradient(90deg, transparent 0%, rgba(255,255,255,${streakOpacity}) 48%, transparent 100%)`;

  const html = `
    <div class="clip hf-global-overlay hf-global-motion-blur" data-hf-component="motion-blur"
         id="hf-global-${timelineId}" data-timeline-id="${timelineId}"
         data-start="0" data-duration="${ctx.totalDuration}" data-track-index="${ctx.trackIndex ?? 6}"
         style="position:absolute;inset:0;pointer-events:none;z-index:80;overflow:hidden;">
      <div class="blur-streak" id="hf-motion-blur-streak"></div>
      <div class="blur-veil" id="hf-motion-blur-veil"></div>
    </div>`;

  const css = `
    .hf-global-motion-blur .blur-streak {
      position: absolute;
      inset: -10%;
      opacity: 0;
      background: ${gradient};
      filter: blur(${blurPx}px);
      transform: ${direction === 'vertical' ? 'scaleY(1.08)' : 'scaleX(1.08)'};
      will-change: transform, opacity, filter;
    }
    .hf-global-motion-blur .blur-veil {
      position: absolute;
      inset: 0;
      opacity: 0;
      backdrop-filter: blur(0px);
      -webkit-backdrop-filter: blur(0px);
      background: rgba(255,255,255,0.02);
      will-change: opacity, backdrop-filter;
    }
  `;

  const pulse = Math.max(1.8, Math.min(ctx.totalDuration * 0.35, 4));
  const script = gsapTimelineScript(timelineId, `
      var streak = document.getElementById('hf-motion-blur-streak');
      var veil = document.getElementById('hf-motion-blur-veil');
      if (!streak || !veil) return;
      var peak = ${blurIntensity};
      var blurPx = ${blurPx};
      tl.fromTo(streak, { opacity: 0, ${direction === 'vertical' ? 'y' : 'x'}: '-8%' },
        { opacity: peak, ${direction === 'vertical' ? 'y' : 'x'}: '0%', duration: ${pulse * 0.35}, ease: 'power2.out' }, 0);
      tl.to(streak, { opacity: 0, ${direction === 'vertical' ? 'y' : 'x'}: '8%', duration: ${pulse * 0.45}, ease: 'power2.in' }, ${pulse * 0.35});
      tl.fromTo(veil, { opacity: 0 }, { opacity: peak * 0.65, duration: ${pulse * 0.2}, ease: 'sine.out' }, ${pulse * 0.1});
      tl.to(veil, { opacity: 0, duration: ${pulse * 0.35}, ease: 'sine.in' }, ${pulse * 0.45});
      tl.set(veil, { backdropFilter: 'blur(' + blurPx + 'px)', webkitBackdropFilter: 'blur(' + blurPx + 'px)' }, ${pulse * 0.1});
      tl.set(veil, { backdropFilter: 'blur(0px)', webkitBackdropFilter: 'blur(0px)' }, ${pulse * 0.8});
  `);

  return { html, css, script, timelineId, requiresGsap: true };
}

export function buildHfGlobalOverlaySeekBootstrap(): string {
  return `
    (function(){
      function seekHfGlobalOverlays(time) {
        var timelines = window.__timelines || {};
        document.querySelectorAll('.hf-global-overlay[data-timeline-id]').forEach(function(el) {
          var id = el.getAttribute('data-timeline-id');
          var tl = id ? timelines[id] : null;
          if (!tl || typeof tl.seek !== 'function') return;
          var start = Number(el.getAttribute('data-start') || 0);
          var local = Math.max(0, time - start);
          var dur = Number(el.getAttribute('data-duration') || 0);
          if (dur > 0 && tl.duration() > 0) {
            tl.seek(local % tl.duration());
          } else {
            tl.seek(local);
          }
        });
      }
      window.addEventListener('hf-seek', function(ev) {
        var t = ev && ev.detail ? Number(ev.detail.time) : 0;
        if (Number.isFinite(t)) seekHfGlobalOverlays(t);
      });
    })();
  `;
}

export function renderHfGlobalOverlayClips(
  items: HfGlobalOverlayItem[] | undefined,
  ctx: HfGlobalOverlayRenderContext,
): HfGlobalOverlayClipsResult {
  const enabled = getEnabledHfGlobalOverlays(items);
  const clips: HfGlobalOverlayClipOutput[] = [];
  let track = ctx.trackStart ?? 30;
  for (const item of enabled) {
    const itemCtx = { ...ctx, trackIndex: track++ };
    if (item.type === 'hf-grain') clips.push(renderGrainOverlay(item, itemCtx));
    if (item.type === 'hf-vignette') clips.push(renderVignetteOverlay(item, itemCtx));
    if (item.type === 'hf-light-leak') clips.push(renderLightLeakOverlay(item, itemCtx));
    if (item.type === 'hf-motion-blur') clips.push(renderMotionBlurOverlay(item, itemCtx));
    if (item.type === 'hf-color-grade') clips.push(renderColorGradeOverlay(item, itemCtx));
  }
  const scripts = clips.map((clip) => clip.script).filter((script): script is string => Boolean(script));
  return {
    html: clips.map((clip) => clip.html).join('\n'),
    css: clips.map((clip) => clip.css).join('\n'),
    scripts,
    requiresGsap: clips.some((clip) => clip.requiresGsap),
  };
}