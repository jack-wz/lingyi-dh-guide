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

function phraseContainsEmphasis(text: string, emphasis: Set<string>): boolean {
  const lower = text.toLowerCase();
  return Array.from(emphasis).some((kw) => {
    const kl = kw.toLowerCase();
    return kl.includes(lower) || lower.includes(kl);
  });
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

export function renderCaptionPopClip(ctx: HfCaptionRenderContext): HfCaptionClipOutput {
  const binding = getHfStyleBinding(ctx.styleId);
  const timing = buildCaptionTiming(ctx, 'caption-pop');
  const wordHtml = timing.words.map((w, wi) => (
    `<span class="pop-word" id="pop-w-${timing.timelineId}-${wi}" style="font-size:${timing.fontSize}px;color:${ctx.textColor};background:${ctx.accentColor};">${escapeHtml(w.text)}</span>`
  )).join('');

  const { layout } = timing;
  const html = wrapCaptionClip('caption-pop-bounce', 'hf-caption-pop', ctx, timing, `
      <div class="pop-row" id="pop-row-${timing.timelineId}" style="display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:${layout.gap}px;padding:0 ${layout.sideInsetPct}%;max-width:${layout.maxWidthPct}%;opacity:0;visibility:hidden;">
        ${wordHtml}
      </div>`);

  const css = `
    .hf-caption-pop .pop-word {
      font-family: ${ctx.fontFamily};
      font-weight: 800;
      display: inline-block;
      line-height: 1.1;
      padding: ${layout.padY}px ${layout.padX}px;
      border-radius: ${layout.borderRadius}px;
      box-shadow: 0 10px 24px rgba(0,0,0,0.28);
      transform: scale(0);
      opacity: 0;
      transform-origin: 50% 80%;
    }
  `;

  const wordsJson = JSON.stringify(timing.words);
  const script = gsapTimelineScript(timing.timelineId, `
      var WORDS = ${wordsJson};
      var row = document.getElementById('pop-row-' + timelineId);
      if (!row) return;
      tl.set(row, { visibility: 'visible' }, 0);
      tl.fromTo(row, { opacity: 0 }, { opacity: 1, duration: 0.12, ease: 'power2.out' }, 0);
      WORDS.forEach(function(w, wi) {
        var el = document.getElementById('pop-w-' + timelineId + '-' + wi);
        if (!el) return;
        tl.fromTo(el, { scale: 0, opacity: 0, y: 16 }, { scale: 1, opacity: 1, y: 0, duration: 0.22, ease: 'back.out(2.4)' }, w.start);
        tl.to(el, { scale: 0.94, duration: 0.08, ease: 'power2.inOut' }, w.end - 0.06);
        tl.to(el, { scale: 1, duration: 0.1, ease: 'power2.out' }, w.end);
      });
  `);

  return { html, css, script, timelineId: timing.timelineId, requiresGsap: binding?.requiresGsap ?? true };
}

export function renderCaptionStaggerClip(ctx: HfCaptionRenderContext): HfCaptionClipOutput {
  const binding = getHfStyleBinding(ctx.styleId);
  const timing = buildCaptionTiming(ctx, 'caption-stagger');
  const wordHtml = timing.words.map((w, wi) => (
    `<span class="stagger-word" id="stagger-w-${timing.timelineId}-${wi}" style="font-size:${timing.fontSize}px;color:${ctx.textColor};">${escapeHtml(w.text)}</span>`
  )).join('<span class="stagger-gap" aria-hidden="true">&nbsp;</span>');

  const { layout } = timing;
  const html = wrapCaptionClip('caption-stagger-slide', 'hf-caption-stagger', ctx, timing, `
      <div class="stagger-shell" id="stagger-shell-${timing.timelineId}" style="display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:${layout.gap}px;padding:${layout.padY}px ${layout.padX}px;max-width:${layout.maxWidthPct}%;background:${ctx.accentColor};border-radius:${layout.borderRadius}px;box-shadow:0 10px 24px rgba(0,0,0,0.28);opacity:0;visibility:hidden;">
        ${wordHtml}
      </div>`);

  const css = `
    .hf-caption-stagger .stagger-word {
      font-family: ${ctx.fontFamily};
      font-weight: 700;
      display: inline-block;
      line-height: 1.15;
      transform: translateY(18px);
      opacity: 0;
    }
    .hf-caption-stagger .stagger-gap { display: inline-block; width: 4px; }
  `;

  const wordsJson = JSON.stringify(timing.words);
  const script = gsapTimelineScript(timing.timelineId, `
      var WORDS = ${wordsJson};
      var shell = document.getElementById('stagger-shell-' + timelineId);
      if (!shell) return;
      tl.set(shell, { visibility: 'visible' }, 0);
      tl.fromTo(shell, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.18, ease: 'power2.out' }, 0);
      WORDS.forEach(function(w, wi) {
        var el = document.getElementById('stagger-w-' + timelineId + '-' + wi);
        if (!el) return;
        tl.fromTo(el, { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: 0.24, ease: 'power3.out' }, w.start);
      });
  `);

  return { html, css, script, timelineId: timing.timelineId, requiresGsap: binding?.requiresGsap ?? true };
}

function groupCaptionWordsIntoLines(
  words: CaptionWord[],
  visibleEnd: number,
  maxChars = 14,
): Array<{ wordStart: number; wordEnd: number; start: number; end: number }> {
  if (!words.length) return [];
  const groups: Array<{ wordStart: number; wordEnd: number; start: number; end: number }> = [];
  let currentStart = 0;
  let currentLen = 0;
  for (let i = 0; i < words.length; i++) {
    const wlen = words[i].text.length;
    if (currentLen > 0 && currentLen + wlen > maxChars) {
      const prevEnd = i - 1;
      const nextStart = i < words.length ? words[i].start : words[prevEnd].end + 0.5;
      groups.push({
        wordStart: currentStart,
        wordEnd: prevEnd,
        start: words[currentStart].start,
        end: Math.min(words[prevEnd].end + 0.35, nextStart - 0.05),
      });
      currentStart = i;
      currentLen = wlen;
    } else {
      currentLen += wlen;
    }
  }
  const last = words[words.length - 1];
  groups.push({
    wordStart: currentStart,
    wordEnd: words.length - 1,
    start: words[currentStart].start,
    end: Math.min(last.end + 0.4, visibleEnd),
  });
  return groups;
}

export function renderCaptionClipWipeClip(ctx: HfCaptionRenderContext): HfCaptionClipOutput {
  const binding = getHfStyleBinding(ctx.styleId);
  const timing = buildCaptionTiming(ctx, 'caption-clip-wipe');
  const visibleEnd = timing.visibleStart + timing.visibleDuration;
  const groups = groupCaptionWordsIntoLines(timing.words, visibleEnd, 14);
  const emphasis = new Set((ctx.emphasisWords || []).map((w) => w.toLowerCase()));
  const isPhraseEmphasis = (text: string) => {
    const lower = text.toLowerCase();
    return Array.from(emphasis).some((kw) => lower.includes(kw));
  };

  const { layout } = timing;
  const lineHtml = groups.map((g, gi) => {
    const groupWords = timing.words.slice(g.wordStart, g.wordEnd + 1);
    const wordSpans = groupWords.map((w, i) => {
      const wi = g.wordStart + i;
      const emphasized = isPhraseEmphasis(w.text);
      const color = emphasized ? ctx.accentColor : ctx.textColor;
      return `<span class="wipe-word ${emphasized ? 'wipe-word--emph' : ''}" id="wipe-w-${timing.timelineId}-${wi}" style="font-size:${timing.fontSize}px;color:${color};text-shadow:0 4px 18px rgba(0,0,0,0.55);" data-emph="${emphasized}" data-dbg-emphasis="${Array.from(emphasis).join(',')}" data-dbg-accent="${ctx.accentColor}" data-dbg-textcolor="${ctx.textColor}">${escapeHtml(w.text)}</span>`;
    }).join('<span class="wipe-gap" aria-hidden="true">&nbsp;</span>');
    return `<div class="wipe-group" id="wipe-grp-${timing.timelineId}-${gi}" style="visibility:hidden;">${wordSpans}</div>`;
  }).join('');

  const html = wrapCaptionClip('caption-clip-wipe', 'hf-caption-clip-wipe', ctx, timing, `
      <div class="wipe-shell" id="wipe-shell-${timing.timelineId}" style="padding:0 ${layout.sideInsetPct}%;max-width:${layout.maxWidthPct}%;">
        ${lineHtml}
      </div>`);

  const css = `
    .hf-caption-clip-wipe .wipe-shell {
      display: flex; flex-direction: column; align-items: center; justify-content: flex-end;
      position: absolute; left: 0; right: 0; ${captionPositionStyle(ctx.position, ctx.canvasHeight)} height: 35%;
      pointer-events: none;
    }
    .hf-caption-clip-wipe .wipe-group {
      position: absolute; bottom: 0; left: 0; right: 0;
      display: flex; flex-wrap: wrap; align-items: center; justify-content: center;
      gap: ${layout.gap + 2}px; padding: 0 ${layout.sideInsetPct}%;
      font-family: ${ctx.fontFamily}; font-weight: 800; line-height: 1.15;
      text-shadow: 0 4px 18px rgba(0,0,0,0.55);
    }
    .hf-caption-clip-wipe .wipe-word {
      display: inline-block; clip-path: inset(0 100% 0 0); will-change: clip-path;
    }
    .hf-caption-clip-wipe .wipe-gap { display: inline-block; width: 4px; }
  `;

  const wordsJson = JSON.stringify(timing.words);
  const groupsJson = JSON.stringify(groups);
  const script = gsapTimelineScript(timing.timelineId, `
      var WORDS = ${wordsJson};
      var GROUPS = ${groupsJson};
      GROUPS.forEach(function(g, gi) {
        var grp = document.getElementById('wipe-grp-' + timelineId + '-' + gi);
        if (!grp) return;
        var groupWords = WORDS.slice(g.wordStart, g.wordEnd + 1);
        tl.set(grp, { visibility: 'visible' }, g.start);
        groupWords.forEach(function(w, i) {
          var wi = g.wordStart + i;
          var el = document.getElementById('wipe-w-' + timelineId + '-' + wi);
          if (!el) return;
          tl.to(el, { clipPath: 'inset(0 0% 0 0)', duration: 0.28, ease: 'power2.out' }, w.start);
        });
        var wordEls = grp.querySelectorAll('.wipe-word');
        tl.to(wordEls, { clipPath: 'inset(0 0% 0 100%)', duration: 0.22, stagger: 0.03, ease: 'power2.in' }, g.end - 0.15);
        tl.set(grp, { visibility: 'hidden' }, g.end);
      });
  `);

  return { html, css, script, timelineId: timing.timelineId, requiresGsap: binding?.requiresGsap ?? true };
}

export function renderCaptionMatrixDecodeClip(ctx: HfCaptionRenderContext): HfCaptionClipOutput {
  const binding = getHfStyleBinding(ctx.styleId);
  const timing = buildCaptionTiming(ctx, 'caption-matrix-decode');
  const visibleEnd = timing.visibleStart + timing.visibleDuration;
  const groups = groupCaptionWordsIntoLines(timing.words, visibleEnd, 14);
  const matrixColor = '#00ff41';
  const emphasis = new Set((ctx.emphasisWords || []).map((w) => w.toLowerCase()));

  const { layout } = timing;
  const groupHtml = groups.map((g, gi) => {
    const groupWords = timing.words.slice(g.wordStart, g.wordEnd + 1);
    const wordSpans = groupWords.map((w, i) => {
      const wi = g.wordStart + i;
      const emphasized = phraseContainsEmphasis(w.text, emphasis);
      const color = emphasized ? ctx.accentColor : matrixColor;
      return `<span class="mtx-word" id="mtx-w-${timing.timelineId}-${wi}" data-text="${escapeHtml(w.text)}" style="font-size:${timing.fontSize}px;color:${color};">${escapeHtml(w.text)}</span>`;
    }).join('');
    return `<div class="mtx-group" id="mtx-grp-${timing.timelineId}-${gi}" style="visibility:hidden;">${wordSpans}</div>`;
  }).join('');

  const html = wrapCaptionClip('caption-matrix-decode', 'hf-caption-matrix', ctx, timing, `
      <div class="mtx-shell" id="mtx-shell-${timing.timelineId}" style="padding:0 ${layout.sideInsetPct}%;max-width:${layout.maxWidthPct}%;">
        ${groupHtml}
      </div>`);

  const css = `
    .hf-caption-matrix .mtx-shell {
      display: flex; flex-direction: column; align-items: center; justify-content: flex-end;
      position: absolute; left: 0; right: 0; ${captionPositionStyle(ctx.position, ctx.canvasHeight)} height: 35%;
      pointer-events: none;
    }
    .hf-caption-matrix .mtx-group {
      position: absolute; bottom: 0; left: 0; right: 0;
      display: flex; flex-wrap: wrap; align-items: center; justify-content: center;
      gap: ${layout.gap + 2}px; padding: 0 ${layout.sideInsetPct}%;
      font-family: ${ctx.fontFamily}; font-weight: 800; line-height: 1.15;
      text-shadow: 0 0 10px ${matrixColor}, 0 0 24px ${shadeColor(matrixColor, -0.2)};
    }
    .hf-caption-matrix .mtx-word {
      display: inline-block; position: relative; min-width: 0.5em; text-align: center;
    }
  `;

  const wordsJson = JSON.stringify(timing.words);
  const groupsJson = JSON.stringify(groups);
  const ALPHANUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const script = gsapTimelineScript(timing.timelineId, `
      var WORDS = ${wordsJson};
      var GROUPS = ${groupsJson};
      var ALPHANUM = '${ALPHANUM}';
      function mtxScramble(seed){ seed |= 0; seed = (seed + 0x6d2b79f5) | 0; var t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
      function mtxChars(seed){ var r=''; for(var i=0;i<4;i++){ r+=ALPHANUM[Math.floor(mtxScramble(seed + i)*ALPHANUM.length)]; } return r; }
      GROUPS.forEach(function(g, gi){
        var grp = document.getElementById('mtx-grp-' + timelineId + '-' + gi);
        if(!grp) return;
        var wordEls = grp.querySelectorAll('.mtx-word');
        tl.set(grp, { visibility: 'visible' }, g.start);
        wordEls.forEach(function(el, idx){
          var wi = g.wordStart + idx;
          var w = WORDS[wi];
          var original = el.getAttribute('data-text') || el.textContent;
          var seed = wi * 7919;
          tl.fromTo(el, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.12, ease: 'power2.out' }, w.start);
          for(var s=0; s<6; s++){
            tl.call(function(el, chars){ el.textContent = chars; }, [el, mtxChars(seed + s)], w.start + s * 0.03);
          }
          tl.call(function(el, chars){ el.textContent = chars; }, [el, original], w.start + 6 * 0.03 + 0.02);
          tl.to(el, { opacity: 0, duration: 0.08 }, w.end);
        });
        tl.set(grp, { visibility: 'hidden' }, g.end);
      });
  `);

  return { html, css, script, timelineId: timing.timelineId, requiresGsap: binding?.requiresGsap ?? true };
}

export function renderCaptionEmojiPopClip(ctx: HfCaptionRenderContext): HfCaptionClipOutput {
  const binding = getHfStyleBinding(ctx.styleId);
  const timing = buildCaptionTiming(ctx, 'caption-emoji-pop');
  const visibleEnd = timing.visibleStart + timing.visibleDuration;
  const groups = groupCaptionWordsIntoLines(timing.words, visibleEnd, 14);
  const emphasis = new Set((ctx.emphasisWords || []).map((w) => w.toLowerCase()));
  const emojiFor = (text: string): string => {
    const map: Record<string, string> = { '优惠': '🎁', '折扣': '🏷️', '抢购': '🔥', '新品': '✨', '免费': '🆓', '特价': '💰', '爆款': '⭐' };
    return map[text] || '✨';
  };

  const { layout } = timing;
  const groupHtml = groups.map((g, gi) => {
    const groupWords = timing.words.slice(g.wordStart, g.wordEnd + 1);
    const emphasized = phraseContainsEmphasis(groupWords.map((w) => w.text).join(''), emphasis);
    const emoji = emphasized ? `<div class="emoji-pop-emoji" id="emoji-pop-emoji-${timing.timelineId}-${gi}">${emojiFor(groupWords.map((w) => w.text).join(''))}</div>` : '';
    const wordSpans = groupWords.map((w, i) => {
      const wi = g.wordStart + i;
      return `<span class="emoji-pop-word" id="emoji-pop-w-${timing.timelineId}-${wi}" style="font-size:${timing.fontSize}px;color:${ctx.textColor};">${escapeHtml(w.text)}</span>`;
    }).join('');
    return `<div class="emoji-pop-group" id="emoji-pop-grp-${timing.timelineId}-${gi}" style="visibility:hidden;">
        ${emoji}
        <div class="emoji-pop-line">${wordSpans}</div>
      </div>`;
  }).join('');

  const html = wrapCaptionClip('caption-emoji-pop', 'hf-caption-emoji-pop', ctx, timing, `
      <div class="emoji-pop-shell" id="emoji-pop-shell-${timing.timelineId}" style="padding:0 ${layout.sideInsetPct}%;max-width:${layout.maxWidthPct}%;">
        ${groupHtml}
      </div>`);

  const css = `
    .hf-caption-emoji-pop .emoji-pop-shell {
      display: flex; flex-direction: column; align-items: center; justify-content: flex-end;
      position: absolute; left: 0; right: 0; ${captionPositionStyle(ctx.position, ctx.canvasHeight)} height: 40%;
      pointer-events: none;
    }
    .hf-caption-emoji-pop .emoji-pop-group {
      position: absolute; bottom: 0; left: 0; right: 0;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: ${Math.round(layout.gap * 0.5)}px; padding: 0 ${layout.sideInsetPct}%;
      font-family: ${ctx.fontFamily}; font-weight: 900; line-height: 1.1;
      text-shadow: 0 4px 16px rgba(0,0,0,0.5);
    }
    .hf-caption-emoji-pop .emoji-pop-line {
      display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: ${layout.gap + 2}px;
      white-space: nowrap;
    }
    .hf-caption-emoji-pop .emoji-pop-word {
      display: inline-block; transform-origin: 50% 80%;
    }
    .hf-caption-emoji-pop .emoji-pop-emoji {
      font-size: ${Math.round(timing.fontSize * 0.75)}px; line-height: 1;
      opacity: 0; transform: scale(0) translateY(10px);
    }
  `;

  const wordsJson = JSON.stringify(timing.words);
  const groupsJson = JSON.stringify(groups);
  const script = gsapTimelineScript(timing.timelineId, `
      var WORDS = ${wordsJson};
      var GROUPS = ${groupsJson};
      GROUPS.forEach(function(g, gi){
        var grp = document.getElementById('emoji-pop-grp-' + timelineId + '-' + gi);
        if(!grp) return;
        var wordEls = grp.querySelectorAll('.emoji-pop-word');
        var emojiEl = document.getElementById('emoji-pop-emoji-' + timelineId + '-' + gi);
        tl.set(grp, { visibility: 'visible' }, g.start);
        tl.fromTo(grp, { opacity: 0, scaleX: 0.6 }, { opacity: 1, scaleX: 1, duration: 0.24, ease: 'back.out(1.6)' }, g.start);
        if(emojiEl) tl.fromTo(emojiEl, { opacity: 0, scale: 0, y: 10 }, { opacity: 1, scale: 1, y: 0, duration: 0.22, ease: 'back.out(2)' }, g.start + 0.05);
        wordEls.forEach(function(el, idx){
          var wi = g.wordStart + idx;
          var w = WORDS[wi];
          tl.fromTo(el, { opacity: 0, scale: 0.4, y: 16 }, { opacity: 1, scale: 1, y: 0, duration: 0.18, ease: 'back.out(2)' }, w.start);
          tl.to(el, { scale: 1.05, duration: 0.08 }, w.end - 0.08);
          tl.to(el, { scale: 1, duration: 0.08 }, w.end);
        });
        tl.to(grp, { opacity: 0, duration: 0.1 }, g.end - 0.1);
        tl.set(grp, { visibility: 'hidden' }, g.end);
      });
  `);

  return { html, css, script, timelineId: timing.timelineId, requiresGsap: binding?.requiresGsap ?? true };
}

export function renderCaptionGlitchRgbClip(ctx: HfCaptionRenderContext): HfCaptionClipOutput {
  const binding = getHfStyleBinding(ctx.styleId);
  const timing = buildCaptionTiming(ctx, 'caption-glitch-rgb');
  const visibleEnd = timing.visibleStart + timing.visibleDuration;
  const groups = groupCaptionWordsIntoLines(timing.words, visibleEnd, 14);
  const emphasis = new Set((ctx.emphasisWords || []).map((w) => w.toLowerCase()));

  const { layout } = timing;
  const groupHtml = groups.map((g, gi) => {
    const groupWords = timing.words.slice(g.wordStart, g.wordEnd + 1);
    const wordSpans = groupWords.map((w, i) => {
      const wi = g.wordStart + i;
      const emphasized = phraseContainsEmphasis(w.text, emphasis);
      const color = emphasized ? ctx.accentColor : ctx.textColor;
      return `<span class="glitch-word" id="glitch-w-${timing.timelineId}-${wi}" style="font-size:${timing.fontSize}px;color:${color};">${escapeHtml(w.text)}</span>`;
    }).join('');
    return `<div class="glitch-group" id="glitch-grp-${timing.timelineId}-${gi}" style="visibility:hidden;">${wordSpans}</div>`;
  }).join('');

  const html = wrapCaptionClip('caption-glitch-rgb', 'hf-caption-glitch', ctx, timing, `
      <div class="glitch-shell" id="glitch-shell-${timing.timelineId}" style="padding:0 ${layout.sideInsetPct}%;max-width:${layout.maxWidthPct}%;">
        <div class="glitch-scanlines" aria-hidden="true"></div>
        ${groupHtml}
      </div>`);

  const css = `
    .hf-caption-glitch .glitch-shell {
      display: flex; flex-direction: column; align-items: center; justify-content: flex-end;
      position: absolute; left: 0; right: 0; ${captionPositionStyle(ctx.position, ctx.canvasHeight)} height: 35%;
      pointer-events: none;
    }
    .hf-caption-glitch .glitch-scanlines {
      position: absolute; inset: 0; pointer-events: none; z-index: 5;
      background: repeating-linear-gradient(to bottom, transparent 0px, transparent 3px, rgba(0,0,0,0.16) 3px, rgba(0,0,0,0.16) 4px);
      opacity: 0.45;
    }
    .hf-caption-glitch .glitch-group {
      position: absolute; bottom: 0; left: 0; right: 0; z-index: 10;
      display: flex; flex-wrap: wrap; align-items: center; justify-content: center;
      gap: ${layout.gap + 2}px; padding: 0 ${layout.sideInsetPct}%;
      font-family: ${ctx.fontFamily}; font-weight: 800; line-height: 1.15;
      text-shadow: 0 4px 18px rgba(0,0,0,0.55);
    }
    .hf-caption-glitch .glitch-word {
      display: inline-block; position: relative;
    }
  `;

  const wordsJson = JSON.stringify(timing.words);
  const groupsJson = JSON.stringify(groups);
  const script = gsapTimelineScript(timing.timelineId, `
      var WORDS = ${wordsJson};
      var GROUPS = ${groupsJson};
      GROUPS.forEach(function(g, gi){
        var grp = document.getElementById('glitch-grp-' + timelineId + '-' + gi);
        if(!grp) return;
        var wordEls = grp.querySelectorAll('.glitch-word');
        tl.set(grp, { visibility: 'visible' }, g.start);
        tl.fromTo(grp, { opacity: 0 }, { opacity: 1, duration: 0.05 }, g.start);
        wordEls.forEach(function(el, idx){
          var wi = g.wordStart + idx;
          var w = WORDS[wi];
          tl.fromTo(el, { opacity: 0, x: -10 }, { opacity: 1, x: 0, duration: 0.12, ease: 'power2.out' }, w.start);
          tl.to(el, { textShadow: '-4px 0 0 rgba(255,0,0,0.8), 4px 0 0 rgba(0,255,255,0.8)', duration: 0.04, repeat: 3, yoyo: true }, w.start + 0.02);
          tl.to(el, { textShadow: '0 4px 18px rgba(0,0,0,0.55)', duration: 0.08 }, w.start + 0.14);
          tl.to(el, { opacity: 0, duration: 0.08 }, w.end);
        });
        tl.set(grp, { visibility: 'hidden' }, g.end);
      });
  `);

  return { html, css, script, timelineId: timing.timelineId, requiresGsap: binding?.requiresGsap ?? true };
}

export function renderCaptionKineticSlamClip(ctx: HfCaptionRenderContext): HfCaptionClipOutput {
  const binding = getHfStyleBinding(ctx.styleId);
  const timing = buildCaptionTiming(ctx, 'caption-kinetic-slam');
  const visibleEnd = timing.visibleStart + timing.visibleDuration;
  const groups = groupCaptionWordsIntoLines(timing.words, visibleEnd, 4);
  const emphasis = new Set((ctx.emphasisWords || []).map((w) => w.toLowerCase()));
  const wordToGroupIndex = new Map<number, number>();
  groups.forEach((g, gi) => {
    for (let i = g.wordStart; i <= g.wordEnd; i++) wordToGroupIndex.set(i, gi);
  });
  const groupHasEmphasis = groups.map((g) =>
    phraseContainsEmphasis(timing.words.slice(g.wordStart, g.wordEnd + 1).map((w) => w.text).join(''), emphasis),
  );

  const wordHtml = timing.words.map((w, wi) => {
    const gi = wordToGroupIndex.get(wi) ?? -1;
    const emphasized = gi >= 0 && groupHasEmphasis[gi];
    const color = emphasized ? ctx.accentColor : ctx.textColor;
    return `<div class="knt-word" id="knt-w-${timing.timelineId}-${wi}" style="color:${color};font-size:${timing.fontSize}px;">${escapeHtml(w.text)}</div>`;
  }).join('');

  const html = wrapCaptionClip('caption-kinetic-slam', 'hf-caption-kinetic', ctx, timing, `
      <div class="knt-shell" id="knt-shell-${timing.timelineId}">
        ${wordHtml}
      </div>`);

  const css = `
    .hf-caption-kinetic.clip {
      inset: 0 !important; top: 0 !important; bottom: 0 !important; transform: none !important;
      display: flex; align-items: center; justify-content: center;
    }
    .hf-caption-kinetic .knt-shell {
      position: relative; width: 100%; text-align: center;
    }
    .hf-caption-kinetic .knt-word {
      position: absolute; left: 0; width: 100%; text-align: center; top: 50%;
      font-family: ${ctx.fontFamily}; font-weight: 900; line-height: 1; letter-spacing: 0.02em;
      text-shadow: 0 6px 24px rgba(0,0,0,0.55); opacity: 0; visibility: hidden;
      transform: translateY(-50%);
    }
  `;

  const wordsJson = JSON.stringify(timing.words);
  const groupsJson = JSON.stringify(groups);
  const script = gsapTimelineScript(timing.timelineId, `
      var WORDS = ${wordsJson};
      var GROUPS = ${groupsJson};
      GROUPS.forEach(function(g, gi){
        var groupWords = WORDS.slice(g.wordStart, g.wordEnd + 1);
        groupWords.forEach(function(w, idx){
          var wi = g.wordStart + idx;
          var el = document.getElementById('knt-w-' + timelineId + '-' + wi);
          if(!el) return;
          var mode = wi % 4;
          tl.set(el, { visibility: 'visible' }, w.start);
          if(mode === 0){
            tl.fromTo(el, { y: -120, opacity: 0 }, { y: 0, opacity: 1, duration: 0.22, ease: 'back.out(1.7)' }, w.start);
          } else if(mode === 1){
            tl.fromTo(el, { x: -300, opacity: 0 }, { x: 0, opacity: 1, duration: 0.2, ease: 'expo.out' }, w.start);
          } else if(mode === 2){
            tl.fromTo(el, { x: 300, opacity: 0 }, { x: 0, opacity: 1, duration: 0.2, ease: 'expo.out' }, w.start);
          } else {
            tl.fromTo(el, { scale: 0.4, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.24, ease: 'back.out(2.2)' }, w.start);
          }
          tl.to(el, { opacity: 0, duration: 0.12, ease: 'power2.in' }, w.end);
          tl.set(el, { visibility: 'hidden' }, w.end + 0.12);
        });
      });
  `);

  return { html, css, script, timelineId: timing.timelineId, requiresGsap: binding?.requiresGsap ?? true };
}

export function renderCaptionNeonAccentClip(ctx: HfCaptionRenderContext): HfCaptionClipOutput {
  const binding = getHfStyleBinding(ctx.styleId);
  const timing = buildCaptionTiming(ctx, 'caption-neon-accent');
  const visibleEnd = timing.visibleStart + timing.visibleDuration;
  const groups = groupCaptionWordsIntoLines(timing.words, visibleEnd, 14);
  const emphasis = new Set((ctx.emphasisWords || []).map((w) => w.toLowerCase()));
  const accentPalette = [ctx.accentColor, shadeColor(ctx.accentColor, 0.25), shadeColor(ctx.accentColor, -0.25)];

  const { layout } = timing;
  const groupHtml = groups.map((g, gi) => {
    const groupWords = timing.words.slice(g.wordStart, g.wordEnd + 1);
    const wordSpans = groupWords.map((w, i) => {
      const wi = g.wordStart + i;
      const emphasized = phraseContainsEmphasis(w.text, emphasis);
      const color = emphasized ? accentPalette[wi % accentPalette.length] : ctx.textColor;
      return `<span class="nacc-word ${emphasized ? 'nacc-word--accent' : ''}" id="nacc-w-${timing.timelineId}-${wi}" style="font-size:${emphasized ? Math.round(timing.fontSize * 1.12) : timing.fontSize}px;color:${color};">${escapeHtml(w.text)}</span>`;
    }).join('');
    return `<div class="nacc-group" id="nacc-grp-${timing.timelineId}-${gi}" style="visibility:hidden;">${wordSpans}</div>`;
  }).join('');

  const html = wrapCaptionClip('caption-neon-accent', 'hf-caption-neon-accent', ctx, timing, `
      <div class="nacc-shell" id="nacc-shell-${timing.timelineId}" style="padding:0 ${layout.sideInsetPct}%;max-width:${layout.maxWidthPct}%;">
        ${groupHtml}
      </div>`);

  const css = `
    .hf-caption-neon-accent .nacc-shell {
      display: flex; flex-direction: column; align-items: center; justify-content: flex-end;
      position: absolute; left: 0; right: 0; ${captionPositionStyle(ctx.position, ctx.canvasHeight)} height: 35%;
      pointer-events: none;
    }
    .hf-caption-neon-accent .nacc-group {
      position: absolute; bottom: 0; left: 0; right: 0;
      display: flex; flex-wrap: wrap; align-items: center; justify-content: center;
      gap: ${layout.gap + 4}px; padding: 0 ${layout.sideInsetPct}%;
      font-family: ${ctx.fontFamily}; font-weight: 900; line-height: 1.1;
    }
    .hf-caption-neon-accent .nacc-word {
      display: inline-block; text-shadow: 0 0 8px currentColor, 0 0 18px currentColor;
    }
    .hf-caption-neon-accent .nacc-word--accent {
      text-shadow: 0 0 10px currentColor, 0 0 24px currentColor, 0 0 40px currentColor;
    }
  `;

  const wordsJson = JSON.stringify(timing.words);
  const groupsJson = JSON.stringify(groups);
  const script = gsapTimelineScript(timing.timelineId, `
      var WORDS = ${wordsJson};
      var GROUPS = ${groupsJson};
      GROUPS.forEach(function(g, gi){
        var grp = document.getElementById('nacc-grp-' + timelineId + '-' + gi);
        if(!grp) return;
        var wordEls = grp.querySelectorAll('.nacc-word');
        tl.set(grp, { visibility: 'visible' }, g.start);
        tl.fromTo(grp, { opacity: 0 }, { opacity: 1, duration: 0.15, ease: 'power2.out' }, g.start);
        wordEls.forEach(function(el, idx){
          var wi = g.wordStart + idx;
          var w = WORDS[wi];
          tl.fromTo(el, { opacity: 0, y: 20, scale: 0.85 }, { opacity: 1, y: 0, scale: 1, duration: 0.22, ease: 'back.out(2)' }, w.start);
          if(el.classList.contains('nacc-word--accent')){
            tl.to(el, { x: '+=6', y: '+=4', duration: 0.06, repeat: 5, yoyo: true, ease: 'sine.inOut' }, w.start + 0.15);
          }
          tl.to(el, { opacity: 0, duration: 0.1 }, w.end);
        });
        tl.set(grp, { visibility: 'hidden' }, g.end);
      });
  `);

  return { html, css, script, timelineId: timing.timelineId, requiresGsap: binding?.requiresGsap ?? true };
}

export function renderCaptionParallaxLayersClip(ctx: HfCaptionRenderContext): HfCaptionClipOutput {
  const binding = getHfStyleBinding(ctx.styleId);
  const timing = buildCaptionTiming(ctx, 'caption-parallax-layers');
  const visibleEnd = timing.visibleStart + timing.visibleDuration;
  const groups = groupCaptionWordsIntoLines(timing.words, visibleEnd, 14);
  const emphasis = new Set((ctx.emphasisWords || []).map((w) => w.toLowerCase()));

  const { layout } = timing;
  const groupHtml = groups.map((g, gi) => {
    const groupWords = timing.words.slice(g.wordStart, g.wordEnd + 1);
    const text = groupWords.map((w) => escapeHtml(w.text)).join('');
    return `<div class="plx-group" id="plx-grp-${timing.timelineId}-${gi}" style="visibility:hidden;">
        <div class="plx-behind" id="plx-behind-${timing.timelineId}-${gi}" style="color:${ctx.accentColor};font-size:${Math.round(timing.fontSize * 1.4)}px;">${text}</div>
        <div class="plx-front" id="plx-front-${timing.timelineId}-${gi}" style="color:${ctx.textColor};font-size:${timing.fontSize}px;">${text}</div>
      </div>`;
  }).join('');

  const html = wrapCaptionClip('caption-parallax-layers', 'hf-caption-parallax', ctx, timing, `
      <div class="plx-shell" id="plx-shell-${timing.timelineId}" style="padding:0 ${layout.sideInsetPct}%;max-width:${layout.maxWidthPct}%;">
        ${groupHtml}
      </div>`);

  const css = `
    .hf-caption-parallax .plx-shell {
      display: flex; flex-direction: column; align-items: center; justify-content: flex-end;
      position: absolute; left: 0; right: 0; ${captionPositionStyle(ctx.position, ctx.canvasHeight)} height: 35%;
      pointer-events: none;
    }
    .hf-caption-parallax .plx-group {
      position: absolute; bottom: 0; left: 0; right: 0;
      display: flex; align-items: center; justify-content: center;
      font-family: ${ctx.fontFamily}; font-weight: 800; line-height: 1.1;
    }
    .hf-caption-parallax .plx-behind {
      position: absolute; left: 0; width: 100%; text-align: center; z-index: 1;
      transform: scaleY(2.4); transform-origin: 50% 100%;
      opacity: 0.35; text-shadow: 2px 4px 4px ${shadeColor(ctx.accentColor, -0.2)};
    }
    .hf-caption-parallax .plx-front {
      position: relative; z-index: 2; text-align: center;
      text-shadow: 0 4px 18px rgba(0,0,0,0.55);
    }
  `;

  const wordsJson = JSON.stringify(timing.words);
  const groupsJson = JSON.stringify(groups);
  const script = gsapTimelineScript(timing.timelineId, `
      var WORDS = ${wordsJson};
      var GROUPS = ${groupsJson};
      GROUPS.forEach(function(g, gi){
        var grp = document.getElementById('plx-grp-' + timelineId + '-' + gi);
        var behind = document.getElementById('plx-behind-' + timelineId + '-' + gi);
        var front = document.getElementById('plx-front-' + timelineId + '-' + gi);
        if(!grp || !front) return;
        tl.set(grp, { visibility: 'visible' }, g.start);
        tl.fromTo(front, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.28, ease: 'power2.out' }, g.start);
        if(behind) tl.fromTo(behind, { opacity: 0, scaleY: 3.2 }, { opacity: 0.35, scaleY: 2.4, duration: 0.32, ease: 'power2.out' }, g.start);
        tl.to(front, { opacity: 0, duration: 0.12 }, g.end - 0.12);
        if(behind) tl.to(behind, { opacity: 0, duration: 0.12 }, g.end - 0.12);
        tl.set(grp, { visibility: 'hidden' }, g.end);
      });
  `);

  return { html, css, script, timelineId: timing.timelineId, requiresGsap: binding?.requiresGsap ?? true };
}

export function renderCaptionParticleBurstClip(ctx: HfCaptionRenderContext): HfCaptionClipOutput {
  const binding = getHfStyleBinding(ctx.styleId);
  const timing = buildCaptionTiming(ctx, 'caption-particle-burst');
  const visibleEnd = timing.visibleStart + timing.visibleDuration;
  const groups = groupCaptionWordsIntoLines(timing.words, visibleEnd, 14);
  const emphasis = new Set((ctx.emphasisWords || []).map((w) => w.toLowerCase()));
  const particleColors = [ctx.accentColor, shadeColor(ctx.accentColor, 0.2), shadeColor(ctx.accentColor, -0.2), '#ffffff'];

  const { layout } = timing;
  const groupHtml = groups.map((g, gi) => {
    const groupWords = timing.words.slice(g.wordStart, g.wordEnd + 1);
    const wordSpans = groupWords.map((w, i) => {
      const wi = g.wordStart + i;
      const emphasized = phraseContainsEmphasis(w.text, emphasis);
      const color = emphasized ? ctx.accentColor : 'rgba(255,255,255,0.55)';
      return `<span class="ptb-word ${emphasized ? 'ptb-word--emph' : ''}" id="ptb-w-${timing.timelineId}-${wi}" style="font-size:${timing.fontSize}px;color:${color};">${escapeHtml(w.text)}</span>`;
    }).join('');
    return `<div class="ptb-group" id="ptb-grp-${timing.timelineId}-${gi}" style="visibility:hidden;">${wordSpans}</div>`;
  }).join('');

  const html = wrapCaptionClip('caption-particle-burst', 'hf-caption-particle', ctx, timing, `
      <div class="ptb-shell" id="ptb-shell-${timing.timelineId}" style="padding:0 ${layout.sideInsetPct}%;max-width:${layout.maxWidthPct}%;">
        ${groupHtml}
      </div>`);

  const css = `
    .hf-caption-particle .ptb-shell {
      display: flex; flex-direction: column; align-items: center; justify-content: flex-end;
      position: absolute; left: 0; right: 0; ${captionPositionStyle(ctx.position, ctx.canvasHeight)} height: 35%;
      pointer-events: none;
    }
    .hf-caption-particle .ptb-group {
      position: absolute; bottom: 0; left: 0; right: 0;
      display: flex; flex-wrap: wrap; align-items: center; justify-content: center;
      gap: ${layout.gap + 4}px; padding: 0 ${layout.sideInsetPct}%;
      font-family: ${ctx.fontFamily}; font-weight: 900; line-height: 1.1;
    }
    .hf-caption-particle .ptb-word {
      display: inline-block; position: relative;
    }
    .hf-caption-particle .ptb-particle {
      position: absolute; width: 8px; height: 8px; border-radius: 50%; pointer-events: none; z-index: 20;
      opacity: 0;
    }
  `;

  const wordsJson = JSON.stringify(timing.words);
  const groupsJson = JSON.stringify(groups);
  const colorsJson = JSON.stringify(particleColors);
  const script = gsapTimelineScript(timing.timelineId, `
      var WORDS = ${wordsJson};
      var GROUPS = ${groupsJson};
      var PARTICLE_COLORS = ${colorsJson};
      GROUPS.forEach(function(g, gi){
        var grp = document.getElementById('ptb-grp-' + timelineId + '-' + gi);
        if(!grp) return;
        var wordEls = grp.querySelectorAll('.ptb-word');
        tl.set(grp, { visibility: 'visible' }, g.start);
        tl.fromTo(grp, { opacity: 0 }, { opacity: 1, duration: 0.12, ease: 'power2.out' }, g.start);
        wordEls.forEach(function(el, idx){
          var wi = g.wordStart + idx;
          var w = WORDS[wi];
          tl.fromTo(el, { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1, duration: 0.18, ease: 'back.out(1.6)' }, w.start);
          if(el.classList.contains('ptb-word--emph')){
            for(var p=0; p<10; p++){
              var particle = document.createElement('div');
              particle.className = 'ptb-particle';
              particle.style.backgroundColor = PARTICLE_COLORS[p % PARTICLE_COLORS.length];
              particle.style.left = '50%';
              particle.style.top = '50%';
              el.appendChild(particle);
              var angle = (p / 10) * Math.PI * 2;
              var dist = 40 + Math.random() * 30;
              tl.set(particle, { opacity: 1, scale: 1, x: 0, y: 0 }, w.start);
              tl.to(particle, { opacity: 0, x: Math.cos(angle) * dist, y: Math.sin(angle) * dist, scale: 0, duration: 0.4, ease: 'power2.out' }, w.start);
            }
          }
          tl.to(el, { opacity: 0, duration: 0.1 }, w.end);
        });
        tl.set(grp, { visibility: 'hidden' }, g.end);
      });
  `);

  return { html, css, script, timelineId: timing.timelineId, requiresGsap: binding?.requiresGsap ?? true };
}

export function renderCaptionTextureClip(ctx: HfCaptionRenderContext): HfCaptionClipOutput {
  const binding = getHfStyleBinding(ctx.styleId);
  const timing = buildCaptionTiming(ctx, 'caption-texture');
  const visibleEnd = timing.visibleStart + timing.visibleDuration;
  const groups = groupCaptionWordsIntoLines(timing.words, visibleEnd, 4);
  const emphasis = new Set((ctx.emphasisWords || []).map((w) => w.toLowerCase()));
  const textureUrl = 'compositions/components/lava.png';
  const wordToGroupIndex = new Map<number, number>();
  groups.forEach((g, gi) => {
    for (let i = g.wordStart; i <= g.wordEnd; i++) wordToGroupIndex.set(i, gi);
  });
  const groupHasEmphasis = groups.map((g) =>
    phraseContainsEmphasis(timing.words.slice(g.wordStart, g.wordEnd + 1).map((w) => w.text).join(''), emphasis),
  );

  const wordHtml = timing.words.map((w, wi) => {
    const gi = wordToGroupIndex.get(wi) ?? -1;
    const emphasized = gi >= 0 && groupHasEmphasis[gi];
    const color = emphasized ? ctx.accentColor : '#ffd0a0';
    return `<div class="tx-shadow" id="tx-shadow-${timing.timelineId}-${wi}" style="visibility:hidden;">
        <div class="tx-word hf-texture-text tx-texture-override" id="tx-word-${timing.timelineId}-${wi}" style="color:${color};font-size:${timing.fontSize}px;">${escapeHtml(w.text)}</div>
      </div>`;
  }).join('');

  const html = wrapCaptionClip('caption-texture', 'hf-caption-texture', ctx, timing, `
      <div class="tx-shell" id="tx-shell-${timing.timelineId}">
        ${wordHtml}
      </div>`);

  const css = `
    .hf-caption-texture.clip {
      inset: 0 !important; top: 0 !important; bottom: 0 !important; transform: none !important;
      display: flex; align-items: center; justify-content: center;
    }
    .hf-caption-texture .tx-shell {
      position: relative; width: 100%; text-align: center;
    }
    .hf-caption-texture .tx-shadow {
      position: absolute; left: 0; width: 100%; text-align: center; top: 50%;
      filter: drop-shadow(0 4px 24px ${shadeColor(ctx.accentColor, -0.1)});
      transform: translateY(-50%);
    }
    .hf-caption-texture .tx-word {
      font-family: ${ctx.fontFamily}; font-weight: 900; line-height: 1; letter-spacing: 0.02em;
      display: inline-block;
      -webkit-mask-size: 200% 200%; mask-size: 200% 200%;
      -webkit-mask-position: 0% 50%; mask-position: 0% 50%;
      -webkit-mask-mode: luminance; mask-mode: luminance;
      filter: contrast(1.2);
    }
  `;

  const wordsJson = JSON.stringify(timing.words);
  const groupsJson = JSON.stringify(groups);
  const script = gsapTimelineScript(timing.timelineId, `
      var WORDS = ${wordsJson};
      var GROUPS = ${groupsJson};
      var TEXTURE_URL = '${textureUrl}';
      GROUPS.forEach(function(g, gi){
        var groupWords = WORDS.slice(g.wordStart, g.wordEnd + 1);
        groupWords.forEach(function(w, idx){
          var wi = g.wordStart + idx;
          var shadow = document.getElementById('tx-shadow-' + timelineId + '-' + wi);
          var wordEl = document.getElementById('tx-word-' + timelineId + '-' + wi);
          if(!shadow || !wordEl) return;
          wordEl.style.webkitMaskImage = "url('" + TEXTURE_URL + "')";
          wordEl.style.maskImage = "url('" + TEXTURE_URL + "')";
          tl.set(shadow, { visibility: 'visible' }, w.start);
          tl.fromTo(wordEl, { opacity: 0, scale: 0.85 }, { opacity: 1, scale: 1, duration: 0.28, ease: 'power2.out' }, w.start);
          tl.fromTo(wordEl, { maskPosition: '0% 50%', webkitMaskPosition: '0% 50%' }, { maskPosition: '100% 50%', webkitMaskPosition: '100% 50%', duration: 1.2, ease: 'none' }, w.start);
          tl.to(wordEl, { opacity: 0, duration: 0.15 }, w.end);
          tl.set(shadow, { visibility: 'hidden' }, w.end + 0.15);
        });
      });
  `);

  return { html, css, script, timelineId: timing.timelineId, requiresGsap: binding?.requiresGsap ?? true };
}

export function renderCaptionWeightShiftClip(ctx: HfCaptionRenderContext): HfCaptionClipOutput {
  const binding = getHfStyleBinding(ctx.styleId);
  const timing = buildCaptionTiming(ctx, 'caption-weight-shift');
  const visibleEnd = timing.visibleStart + timing.visibleDuration;
  const groups = groupCaptionWordsIntoLines(timing.words, visibleEnd, 14);
  const emphasis = new Set((ctx.emphasisWords || []).map((w) => w.toLowerCase()));

  const { layout } = timing;
  const groupHtml = groups.map((g, gi) => {
    const groupWords = timing.words.slice(g.wordStart, g.wordEnd + 1);
    const wordSpans = groupWords.map((w, i) => {
      const wi = g.wordStart + i;
      const emphasized = phraseContainsEmphasis(w.text, emphasis);
      return `<span class="wgt-word ${emphasized ? 'wgt-word--emph' : ''}" id="wgt-w-${timing.timelineId}-${wi}" style="font-size:${timing.fontSize}px;color:${ctx.textColor};">${escapeHtml(w.text)}</span>`;
    }).join('');
    return `<div class="wgt-group" id="wgt-grp-${timing.timelineId}-${gi}" style="visibility:hidden;">${wordSpans}</div>`;
  }).join('');

  const html = wrapCaptionClip('caption-weight-shift', 'hf-caption-weight', ctx, timing, `
      <div class="wgt-shell" id="wgt-shell-${timing.timelineId}" style="padding:0 ${layout.sideInsetPct}%;max-width:${layout.maxWidthPct}%;">
        ${groupHtml}
      </div>`);

  const css = `
    .hf-caption-weight .wgt-shell {
      display: flex; flex-direction: column; align-items: center; justify-content: flex-end;
      position: absolute; left: 0; right: 0; ${captionPositionStyle(ctx.position, ctx.canvasHeight)} height: 35%;
      pointer-events: none;
    }
    .hf-caption-weight .wgt-group {
      position: absolute; bottom: 0; left: 0; right: 0;
      display: flex; flex-wrap: wrap; align-items: center; justify-content: center;
      gap: ${layout.gap + 2}px; padding: 0 ${layout.sideInsetPct}%;
      font-family: ${ctx.fontFamily}; font-weight: 300; line-height: 1.1;
      text-shadow: 0 2px 4px rgba(0,0,0,0.3);
    }
    .hf-caption-weight .wgt-word {
      display: inline-block;
    }
  `;

  const wordsJson = JSON.stringify(timing.words);
  const groupsJson = JSON.stringify(groups);
  const script = gsapTimelineScript(timing.timelineId, `
      var WORDS = ${wordsJson};
      var GROUPS = ${groupsJson};
      GROUPS.forEach(function(g, gi){
        var grp = document.getElementById('wgt-grp-' + timelineId + '-' + gi);
        if(!grp) return;
        var wordEls = grp.querySelectorAll('.wgt-word');
        tl.set(grp, { visibility: 'visible' }, g.start);
        tl.fromTo(grp, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.18, ease: 'power2.out' }, g.start);
        wordEls.forEach(function(el, idx){
          var wi = g.wordStart + idx;
          var w = WORDS[wi];
          tl.fromTo(el, { opacity: 0.35, fontWeight: 300 }, { opacity: 1, fontWeight: 700, duration: 0.12, ease: 'power2.out' }, w.start);
          tl.to(el, { opacity: 0.35, fontWeight: 300, duration: 0.18, ease: 'power2.inOut' }, w.end);
        });
        tl.to(grp, { opacity: 0, duration: 0.1 }, g.end - 0.1);
        tl.set(grp, { visibility: 'hidden' }, g.end);
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
  'caption-pop-bounce': renderCaptionPopClip,
  'caption-stagger-slide': renderCaptionStaggerClip,
  'caption-clip-wipe': renderCaptionClipWipeClip,
  'caption-matrix-decode': renderCaptionMatrixDecodeClip,
  'caption-emoji-pop': renderCaptionEmojiPopClip,
  'caption-glitch-rgb': renderCaptionGlitchRgbClip,
  'caption-kinetic-slam': renderCaptionKineticSlamClip,
  'caption-neon-accent': renderCaptionNeonAccentClip,
  'caption-parallax-layers': renderCaptionParallaxLayersClip,
  'caption-particle-burst': renderCaptionParticleBurstClip,
  'caption-texture': renderCaptionTextureClip,
  'caption-weight-shift': renderCaptionWeightShiftClip,
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