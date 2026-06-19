/** Adapt HF caption components to guide DSL clip model (segment text + brand tokens). */

import {
  buildCaptionWordTimings,
  resolveCaptionWordTimings,
  splitCaptionWords,
  type CaptionWordTiming,
} from './captionWordTimings.js';
import { getHfStyleBinding } from './hfStyleRegistry.js';
import { hfLayoutMetrics, scaleHfCaptionFontSize } from './hfVerticalScale.js';

export { buildCaptionWordTimings, splitCaptionWords } from './captionWordTimings.js';

export interface HfCaptionRenderContext {
  styleId: string;
  segmentId: string;
  text: string;
  clipStart: number;
  clipDuration: number;
  canvasWidth: number;
  canvasHeight: number;
  position: 'top' | 'center' | 'bottom' | string;
  fontFamily: string;
  fontSizePx: number;
  accentColor: string;
  textColor: string;
  emphasisWords?: string[];
  wordTimings?: CaptionWordTiming[];
  phraseTimings?: CaptionWordTiming[];
}

export interface HfCaptionClipOutput {
  html: string;
  css: string;
  script: string;
  timelineId: string;
  requiresGsap: boolean;
}

type CaptionWord = CaptionWordTiming;

interface CaptionTiming {
  visibleStart: number;
  visibleDuration: number;
  words: CaptionWord[];
  timelineId: string;
  posStyle: string;
  fontSize: number;
  layout: ReturnType<typeof hfLayoutMetrics>;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function captionPositionStyle(position: string, canvasHeight: number): string {
  const bottomOffset = Math.round(canvasHeight * 0.12);
  if (position === 'top') return `top:${Math.round(canvasHeight * 0.08)}px;bottom:auto;`;
  if (position === 'center') return `top:50%;bottom:auto;transform:translateY(-50%);`;
  return `bottom:${bottomOffset}px;top:auto;`;
}

function buildCaptionTiming(ctx: HfCaptionRenderContext, component: string): CaptionTiming {
  const resolved = resolveCaptionWordTimings({
    text: ctx.text,
    clipDuration: ctx.clipDuration,
    clipStart: ctx.clipStart,
    wordTimings: ctx.wordTimings,
    phraseTimings: ctx.phraseTimings,
  });
  const layout = hfLayoutMetrics(ctx.canvasWidth, ctx.canvasHeight);
  return {
    visibleStart: resolved.visibleStart,
    visibleDuration: resolved.visibleDuration,
    words: resolved.words,
    timelineId: `${component}-${ctx.segmentId}`,
    posStyle: captionPositionStyle(ctx.position, ctx.canvasHeight),
    fontSize: scaleHfCaptionFontSize(ctx.fontSizePx, ctx.canvasWidth, ctx.canvasHeight),
    layout,
  };
}

function groupWordsForHighlight(words: CaptionWord[]): Array<{ wordStart: number; wordEnd: number; start: number; end: number }> {
  if (!words.length) return [];
  const groups: Array<{ wordStart: number; wordEnd: number; start: number; end: number }> = [];
  const chunkSize = words.length <= 6 ? 1 : words.length <= 12 ? 2 : 3;
  for (let i = 0; i < words.length; i += chunkSize) {
    const wordEnd = Math.min(words.length - 1, i + chunkSize - 1);
    const start = words[i].start;
    const nextStart = i + chunkSize < words.length ? words[i + chunkSize].start : words[wordEnd].end + 0.4;
    const end = Math.min(nextStart - 0.05, words[wordEnd].end + 0.35);
    groups.push({ wordStart: i, wordEnd, start, end });
  }
  return groups;
}

function wrapCaptionClip(
  component: string,
  className: string,
  ctx: HfCaptionRenderContext,
  timing: CaptionTiming,
  innerHtml: string,
): string {
  return `
    <div class="clip hf-caption ${className}" data-hf-component="${component}"
         data-start="${ctx.clipStart + timing.visibleStart}" data-duration="${timing.visibleDuration}" data-track-index="2"
         data-timeline-id="${timing.timelineId}"
         style="position:absolute;left:0;right:0;${timing.posStyle}display:flex;justify-content:center;pointer-events:none;z-index:12;">
      ${innerHtml}
    </div>`;
}

function gsapTimelineScript(timelineId: string, body: string): string {
  return `
    (function(){
      if (typeof gsap === 'undefined') return;
      window.__timelines = window.__timelines || {};
      var timelineId = '${timelineId}';
      var tl = gsap.timeline({ paused: true });
      ${body}
      tl.seek(0);
      window.__timelines[timelineId] = tl;
    })();
  `;
}

export function shadeColor(hex: string, amount: number): string {
  const normalized = String(hex || '#ff1745').replace('#', '');
  if (normalized.length !== 6) return hex || '#ff1745';
  const num = parseInt(normalized, 16);
  const r = Math.min(255, Math.max(0, ((num >> 16) & 0xff) + Math.round(255 * amount)));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + Math.round(255 * amount)));
  const b = Math.min(255, Math.max(0, (num & 0xff) + Math.round(255 * amount)));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function isEmphasisWord(text: string, emphasis: Set<string>): boolean {
  const lower = text.toLowerCase();
  return emphasis.has(lower) || emphasis.has(text);
}

