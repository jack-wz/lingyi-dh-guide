import type { Segment } from '../store/editorStore';

export function getSegmentLocalTime(currentTime: number, segmentStart: number): number {
  return Math.max(0, currentTime - segmentStart);
}

export function isOverlayVisibleAtLocalTime(
  overlay: Segment['overlays'][number],
  localTime: number,
): boolean {
  const start = overlay.seg_start_time;
  const end = start + overlay.duration;
  return localTime >= start && localTime < end;
}

export function getOverlayPreviewStyle(
  overlay: Segment['overlays'][number],
  localTime: number,
): { opacity: number; scaleMultiplier: number } {
  const elapsed = localTime - overlay.seg_start_time;
  if (overlay.animation === 'fadeIn') {
    return { opacity: Math.min(1, Math.max(0, elapsed / 0.5)), scaleMultiplier: 1 };
  }
  if (overlay.animation === 'scaleIn') {
    const progress = Math.min(1, Math.max(0, elapsed / 0.4));
    return { opacity: 1, scaleMultiplier: 0.6 + progress * 0.4 };
  }
  return { opacity: 1, scaleMultiplier: 1 };
}