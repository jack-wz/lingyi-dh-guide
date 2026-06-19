import { resolveDigitalHumanLayout } from '@shared/digitalHumanStyle';
import type { Segment } from '@shared/types/editor';

export interface LiveTransform {
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

export type PreviewDomTarget =
  | { kind: 'object'; index: number }
  | { kind: 'overlay'; index: number }
  | { kind: 'digital_human' };

interface PatchContext {
  canvasWidth: number;
  canvasHeight: number;
  segmentLayout?: Segment['layout'];
}

export function resolvePreviewDomElementId(segment: Segment, target: PreviewDomTarget): string | null {
  if (target.kind === 'object') {
    const object = segment.objects?.[target.index];
    return object ? `obj-${object.id}` : null;
  }
  if (target.kind === 'overlay') {
    const overlay = segment.overlays[target.index];
    return overlay ? `overlay-${overlay.id}` : null;
  }
  if (target.kind === 'digital_human') return 'hf-digital-human';
  return null;
}

function overlayMaxSize(context: PatchContext, widthPct: number, heightPct: number) {
  return {
    maxW: Math.round(context.canvasWidth * widthPct / 100),
    maxH: Math.round(context.canvasHeight * heightPct / 100),
  };
}

export function applyPreviewDomTransform(
  iframe: HTMLIFrameElement | null,
  domId: string,
  targetKind: PreviewDomTarget['kind'],
  transform: LiveTransform,
  context: PatchContext,
  overlaySize?: { render_width_pct?: number; render_height_pct?: number },
) {
  const el = iframe?.contentDocument?.getElementById(domId);
  if (!el) return;

  const scale = transform.scale / 100;
  const rotation = transform.rotation ? ` rotate(${transform.rotation}deg)` : '';

  if (targetKind === 'digital_human') {
    const layout = resolveDigitalHumanLayout(
      context.segmentLayout,
      { x: transform.x, y: transform.y },
      transform.scale,
      context.canvasWidth,
    );
    el.style.left = `${layout.x}%`;
    el.style.top = `${layout.y}%`;
    el.style.width = `${layout.width}px`;
    el.style.height = `${layout.height}px`;
    el.style.transform = 'translate(-50%, -50%)';
    return;
  }

  el.style.left = `${transform.x}%`;
  el.style.top = `${transform.y}%`;
  el.style.transform = `translate(-50%, -50%) scale(${scale})${rotation}`;

  if (targetKind === 'overlay' && overlaySize) {
    const { maxW, maxH } = overlayMaxSize(
      context,
      overlaySize.render_width_pct ?? 20,
      overlaySize.render_height_pct ?? 12,
    );
    el.style.maxWidth = `${maxW}px`;
    el.style.maxHeight = `${maxH}px`;
  }
}

export function syncDomTargetFromSegment(
  iframe: HTMLIFrameElement | null,
  segment: Segment,
  target: PreviewDomTarget,
  context: PatchContext,
) {
  const domId = resolvePreviewDomElementId(segment, target);
  if (!domId) return;

  if (target.kind === 'object') {
    const object = segment.objects?.[target.index];
    if (!object) return;
    applyPreviewDomTransform(iframe, domId, 'object', {
      x: object.position.x,
      y: object.position.y,
      scale: object.scale,
      rotation: object.rotation || 0,
    }, context);
    return;
  }

  if (target.kind === 'overlay') {
    const overlay = segment.overlays[target.index];
    if (!overlay) return;
    applyPreviewDomTransform(iframe, domId, 'overlay', {
      x: overlay.position.x,
      y: overlay.position.y,
      scale: overlay.scale,
      rotation: overlay.rotation || 0,
    }, context, overlay);
    return;
  }

  if (target.kind === 'digital_human') {
    applyPreviewDomTransform(iframe, domId, 'digital_human', {
      x: segment.digital_human.position.x,
      y: segment.digital_human.position.y,
      scale: segment.digital_human.scale,
      rotation: 0,
    }, context);
  }
}

export function patchPreviewDomForGesture(
  iframe: HTMLIFrameElement | null,
  segment: Segment,
  target: PreviewDomTarget,
  transform: LiveTransform,
  context: PatchContext,
) {
  const domId = resolvePreviewDomElementId(segment, target);
  if (!domId) return;
  const overlay = target.kind === 'overlay' ? segment.overlays[target.index] : undefined;
  applyPreviewDomTransform(iframe, domId, target.kind, transform, context, overlay);
}