export function renderCaptionHighlightClip(ctx: HfCaptionRenderContext): HfCaptionClipOutput {
  const binding = getHfStyleBinding(ctx.styleId);
  const timing = buildCaptionTiming(ctx, 'caption-highlight');
  const groups = groupWordsForHighlight(timing.words);
  const emphasis = new Set((ctx.emphasisWords || []).map((w) => w.toLowerCase()));

  const wordHtml = timing.words.map((w, wi) => {
    const emphasized = isEmphasisWord(w.text, emphasis);
    const bg = emphasized
      ? ctx.accentColor
      : `linear-gradient(135deg, ${ctx.accentColor} 0%, ${shadeColor(ctx.accentColor, -0.12)} 100%)`;
    return `<span class="hl-word" id="hl-w-${timing.timelineId}-${wi}" style="font-size:${timing.fontSize}px;color:${ctx.textColor};">
      <span class="hl-word-bg" id="hl-bg-${timing.timelineId}-${wi}" style="background:${bg};"></span>
      <span class="hl-word-text">${escapeHtml(w.text)}</span>
    </span>`;
  }).join('');

  const { layout } = timing;
  const html = wrapCaptionClip('caption-highlight', 'hf-caption-highlight', ctx, timing, `
      <div class="hl-group" id="hl-grp-${timing.timelineId}" style="display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:center;gap:${layout.gap}px;padding:0 ${layout.sideInsetPct}%;max-width:${layout.maxWidthPct}%;opacity:0;visibility:hidden;">
        ${wordHtml}
      </div>`);

  const css = `
    .hf-caption-highlight .hl-word {
      font-family: ${ctx.fontFamily};
      font-weight: 800; display: inline-block; line-height: 1.1; position: relative;
      padding: ${layout.padY}px ${layout.padX}px ${layout.padY + 2}px; text-shadow: 0 6px 18px rgba(0,0,0,0.45); transform-origin: 50% 58%;
    }
    .hf-caption-highlight .hl-word-bg {
      position: absolute; inset: 0; border-radius: ${layout.borderRadius}px; box-shadow: 0 12px 30px rgba(0,0,0,0.22);
      opacity: 0; transform: scaleX(0); transform-origin: 0% 50%; z-index: -1;
    }
    .hf-caption-highlight .hl-word-text { position: relative; z-index: 1; }
  `;

  const wordsJson = JSON.stringify(timing.words);
  const groupsJson = JSON.stringify(groups);
  const script = gsapTimelineScript(timing.timelineId, `
      var WORDS = ${wordsJson};
      var GROUPS = ${groupsJson};
      var grp = document.getElementById('hl-grp-' + timelineId);
      if (!grp) return;
      GROUPS.forEach(function(g) {
        var groupWords = WORDS.slice(g.wordStart, g.wordEnd + 1);
        tl.set(grp, { visibility: 'visible' }, g.start);
        tl.fromTo(grp, { opacity: 0 }, { opacity: 1, duration: 0.12, ease: 'power2.out' }, g.start);
        groupWords.forEach(function(w, i) {
          var wi = g.wordStart + i;
          var bgEl = document.getElementById('hl-bg-' + timelineId + '-' + wi);
          var wordEl = document.getElementById('hl-w-' + timelineId + '-' + wi);
          if (!bgEl || !wordEl) return;
          tl.to(bgEl, { opacity: 1, scaleX: 1, duration: 0.15, ease: 'power2.out' }, w.start);
          tl.to(wordEl, { filter: 'brightness(1.05)', duration: 0.08, ease: 'power2.out' }, w.start);
          tl.to(wordEl, { filter: 'brightness(1)', duration: 0.16, ease: 'power2.out' }, w.start + 0.08);
          tl.to(bgEl, { opacity: 0, scaleX: 1.02, duration: 0.1, ease: 'power2.in' }, w.end);
          tl.set(bgEl, { scaleX: 0 }, w.end + 0.1);
        });
        tl.to(grp, { opacity: 0, duration: 0.1, ease: 'power2.in' }, g.end - 0.1);
        tl.set(grp, { opacity: 0, visibility: 'hidden' }, g.end);
      });
  `);

  return { html, css, script, timelineId: timing.timelineId, requiresGsap: binding?.requiresGsap ?? true };
}

