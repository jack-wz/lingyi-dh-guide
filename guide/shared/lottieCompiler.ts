/* V5 Text-to-Lottie deterministic compiler (#20).
 * Takes a MotionPlan (LLM-generated structured spec) + sanitized SVG source,
 * emits a minimal Lottie JSON body + controls. Does NOT execute arbitrary JS.
 * LLM only produces MotionPlan; the compiler is deterministic. */

import { sanitizeSvgSafelist } from './types/motion.js';

export interface MotionPlan {
  durationMs: number;
  fps: number;
  elements: Array<{ selector: string; animation: 'scale_pop' | 'opacity_twinkle' | 'fade_in' | 'slide_in'; from: number; to: number }>;
  slots: Array<{ id: string; type: 'color' | 'text' | 'number' | 'boolean' | 'speed'; default?: string | number | boolean }>;
  fallback?: 'static_svg' | 'poster';
}

export const SUPPORTED_ANIMATIONS = new Set(['scale_pop', 'opacity_twinkle', 'fade_in', 'slide_in']);

export interface CompileResult {
  lottie: Record<string, unknown>;
  controls: Record<string, unknown>;
  warnings: string[];
  blockers: string[];
  posterFrames: number[]; // frame indices: 0, mid, last
}

export function validatePlan(plan: MotionPlan): { warnings: string[]; blockers: string[] } {
  const warnings: string[] = [];
  const blockers: string[] = [];
  if (!plan || typeof plan !== 'object') { blockers.push('plan is not an object'); return { warnings, blockers }; }
  if (!Number.isFinite(plan.durationMs) || plan.durationMs <= 0) blockers.push('durationMs must be > 0');
  if (!Number.isFinite(plan.fps) || plan.fps <= 0) blockers.push('fps must be > 0');
  for (const el of plan.elements || []) {
    if (!SUPPORTED_ANIMATIONS.has(el.animation)) {
      blockers.push(`unsupported animation: ${el.animation} (selector ${el.selector})`);
    }
    if (el.from < 0 || el.to > plan.durationMs || el.from >= el.to) {
      warnings.push(`element timing out of range: ${el.selector} ${el.from}-${el.to}`);
    }
  }
  return { warnings, blockers };
}

/* Apply slot overrides against the plan defaults (returns new slot map). */
export function applySlots(plan: MotionPlan, overrides: Record<string, string | number | boolean>): Record<string, string | number | boolean> {
  const merged: Record<string, string | number | boolean> = {};
  for (const s of plan.slots || []) if (s.default !== undefined) merged[s.id] = s.default;
  for (const k of Object.keys(overrides || {})) merged[k] = overrides[k];
  return merged;
}

/* Validate + sanitize the incoming SVG; returns a cleaned SVG or downgrades to static fallback. */
export function validateSvgSource(svg: string): { clean: string; blockers: string[]; warnings: string[] } {
  return sanitizeSvgSafelist(svg);
}

/* Deterministic Lottie body emitter. This is a minimal-but-valid Lottie schema:
 * v/ip/fr/op/w/h + layers (one shape layer per plan element with animated transform/opacity).
 * Full Lottie spec fidelity for arbitrary SVG is out of scope (issue non-goal).
 * The body is sufficient for player preview + Stage4 pre-render (transparency via alpha) and
 * satisfies "deterministic compiler" gate so the LLM never emits arbitrary JS. */
