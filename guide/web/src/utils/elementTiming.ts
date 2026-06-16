import type { EditorObject, Segment } from '../store/editorStore';

export interface TimedElement {
  seg_start_time?: number;
  duration?: number;
  animation?: 'none' | 'fadeIn' | 'scaleIn' | string;
  metadata?: { duration_sec?: number; animation?: string };
}

export interface ResolvedTiming {
  start: number;
  duration: number;
  end: number;
}

export function resolveElementTiming(
  element: TimedElement,
  segmentDuration: number,
): ResolvedTiming {
  const segDur = Math.max(0.1, Number(segmentDuration || 5));
  const metaDur = Number(element.metadata?.duration_sec);
  let duration = Number(element.duration);
  if (!Number.isFinite(duration) || duration <= 0) {
    duration = Number.isFinite(metaDur) && metaDur > 0 ? metaDur : segDur;
  }
  duration = Math.max(0.1, Math.min(duration, segDur));
  const start = Math.max(0, Math.min(Number(element.seg_start_time ?? 0), segDur - 0.1));
  const end = Math.min(segDur, start + duration);
  return { start, duration: Math.max(0.1, end - start), end };
}

export function isTimedElementVisibleAtLocalTime(
  element: TimedElement,
  localTime: number,
  segmentDuration: number,
): boolean {
  const { start, end } = resolveElementTiming(element, segmentDuration);
  return localTime >= start && localTime < end;
}

export function getTimedElementPreviewStyle(
  element: TimedElement,
  localTime: number,
  segmentDuration: number,
): { opacity: number; scaleMultiplier: number } {
  const { start } = resolveElementTiming(element, segmentDuration);
  const animation = String(element.animation || element.metadata?.animation || 'none');
  const elapsed = localTime - start;
  if (animation === 'fadeIn') {
    return { opacity: Math.min(1, Math.max(0, elapsed / 0.5)), scaleMultiplier: 1 };
  }
  if (animation === 'scaleIn') {
    const progress = Math.min(1, Math.max(0, elapsed / 0.4));
    return { opacity: 1, scaleMultiplier: 0.6 + progress * 0.4 };
  }
  return { opacity: 1, scaleMultiplier: 1 };
}

export function normalizeObjectTiming(object: EditorObject, segmentDuration: number): EditorObject {
  const timing = resolveElementTiming(object, segmentDuration);
  return {
    ...object,
    seg_start_time: timing.start,
    duration: timing.duration,
  };
}

export function normalizeSegmentObjects(segment: Segment): Segment {
  const duration = Math.max(0.1, Number(segment.duration_sec || 5));
  const objects = (segment.objects || []).map((obj) => normalizeObjectTiming(obj, duration));
  const overlays = segment.overlays.map((ov) => {
    const timing = resolveElementTiming(ov, duration);
    return { ...ov, seg_start_time: timing.start, duration: timing.duration };
  });
  return { ...segment, objects, overlays };
}

export function getAudioDisplayDuration(
  segmentDuration: number,
  sourceDuration?: number,
): { displayDuration: number; overflowDuration: number } {
  const segDur = Math.max(0.1, Number(segmentDuration || 5));
  const source = Number.isFinite(sourceDuration) && sourceDuration! > 0 ? sourceDuration! : segDur;
  if (source <= segDur) {
    return { displayDuration: source, overflowDuration: 0 };
  }
  return { displayDuration: segDur, overflowDuration: source - segDur };
}