export function renderCaptionPillClip(ctx: HfCaptionRenderContext): HfCaptionClipOutput {
  const binding = getHfStyleBinding(ctx.styleId);
  const timing = buildCaptionTiming(ctx, 'caption-pill');
  const pillBg = 'rgba(231,229,231,0.92)';
  const idleColor = '#9ca3af';

  const wordHtml = timing.words.map((w, wi) => (
    `<span class="pill-word" id="pill-w-${timing.timelineId}-${wi}" style="font-size:${timing.fontSize}px;color:${idleColor};">${escapeHtml(w.text)}</span>`
  )).join('<span class="pill-gap"></span>');

  const { layout } = timing;
  const html = wrapCaptionClip('caption-pill-karaoke', 'hf-caption-pill', ctx, timing, `
      <div class="pill-shell" id="pill-${timing.timelineId}" style="opacity:0;transform:scale(0.92);">
        <div class="pill-box" style="background:${pillBg};">
          <div class="pill-copy" data-layout-allow-occlusion data-layout-allow-overlap>${wordHtml}</div>
        </div>
      </div>`);

  const css = `
    .hf-caption-pill .pill-shell { max-width: ${layout.maxWidthPct}%; }
    .hf-caption-pill .pill-box {
      padding: ${layout.padY + 6}px ${layout.padX * 2 + 4}px ${layout.padY + 8}px; border-radius: ${layout.shellRadius}px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.18);
    }
    .hf-caption-pill .pill-copy {
      display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: ${layout.gap + 2}px;
      font-family: ${ctx.fontFamily}; font-weight: 700; line-height: 1.2;
    }
    .hf-caption-pill .pill-word {
      transition: color 0.1s; display: inline-block; position: relative; z-index: 1;
      transform-origin: 50% 50%;
    }
    .hf-caption-pill .pill-gap { width: 4px; }
  `;

  const wordsJson = JSON.stringify(timing.words);
  const script = gsapTimelineScript(timing.timelineId, `
      var WORDS = ${wordsJson};
      var shell = document.getElementById('pill-' + timelineId);
      if (!shell) return;
      tl.fromTo(shell, { opacity: 0, scale: 0.92 }, { opacity: 1, scale: 1, duration: 0.28, ease: 'back.out(1.4)' }, 0);
      WORDS.forEach(function(w, wi) {
        var el = document.getElementById('pill-w-' + timelineId + '-' + wi);
        if (!el) return;
        tl.to(el, { color: '${ctx.accentColor}', scale: 1.06, duration: 0.12, ease: 'power2.out', overwrite: 'auto' }, w.start);
        tl.to(el, { color: '${ctx.textColor}', scale: 1, duration: 0.18, ease: 'power2.inOut', overwrite: 'auto' }, w.end);
      });
  `);

  return { html, css, script, timelineId: timing.timelineId, requiresGsap: binding?.requiresGsap ?? true };
}

