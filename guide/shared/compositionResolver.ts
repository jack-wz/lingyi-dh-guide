/** Resolve template DSL for preview/composition (mirrors worker stage1_parser semantics). */

import { getAssetMapFromDsl, resolveOverlayAssetUrl } from './assetResolver';

export type VariableMap = Record<string, string>;

export interface CompositionOverlay {
  id: string;
  asset_url: string;
  asset_key?: string;
  position: { x: number; y: number };
  scale: number;
  seg_start_time: number;
  duration: number;
  animation: 'none' | 'fadeIn' | 'scaleIn' | string;
  render_width_pct?: number;
  render_height_pct?: number;
  rotation?: number;
  object_type?: string;
  label?: string;
  text?: string;
  style?: { fill?: string; textColor?: string; variant?: string };
  metadata?: Record<string, unknown>;
}

export interface CompositionSegment {
  id: string;
  type: string;
  narration_text: string;
  duration_sec: number;
  scene_image_url: string;
  scene_description: string;
  camera_shot?: string;
  segment_bgm_url?: string;
  subtitle: { enabled: boolean; style_id: string; position: string; animation: string };
  transition: { type: string; duration: number };
  digital_human: { enabled: boolean; position: { x: number; y: number }; scale: number };
  overlays: CompositionOverlay[];
  objects?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface CompositionDsl {
  meta: Record<string, unknown>;
  globalConfig: Record<string, unknown>;
  segments: CompositionSegment[];
  variables?: Array<{ name: string; default_value?: string; example_value?: string }>;
}

function replaceVars(value: unknown, vars: VariableMap): string {
  let text = value == null ? '' : String(value);
  for (const [name, val] of Object.entries(vars)) {
    text = text.split(`{${name}}`).join(val ?? '');
  }
  return text;
}

function objectToOverlay(
  obj: Record<string, unknown>,
  segmentDuration: number,
  segmentIndex: number,
): CompositionOverlay | null {
  if (obj.visible === false) return null;
  const objType = String(obj.type || '');
  const assetUrl = String(obj.asset_url || '');
  const metadata = (obj.metadata || {}) as Record<string, unknown>;
  const hasRenderable = objType === 'text' || objType === 'logo' || objType === 'subtitle'
    || Boolean(obj.interaction) || metadata.source === 'record';
  if (!assetUrl && !hasRenderable) return null;

  const startTime = Math.max(0, Number(obj.seg_start_time ?? 0));
  let duration = Number(obj.duration ?? metadata.duration_sec ?? segmentDuration);
  if (!Number.isFinite(duration) || duration <= 0) duration = segmentDuration;
  duration = Math.min(duration, Math.max(0.1, segmentDuration - startTime));

  let renderWidthPct = 33;
  let renderHeightPct = 13;
  if (obj.interaction || metadata.source === 'record') {
    renderWidthPct = 52;
    renderHeightPct = 18;
  } else if (objType === 'text' || objType === 'subtitle') {
    renderWidthPct = 58;
    renderHeightPct = 11;
  }

  return {
    id: String(obj.id || `object-${segmentIndex}`),
    asset_url: assetUrl,
    position: (obj.position as CompositionOverlay['position']) || { x: 50, y: 50 },
    scale: Number(obj.scale ?? 100),
    render_width_pct: renderWidthPct,
    render_height_pct: renderHeightPct,
    rotation: Number(obj.rotation ?? 0),
    seg_start_time: startTime,
    duration,
    animation: String(obj.animation || metadata.animation || 'none'),
    object_type: objType,
    label: String(obj.label || ''),
    text: String(obj.text || ''),
    style: obj.style as CompositionOverlay['style'],
    metadata,
  };
}

function buildVariableDefaults(dsl: CompositionDsl, variables: VariableMap): VariableMap {
  const out: VariableMap = { ...variables };
  for (const v of dsl.variables || []) {
    if (out[v.name] == null || out[v.name] === '') {
      out[v.name] = v.default_value || v.example_value || '';
    }
  }
  return out;
}

export function resolveCompositionDsl(
  rawDsl: CompositionDsl,
  variables: VariableMap = {},
): { dsl: CompositionDsl; segments: CompositionSegment[] } {
  const dsl: CompositionDsl = JSON.parse(JSON.stringify(rawDsl));
  const resolvedVars = buildVariableDefaults(dsl, variables);
  const assetMap = getAssetMapFromDsl(dsl);

  const segments = (dsl.segments || []).map((seg, index) => {
    const duration = Math.max(0.1, Number(seg.duration_sec || 5));
    const next: CompositionSegment = {
      ...seg,
      duration_sec: duration,
      narration_text: replaceVars(seg.narration_text, resolvedVars),
      scene_image_url: replaceVars(seg.scene_image_url, resolvedVars),
      scene_description: replaceVars(seg.scene_description, resolvedVars),
      objects: (seg.objects || []).map((obj) => {
        const item = { ...obj };
        item.asset_url = replaceVars(item.asset_url, resolvedVars);
        item.text = replaceVars(item.text, resolvedVars);
        item.label = replaceVars(item.label, resolvedVars);
        return item;
      }),
    };

    const baseOverlays: CompositionOverlay[] = (seg.overlays || []).map((ov) => {
      const item = { ...(ov as CompositionOverlay) };
      const url = resolveOverlayAssetUrl(item as Parameters<typeof resolveOverlayAssetUrl>[0], assetMap);
      if (url) item.asset_url = url;
      const relStart = Math.max(0, Number(item.seg_start_time ?? 0));
      let itemDur = Number(item.duration ?? duration);
      if (!Number.isFinite(itemDur) || itemDur <= 0) itemDur = duration;
      item.duration = Math.min(itemDur, Math.max(0.1, duration - relStart));
      item.seg_start_time = relStart;
      return item;
    });

    for (const obj of next.objects || []) {
      const derived = objectToOverlay(obj, duration, index);
      if (!derived) continue;
      const assetKey = String(obj.asset_key || '').trim();
      if (!derived.asset_url && assetKey && assetMap[assetKey]) {
        derived.asset_url = assetMap[assetKey];
        derived.asset_key = assetKey;
      }
      baseOverlays.push(derived);
    }

    next.overlays = baseOverlays;
    return next;
  });

  dsl.segments = segments;
  return { dsl, segments };
}