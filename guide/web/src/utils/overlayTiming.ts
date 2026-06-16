import type { Segment } from '../store/editorStore';
import { getTimedElementPreviewStyle, isTimedElementVisibleAtLocalTime } from './elementTiming';

export function getSegmentLocalTime(currentTime: number, segmentStart: number): number {
  return Math.max(0, currentTime - segmentStart);
}

export function isOverlayVisibleAtLocalTime(
  overlay: Segment['overlays'][number],
  localTime: number,
  segmentDuration?: number,
): boolean {
  if (segmentDuration != null) {
    return isTimedElementVisibleAtLocalTime(overlay, localTime, segmentDuration);
  }
  const start = overlay.seg_start_time;
  const end = start + overlay.duration;
  return localTime >= start && localTime < end;
}

export function getOverlayPreviewStyle(
  overlay: Segment['overlays'][number],
  localTime: number,
  segmentDuration?: number,
): { opacity: number; scaleMultiplier: number } {
  if (segmentDuration != null) {
    return getTimedElementPreviewStyle(overlay, localTime, segmentDuration);
  }
  return getTimedElementPreviewStyle(overlay, localTime, overlay.seg_start_time + overlay.duration);
}