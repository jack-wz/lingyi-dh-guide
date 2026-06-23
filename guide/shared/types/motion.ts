/* V5 Motion asset data model — shared between server, web and worker.
 * Additive-only; existing DSL/EditorObject fields unchanged.
 * See GitHub issue #19 for the design contract. */

export type MotionAssetKind = 'lottie' | 'gsap';
export type MotionDeliveryMode = 'video_overlay' | 'interactive_preview' | 'web_code';

export interface MotionSlot {
  id: string;
  type: 'color' | 'text' | 'number' | 'boolean' | 'speed' | 'size';
  label?: string;
  default?: string | number | boolean;
}

export interface MotionRecipe {
  durationMs: number;
  fps: number;
  elements: Array<{ selector: string; animation: string; from: number; to: number }>;
  fallback?: 'static_svg' | 'poster';
}

export interface MotionArtifact {
  sourceUrl: string;
  previewUrl?: string;
  webmUrl?: string;
  posterUrls?: string[];
  codeUrl?: string;
}

export interface MotionAssetManifest {
  version: 1;
  kind: MotionAssetKind;
  sourceAssetIds: string[];
  prompt: string;
  durationMs: number;
  fps: number;
  canvas: { width: number; height: number };
  slots: MotionSlot[];
  recipe?: MotionRecipe;
  compatibility: { supported: string[]; warnings: string[]; blockers: string[] };
  artifacts: MotionArtifact;
  deliveryMode: MotionDeliveryMode;
}

/* AI generation lineage / asset scope metadata stored on the assets row `metadata`. */
export type AssetScope = 'enterprise' | 'project' | 'segment';

export interface AssetLineageMeta {
  scope?: AssetScope;
  project_id?: string;
  segment_id?: string;
  shot_id?: string;
  parent_asset_ids?: string[];
  generation_prompt?: string;
  model?: string;
  seed?: string | number;
  aspect_ratio?: string;
  duration_ms?: number;
  cost_estimate?: number;
  actual_cost?: number;
  provider_terms_snapshot?: Record<string, unknown>;
  review_status?: 'pending' | 'approved' | 'rejected' | 'degraded';
  created_by?: string;
  usage_status?: string;
}

/* Extend Segment.overlay/runtime fields — these are OPTIONAL additive fields only. */
export interface MotionOverlayFields {
  motion_asset_id?: string;
  delivery_mode?: MotionDeliveryMode;
  motion_slot_values?: Record<string, string | number | boolean>;
}

export interface ShotVariant {
  variant_id: string;
  source: 'manual' | 'ai_generate' | 'ai_regenerate' | 'imported';
  changed_fields?: string[];
  preview: { poster_url?: string; webm_url?: string };
  status?: 'candidate' | 'adopted' | 'discarded';
  adopted_at?: string;
}

/* Delivery-mode judgment for a motion spec — drives #20/#21 gating. */
export function judgeDeliveryMode(animationType: string, interactive: boolean): MotionDeliveryMode {
  if (interactive) return 'interactive_preview';
  if (/code|html|web|export/i.test(animationType)) return 'web_code';
  return 'video_overlay';
}

export function isDeliverableToVideo(deliveryMode: MotionDeliveryMode): boolean {
  return deliveryMode === 'video_overlay';
}

export function sanitizeSvgSafelist(input: string): { clean: string; blockers: string[]; warnings: string[] } {
  const blockers: string[] = [];
  const warnings: string[] = [];
  if (/<script/i.test(input)) blockers.push('<script> forbidden');
  if (/<foreignObject/i.test(input)) blockers.push('<foreignObject> forbidden');
  if (/on\w+\s*=/i.test(input)) blockers.push('inline event handler forbidden');
  if (/href\s*=\s*["']javascript:/i.test(input)) blockers.push('javascript: href forbidden');
  if (/<image[^>]+href\s*=\s*["']https?:/i.test(input)) warnings.push('external <image href> may not render offline');
  const clean = input
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '');
  return { clean, blockers, warnings };
}

export function looksLikeLottieJson(text: string): boolean {
  if (!text) return false;
  const head = text.slice(0, 200);
  return /"v"\s*:/.test(head) && (/"layers"\s*:/.test(text) || /"assets"\s*:/.test(text) || /"fr"\s*:/.test(text));
}