/** Adapt HF caption components to guide DSL clip model (segment text + brand tokens). */

import { getHfStyleBinding } from './hfStyleRegistry.js';

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
}

export interface HfCaptionClipOutput {
  html: string;
  css: string;
  script: string;
  timelineId: string;
  requiresGsap: boolean;
}

interface CaptionWord {
  text: string;
  start: number;
  end: number;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeJsString(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
}

/** Split narration into timed words — CJK by char, Latin by whitespace. */
export function splitCaptionWords(text: string): string[] {
  const trimmed = String(text || '').trim();
  if (!trimmed) return [];
  if (/[\u4e00-\u9fff]/.test(trimmed)) {
    const parts = trimmed.split(/(?<=[，。！？、；：,.!?])/g).map((p) => p.trim()).filter(Boolean);
    if (parts.length > 1) return parts;
    return Array.from(trimmed).filter((ch) => !/\s/.test(ch));
  }
  return trimmed.split(/\s+/).filter(Boolean);
}

/** Evenly distribute words across the visible caption window. */
export function buildCaptionWordTimings(words: string[], windowStart: number, windowDuration: number): CaptionWord[] {
  if (!words.length) return [];
  const slice = Math.max(0.05, windowDuration / words.length);
  return words.map((text, index) => {
    const start = windowStart + index * slice;
    const end = start + slice * 0.85;
    return { text, start, end };
  });
}

function captionPositionStyle(position: string, canvasHeight: number): string {
  const bottomOffset = Math.round(canvasHeight * 0.12);
  if (position === 'top') return `top:${Math.round(canvasHeight * 0.08)}px;bottom:auto;`;
  if (position === 'center') return `top:50%;bottom:auto;transform:translateY(-50%);`;
  return `bottom:${bottomOffset}px;top:auto;`;
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

/**
 * Guide-native adapter for registry `caption-highlight`.
 * Generates clip HTML + GSAP timeline instead of embedding the static 1920×1080 component file.
 */
export function renderCaptionHighlightClip(ctx: HfCaptionRenderContext): HfCaptionClipOutput {
  const binding = getHfStyleBinding(ctx.styleId);
  const timelineId = `caption-highlight-${ctx.segmentId}`;
  const visibleStart = 0.25;
  const visibleDuration = Math.max(0.4, ctx.clipDuration - 0.35);
  const words = buildCaptionWordTimings(
    splitCaptionWords(ctx.text),
    visibleStart,
    visibleDuration,
  );
  const groups = groupWordsForHighlight(words);
  const emphasis = new Set((ctx.emphasisWords || []).map((w) => w.toLowerCase()));
  const posStyle = captionPositionStyle(ctx.position, ctx.canvasHeight);
  const baseFontSize = Math.max(28, Math.min(96, Math.round(ctx.fontSizePx * 0.9)));

  const wordHtml = words.map((w, wi) => {
    const emphasized = emphasis.has(w.text.toLowerCase()) || emphasis.has(w.text);
    const bg = emphasized ? ctx.accentColor : `linear-gradient(135deg, ${ctx.accentColor} 0%, ${shadeColor(ctx.accentColor, -0.12)} 100%)`;
    return `<span class="hl-word" id="hl-w-${timelineId}-${wi}" style="font-size:${baseFontSize}px;color:${ctx.textColor};">
      <span class="hl-word-bg" id="hl-bg-${timelineId}-${wi}" style="background:${bg};"></span>
      <span class="hl-word-text">${escapeHtml(w.text)}</span>
    </span>`;
  }).join('');

  const html = `
    <div class="clip hf-caption hf-caption-highlight" data-hf-component="caption-highlight"
         data-start="${ctx.clipStart + visibleStart}" data-duration="${visibleDuration}" data-track-index="2"
         data-timeline-id="${timelineId}"
         style="position:absolute;left:0;right:0;${posStyle}display:flex;justify-content:center;pointer-events:none;z-index:12;">
      <div class="hl-group" id="hl-grp-${timelineId}" style="display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:center;gap:8px;padding:0 5%;max-width:100%;opacity:0;visibility:hidden;">
        ${wordHtml}
      </div>
    </div>`;

  const css = `
    .hf-caption-highlight .hl-word {
      font-family: ${ctx.fontFamily}, 'PingFang SC', 'Microsoft YaHei', sans-serif;
      font-weight: 800;
      display: inline-block;
      line-height: 1.1;
      position: relative;
      padding: 6px 12px 8px;
      text-shadow: 0 6px 18px rgba(0,0,0,0.45);
      transform-origin: 50% 58%;
    }
    .hf-caption-highlight .hl-word-bg {
      position: absolute;
      inset: 0;
      border-radius: 10px;
      box-shadow: 0 12px 30px rgba(0,0,0,0.22);
      opacity: 0;
      transform: scaleX(0);
      transform-origin: 0% 50%;
      z-index: -1;
    }
    .hf-caption-highlight .hl-word-text { position: relative; z-index: 1; }
  `;

  const wordsJson = JSON.stringify(words);
  const groupsJson = JSON.stringify(groups);
  const script = `
    (function(){
      if (typeof gsap === 'undefined') return;
      window.__timelines = window.__timelines || {};
      var WORDS = ${wordsJson};
      var GROUPS = ${groupsJson};
      var timelineId = '${timelineId}';
      var grp = document.getElementById('hl-grp-' + timelineId);
      if (!grp) return;
      var tl = gsap.timeline({ paused: true });
      GROUPS.forEach(function(g, gi) {
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
      tl.seek(0);
      window.__timelines[timelineId] = tl;
    })();
  `;

  return {
    html,
    css,
    script,
    timelineId,
    requiresGsap: binding?.requiresGsap ?? true,
  };
}

function shadeColor(hex: string, amount: number): string {
  const normalized = String(hex || '#ff1745').replace('#', '');
  if (normalized.length !== 6) return hex || '#ff1745';
  const num = parseInt(normalized, 16);
  const r = Math.min(255, Math.max(0, ((num >> 16) & 0xff) + Math.round(255 * amount)));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + Math.round(255 * amount)));
  const b = Math.min(255, Math.max(0, (num & 0xff) + Math.round(255 * amount)));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

export function renderHfCaptionClip(ctx: HfCaptionRenderContext): HfCaptionClipOutput | null {
  const binding = getHfStyleBinding(ctx.styleId);
  if (!binding || binding.slot !== 'subtitle') return null;
  if (binding.hfName === 'caption-highlight') {
    return renderCaptionHighlightClip(ctx);
  }
  return null;
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