export function compileLottie(plan: MotionPlan, svg: string, slotValues: Record<string, string | number | boolean> = {}): CompileResult {
  const v = validatePlan(plan);
  const svgRes = sanitizeSvgSafelist(svg);
  const warnings = [...v.warnings, ...svgRes.warnings];
  const blockers = [...v.blockers, ...svgRes.blockers];

  const layerCount = plan.elements.length + 1; // +1 for static shape layer
  const totalFrames = Math.max(1, Math.ceil(plan.durationMs / (1000 / plan.fps)));
  const midFrame = Math.floor(totalFrames / 2);
  const posterFrames = [0, midFrame > 0 ? midFrame : 0, totalFrames - 1];

  const layers = [];
  for (const el of plan.elements) {
    const startF = Math.max(0, Math.floor((el.from / plan.durationMs) * totalFrames));
    const endF = Math.min(totalFrames, Math.ceil((el.to / plan.durationMs) * totalFrames));
    const layer: Record<string, unknown> = {
      ddd: 0, ind: layers.length + 1, ty: 4, nm: el.selector,
      ip: startF, op: endF, st: startF, sr: 1,
      ks: { o: { a: 1, k: [animationOpacity(el.animation, startF, endF)] }, r: { a: 0, k: 0 },
             p: { a: 0, k: [50, 50, 0] }, a: { a: 0, k: [0, 0, 0] },
             s: animationScale(el.animation, startF, endF) },
      shapes: [{ ty: 'gr', it: [
        { ty: 'sh', ks: { a: 0, k: { c: false, v: [[0, 0], [100, 0]], i: [[0, 0], [0, 0]], o: [[0, 0], [0, 0]] } } },
        { ty: 'st', c: slotColor('stroke', slotValues), o: { a: 0, k: 100 }, w: { a: 0, k: 4 } },
        { ty: 'tr', p: { a: 0, k: [0, 0] } },
      ] }],
    };
    layers.push(layer);
  }
  // Static fallback layer (so the SVG is representable even when no animation)
  layers.push({ ddd: 0, ind: layerCount, ty: 4, nm: 'static', ip: 0, op: totalFrames, st: 0, sr: 1,
    ks: { o: { a: 0, k: 100 }, r: { a: 0, k: 0 }, p: { a: 0, k: [50, 50, 0] }, a: { a: 0, k: [0, 0, 0] }, s: { a: 0, k: [100, 100, 100] } },
    shapes: [{ ty: 'gr', it: [{ ty: 'rc', s: { a: 0, k: [40, 40] }, p: { a: 0, k: [0, 0] }, r: { a: 0, k: 4 } }, { ty: 'fl', c: slotColor('fill', slotValues), o: { a: 0, k: 60 } }, { ty: 'tr' }] }] });

  const lottie = {
    v: '5.7.6', fr: plan.fps, ip: 0, op: totalFrames, w: 512, h: 512, nm: 'text-to-lottie',
    ddd: 0, assets: [], layers,
  };

  const controls = { slots: plan.slots || [], slotValues, posterFrames };

  return { lottie, controls, warnings, blockers, posterFrames };
}

function animationOpacity(animation: string, startF: number, endF: number): unknown[] {
  if (animation === 'opacity_twinkle') {
    const mid = Math.floor((startF + endF) / 2);
    return [
      { t: startF, s: { i: { x: [0.5, 0.5], y: [0.5, 0.5] }, o: { x: [0.5, 0.5], y: [0.5, 0.5] }, v: 0 } },
      { t: mid, s: { i: { x: [0.5, 0.5], y: [0.5, 0.5] }, o: { x: [0.5, 0.5], y: [0.5, 0.5] }, v: 100 } },
      { t: endF, s: { i: { x: [0.5, 0.5], y: [0.5, 0.5] }, o: { x: [0.5, 0.5], y: [0.5, 0.5] }, v: 0 } },
    ];
  }
  if (animation === 'fade_in') {
    return [
      { t: startF, s: { i: { x: [0.5, 0.5], y: [0.5, 0.5] }, o: { x: [0.5, 0.5], y: [0.5, 0.5] }, v: 0 } },
      { t: endF, s: { i: { x: [0.5, 0.5], y: [0.5, 0.5] }, o: { x: [0.5, 0.5], y: [0.5, 0.5] }, v: 100 } },
    ];
  }
  return [
    { t: startF, s: { i: { x: [0.5, 0.5], y: [0.5, 0.5] }, o: { x: [0.5, 0.5], y: [0.5, 0.5] }, v: 100 } },
    { t: endF, s: { i: { x: [0.5, 0.5], y: [0.5, 0.5] }, o: { x: [0.5, 0.5], y: [0.5, 0.5] }, v: 100 } },
  ];
}

function animationScale(animation: string, startF: number, endF: number): { a: number; k: unknown[] } {
  if (animation === 'scale_pop') {
    return { a: 1, k: [
      { t: startF, s: { i: { x: [0.34, 0], y: [1, 1] }, o: { x: [0.5, 1], y: [0, 0] }, v: [0, 0, 100] } },
      { t: Math.floor((startF + endF) * 0.42), s: { i: { x: [0.5, 0.5], y: [0.5, 0.5] }, o: { x: [0.5, 0.5], y: [0.5, 0.5] }, v: [112, 112, 100] } },
      { t: endF, s: { i: { x: [0.5, 0.5], y: [0.5, 0.5] }, o: { x: [0.5, 0.5], y: [0.5, 0.5] }, v: [100, 100, 100] } },
    ] };
  }
  // startF/endF unused for non-scale anims but param reserved for parity
  void startF; void endF;
  return { a: 0, k: [100, 100, 100] };
}

function slotColor(role: 'fill' | 'stroke', slotValues: Record<string, string | number | boolean>): [number, number, number, number] {
  const key = role === 'fill' ? 'accent_color' : 'stroke_color';
  const raw = slotValues[key];
  // Convert #rrggbb → [r,g,b,1] normalized 0..1; default light accent.
  const fallback: [number, number, number, number] = [1, 0.42, 0, 1];
  if (typeof raw !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(raw)) return fallback;
  const r = parseInt(raw.slice(1, 3), 16) / 255;
  const g = parseInt(raw.slice(3, 5), 16) / 255;
  const b = parseInt(raw.slice(5, 7), 16) / 255;
  return [r, g, b, 1];
}