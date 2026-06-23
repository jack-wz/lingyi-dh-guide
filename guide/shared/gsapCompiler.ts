/* V5 GSAP Motion Skill compiler (#21).
 * Deterministic: takes a MotionSpec (LLM-structured) and emits a constrained GSAP
 * timeline snippet. The LLM NEVER emits arbitrary JS — the compiler only understands
 * a fixed animation vocabulary and emits from templates. Output runs inside a strict
 * sandbox iframe (CSP enforced by the editor preview container). */

import { judgeDeliveryMode, isDeliverableToVideo, type MotionDeliveryMode } from './types/motion.js';

export type GsapAnimationType =
  | 'title_text' | 'cta_button' | 'price_pop' | 'mouse_follow' | 'scroll_parallax' | 'product_highlight';

export interface MotionSpec {
  id: string;
  type: GsapAnimationType;
  description: string;
  durationMs: number;
  fps?: number;
  canvas: { width: number; height: number };
  interactive: boolean;
  reducedMotionFallback: boolean;
  elements: Array<{ id: string; animation: 'pop' | 'fadeUp' | 'twinkle' | 'follow' | 'parallax' | 'pulse'; fromMs: number; toMs: number }>;
}

export const SUPPORTED_GSAP_TYPES = new Set<GsapAnimationType>([
  'title_text', 'cta_button', 'price_pop', 'mouse_follow', 'scroll_parallax', 'product_highlight',
]);

export interface GsapCompileResult {
  code: string;             // GSAP timeline snippet (runs in sandbox iframe)
  deliveryMode: MotionDeliveryMode;
  deliverableToVideo: boolean;
  warnings: string[];
  blockers: string[];
}

export function validateSpec(spec: MotionSpec): { warnings: string[]; blockers: string[] } {
  const warnings: string[] = [];
  const blockers: string[] = [];
  if (!spec || typeof spec !== 'object') { blockers.push('spec is not an object'); return { warnings, blockers }; }
  if (!SUPPORTED_GSAP_TYPES.has(spec.type)) blockers.push(`unsupported gsap type: ${spec.type}`);
  if (!Number.isFinite(spec.durationMs) || spec.durationMs <= 0) blockers.push('durationMs must be > 0');
  if (!spec.canvas || !(Number.isFinite(spec.canvas.width) && spec.canvas.width > 0) || !(Number.isFinite(spec.canvas.height) && spec.canvas.height > 0)) blockers.push('canvas w/h required');
  for (const el of spec.elements || []) {
    if (!['pop', 'fadeUp', 'twinkle', 'follow', 'parallax', 'pulse'].includes(el.animation)) {
      blockers.push(`unsupported element animation: ${el.animation}`);
    }
    if (el.fromMs < 0 || el.toMs > spec.durationMs || el.fromMs >= el.toMs) {
      warnings.push(`element timing out of range: ${el.id} ${el.fromMs}-${el.toMs}`);
    }
  }
  // mouse_follow / scroll_parallax MUST be interactive_preview — never video_overlay.
  if ((spec.type === 'mouse_follow' || spec.type === 'scroll_parallax') && !spec.interactive) {
    blockers.push(`${spec.type} must be interactive=true`);
  }
  if (!spec.reducedMotionFallback) warnings.push('reduced-motion fallback recommended');
  return { warnings, blockers };
}

const TEMPLATES: Record<string, (el: MotionSpec['elements'][number]) => string> = {
  pop: (el) => `  tween#${el.id}.fromTo('.el-${el.id}', {scale:0, opacity:0}, {scale:1, opacity:1, duration:${((el.toMs - el.fromMs) / 1000).toFixed(2)}, ease:'back.out(2)'}, ${(el.fromMs / 1000).toFixed(2)});`,
  fadeUp: (el) => `  tween#${el.id}.fromTo('.el-${el.id}', {y:40, opacity:0}, {y:0, opacity:1, duration:${((el.toMs - el.fromMs) / 1000).toFixed(2)}, ease:'power2.out'}, ${(el.fromMs / 1000).toFixed(2)});`,
  twinkle: (el) => `  tween#${el.id}.to('.el-${el.id}', {opacity:0.2, duration:0.4, yoyo:true, repeat:1}, ${(el.fromMs / 1000).toFixed(2)});`,
  pulse: (el) => `  tween#${el.id}.to('.el-${el.id}', {scale:1.08, duration:0.5, yoyo:true, repeat:1, ease:'sine.inOut'}, ${(el.fromMs / 1000).toFixed(2)});`,
  follow: (el) => `  // mouse-follow bound at runtime to pointermove: .el-${el.id} via gsap.quickTo`,
  parallax: (el) => `  // scroll-parallax bound at runtime to scroll: .el-${el.id} y offset`,
};

export function compileGsap(spec: MotionSpec): GsapCompileResult {
  const v = validateSpec(spec);
  if (v.blockers.length) {
    return { code: '', deliveryMode: 'interactive_preview', deliverableToVideo: false, warnings: v.warnings, blockers: v.blockers };
  }
  const durationSec = (spec.durationMs / 1000).toFixed(2);
  const isExport = /web_code|export/i.test(spec.type) || /web|export/i.test(spec.description);
  const deliveryMode = judgeDeliveryMode(spec.type, spec.interactive || isExport);
  const deliverableToVideo = isDeliverableToVideo(deliveryMode);

  const lines = spec.elements
    .filter((e) => e.animation !== 'follow' && e.animation !== 'parallax')
    .map((e) => TEMPLATES[e.animation](e));
  const interactiveEls = spec.elements.filter((e) => e.animation === 'follow' || e.animation === 'parallax').map((e) => TEMPLATES[e.animation](e));

  const code = [
    `// Deterministic GSAP timeline — generated from MotionSpec (no arbitrary JS).`,
    `// spec.id=${spec.id} type=${spec.type} delivery=${deliveryMode} duration=${durationSec}s`,
    `(function(){`,
    `  const tl = gsap.timeline({ defaults: { ease: 'power2.out' }, paused: false });`,
    ...lines,
    ...(interactiveEls.length ? [`  // Interactive bindings (preview-only, not baked into video):`, ...interactiveEls] : []),
    ...(spec.reducedMotionFallback ? [`  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) { tl.timeScale(0); }`] : []),
    `  return tl;`,
    `})();`,
  ].join('\n');

  return { code, deliveryMode, deliverableToVideo, warnings: v.warnings, blockers: [] };
}

export const GSAP_CSP = "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self';";