export function renderCaptionNeonClip(ctx: HfCaptionRenderContext): HfCaptionClipOutput {
  const binding = getHfStyleBinding(ctx.styleId);
  const timing = buildCaptionTiming(ctx, 'caption-neon');
  const glow = ctx.accentColor;

  const wordHtml = timing.words.map((w, wi) => (
    `<span class="neon-word" id="neon-w-${timing.timelineId}-${wi}" style="font-size:${timing.fontSize}px;">${escapeHtml(w.text)}</span>`
  )).join('');

  const { layout } = timing;
  const html = wrapCaptionClip('caption-neon-glow', 'hf-caption-neon', ctx, timing, `
      <div class="neon-group" id="neon-grp-${timing.timelineId}" style="display:flex;flex-wrap:wrap;justify-content:center;gap:${layout.gap + 4}px;padding:0 ${layout.sideInsetPct}%;max-width:${layout.maxWidthPct}%;opacity:0;">
        ${wordHtml}
      </div>`);

  const css = `
    .hf-caption-neon .neon-word {
      font-family: ${ctx.fontFamily};
      font-weight: 900; color: ${ctx.textColor}; display: inline-block; line-height: 1.1;
      text-shadow: 0 0 8px ${glow}, 0 0 18px ${glow}, 0 0 32px ${shadeColor(glow, -0.2)};
    }
  `;

  const wordsJson = JSON.stringify(timing.words);
  const script = gsapTimelineScript(timing.timelineId, `
      var WORDS = ${wordsJson};
      var grp = document.getElementById('neon-grp-' + timelineId);
      if (!grp) return;
      tl.fromTo(grp, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: 'power2.out' }, 0);
      WORDS.forEach(function(w, wi) {
        var el = document.getElementById('neon-w-' + timelineId + '-' + wi);
        if (!el) return;
        tl.fromTo(el, { opacity: 0, y: 16, scale: 0.85 }, { opacity: 1, y: 0, scale: 1, duration: 0.22, ease: 'back.out(2)' }, w.start);
        tl.to(el, { textShadow: '0 0 12px ${glow}, 0 0 28px ${glow}, 0 0 48px ${glow}', duration: 0.15 }, w.start + 0.05);
      });
  `);

  return { html, css, script, timelineId: timing.timelineId, requiresGsap: binding?.requiresGsap ?? true };
}

export function renderCaptionEditorialClip(ctx: HfCaptionRenderContext): HfCaptionClipOutput {
  const binding = getHfStyleBinding(ctx.styleId);
  const timing = buildCaptionTiming(ctx, 'caption-editorial');
  const emphasis = new Set((ctx.emphasisWords || []).map((w) => w.toLowerCase()));

  const wordHtml = timing.words.map((w, wi) => {
    const emph = isEmphasisWord(w.text, emphasis) || wi % 4 === 2;
    const size = emph ? Math.round(timing.fontSize * 1.15) : timing.fontSize;
    const klass = emph ? 'ed-word ed-word--emph' : 'ed-word ed-word--normal';
    return `<span class="${klass}" id="ed-w-${timing.timelineId}-${wi}" style="font-size:${size}px;">${escapeHtml(w.text)}</span>`;
  }).join('');

  const { layout } = timing;
  const html = wrapCaptionClip('caption-editorial-emphasis', 'hf-caption-editorial', ctx, timing, `
      <div class="ed-block" id="ed-${timing.timelineId}" style="opacity:0;max-width:${layout.maxWidthPct}%;padding:0 ${layout.sideInsetPct}%;">
        <div class="ed-line">${wordHtml}</div>
      </div>`);

  const css = `
    .hf-caption-editorial .ed-line {
      display: flex; flex-wrap: wrap; align-items: baseline; justify-content: center; gap: ${layout.gap + 2}px;
      font-family: ${ctx.fontFamily}; line-height: 1.15;
    }
    .hf-caption-editorial .ed-word--normal { color: ${ctx.textColor}; font-weight: 500; }
    .hf-caption-editorial .ed-word--emph {
      color: ${ctx.textColor}; font-weight: 800; font-style: italic;
      text-shadow: 0 2px 12px rgba(0,0,0,0.55);
    }
  `;

  const wordsJson = JSON.stringify(timing.words);
  const script = gsapTimelineScript(timing.timelineId, `
      var WORDS = ${wordsJson};
      var block = document.getElementById('ed-' + timelineId);
      if (!block) return;
      tl.fromTo(block, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out' }, 0);
      WORDS.forEach(function(w, wi) {
        var el = document.getElementById('ed-w-' + timelineId + '-' + wi);
        if (!el) return;
        tl.fromTo(el, { opacity: 0, x: -12 }, { opacity: 1, x: 0, duration: 0.18, ease: 'power2.out' }, w.start);
      });
  `);

  return { html, css, script, timelineId: timing.timelineId, requiresGsap: binding?.requiresGsap ?? true };
}

