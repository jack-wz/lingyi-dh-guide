import type { EditorObject } from '../../../store/editorStore';

export interface OverlayBoxInput {
  scale: number;
  render_width_pct?: number;
  render_height_pct?: number;
}

/** Match cenker / worker overlay box semantics for interaction hit targets. */
export function getObjectBox(object: EditorObject) {
  const isText = object.type === 'text' || object.type === 'subtitle';
  const isInteractive = Boolean(object.interaction);
  const isRecording = object.metadata?.source === 'record';
  const hasImage = object.asset_url && object.type !== 'text' && object.type !== 'subtitle';

  if (isText) return { width: 160, height: 48 };
  if (isInteractive) return { width: 144, height: 84 };
  if (isRecording) return { width: 140, height: 84 };
  if (hasImage) return { width: 90, height: 70 };
  return { width: 84, height: 60 };
}

export function getOverlayBox(displayW: number, displayH: number, overlay: OverlayBoxInput) {
  const widthPct = overlay.render_width_pct ?? 20;
  const heightPct = overlay.render_height_pct ?? 12;
  const scale = overlay.scale / 100;
  return {
    width: Math.max(48, displayW * (widthPct / 100) * scale),
    height: Math.max(36, displayH * (heightPct / 100) * scale),
  };
}

const DIGITAL_HUMAN_BASE = 72;

export function getDigitalHumanBox(scale: number) {
  const size = DIGITAL_HUMAN_BASE * (scale / 100);
  return { width: size, height: size };
}

/** Bake scale multiplier into render % so canvas resize stays in sync with the property panel. */
export function bakeOverlayDimensions(
  overlay: OverlayBoxInput & { render_width_pct?: number; render_height_pct?: number },
  scale: number,
) {
  const baseW = overlay.render_width_pct ?? 20;
  const baseH = overlay.render_height_pct ?? 12;
  return {
    render_width_pct: Math.max(5, Math.min(100, Math.round(baseW * scale / 100))),
    render_height_pct: Math.max(5, Math.min(100, Math.round(baseH * scale / 100))),
    scale: 100,
  };
}