export function renderCaptionGradientClip(ctx: HfCaptionRenderContext): HfCaptionClipOutput {
  const binding = getHfStyleBinding(ctx.styleId);
  const timing = buildCaptionTiming(ctx, 'caption-gradient');
  const grad = `linear-gradient(90deg, ${ctx.textColor} 0%, ${ctx.accentColor} 45%, ${shadeColor(ctx.accentColor, 0.25)} 100%)`;

  const wordHtml = timing.words.map((w, wi) => (
    `<span class="gr-word" id="gr-w-${timing.timelineId}-${wi}" style="font-size:${timing.fontSize}px;background-image:${grad};">${escapeHtml(w.text)}</span>`
  )).join('');

  const { layout } = timing;
  const html = wrapCaptionClip('caption-gradient-fill', 'hf-caption-gradient', ctx, timing, `
      <div class="gr-group" id="gr-grp-${timing.timelineId}" style="display:flex;flex-wrap:wrap;justify-content:center;gap:${layout.gap + 6}px;padding:0 ${layout.sideInsetPct}%;max-width:${layout.maxWidthPct}%;opacity:0;">
        ${wordHtml}
      </div>`);

  const css = `
    .hf-caption-gradient .gr-word {
      font-family: ${ctx.fontFamily};
      font-weight: 900; display: inline-block; line-height: 1.15;
      -webkit-background-clip: text; background-clip: text; color: transparent;
      background-size: 240% 100%; background-position: 100% 0;
    }
  `;

  const wordsJson = JSON.stringify(timing.words);
  const script = gsapTimelineScript(timing.timelineId, `
      var WORDS = ${wordsJson};
      var grp = document.getElementById('gr-grp-' + timelineId);
      if (!grp) return;
      tl.fromTo(grp, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: 'power2.out' }, 0);
      WORDS.forEach(function(w, wi) {
        var el = document.getElementById('gr-w-' + timelineId + '-' + wi);
        if (!el) return;
        tl.fromTo(el, { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.2, ease: 'power3.out' }, w.start);
        tl.fromTo(el, { backgroundPosition: '100% 0' }, { backgroundPosition: '0% 0', duration: 0.35, ease: 'power2.inOut' }, w.start);
      });
  `);

  return { html, css, script, timelineId: timing.timelineId, requiresGsap: binding?.requiresGsap ?? true };
}

const RENDERERS: Record<string, (ctx: HfCaptionRenderContext) => HfCaptionClipOutput> = {
  'caption-highlight': renderCaptionHighlightClip,
  'caption-pill-karaoke': renderCaptionPillClip,
  'caption-neon-glow': renderCaptionNeonClip,
  'caption-editorial-emphasis': renderCaptionEditorialClip,
  'caption-gradient-fill': renderCaptionGradientClip,
};

export function renderHfCaptionClip(ctx: HfCaptionRenderContext): HfCaptionClipOutput | null {
  const binding = getHfStyleBinding(ctx.styleId);
  if (!binding || binding.slot !== 'subtitle') return null;
  const renderer = RENDERERS[binding.hfName];
  return renderer ? renderer(ctx) : null;
}

export function buildHfCaptionSeekBootstrap(): string {
  return `
    (function(){
      function seekHfCaptions(time) {
        var timelines = window.__timelines || {};
        document.querySelectorAll('.hf-caption[data-timeline-id]').forEach(function(el) {
          var id = el.getAttribute('data-timeline-id');
          var tl = id ? timelines[id] : null;
          if (!tl || typeof tl.seek !== 'function') return;
          var start = Number(el.getAttribute('data-start') || 0);
          var local = Math.max(0, time - start);
          tl.seek(local);
        });
      }
      window.addEventListener('hf-seek', function(ev) {
        var t = ev && ev.detail ? Number(ev.detail.time) : 0;
        if (Number.isFinite(t)) seekHfCaptions(t);
      });
      if (window.__hf && typeof window.__hf.seek === 'function') {
        var nativeSeek = window.__hf.seek.bind(window.__hf);
        window.__hf.seek = function(time) {
          nativeSeek(time);
          seekHfCaptions(time);
        };
      }
    })();
  `;
}