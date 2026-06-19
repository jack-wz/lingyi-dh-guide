import type { CanvasElement, DSL, EditorObject } from '@shared/types/editor';

export function duplicateCanvasSelection(
  dsl: DSL,
  segIndex: number,
  selected: CanvasElement,
): { dsl: DSL; selection: CanvasElement } | null {
  const segment = dsl.segments[segIndex];
  if (!segment) return null;

  if (selected.type === 'object') {
    const object = segment.objects?.[selected.objectIndex];
    if (!object || object.locked) return null;
    const copy: EditorObject = {
      ...object,
      id: `obj-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      label: `${object.label || object.type} 副本`,
      position: { x: Math.min(100, object.position.x + 4), y: Math.min(100, object.position.y + 4) },
    };
    const segs = [...dsl.segments];
    const objects = [...(segment.objects || [])];
    objects.splice(selected.objectIndex + 1, 0, copy);
    segs[segIndex] = { ...segment, objects };
    return {
      dsl: { ...dsl, segments: segs },
      selection: { type: 'object', segIndex, objectIndex: selected.objectIndex + 1 },
    };
  }

  if (selected.type === 'overlay') {
    const overlay = segment.overlays[selected.overlayIndex];
    if (!overlay) return null;
    const segs = [...dsl.segments];
    const overlays = [...segment.overlays];
    overlays.splice(selected.overlayIndex + 1, 0, {
      ...overlay,
      id: `overlay-${Date.now()}`,
      position: { x: Math.min(100, overlay.position.x + 4), y: Math.min(100, overlay.position.y + 4) },
    });
    segs[segIndex] = { ...segment, overlays };
    return {
      dsl: { ...dsl, segments: segs },
      selection: { type: 'overlay', segIndex, overlayIndex: selected.overlayIndex + 1 },
    };
  }

  return null;
}

export function removeCanvasSelection(
  dsl: DSL,
  segIndex: number,
  selected: CanvasElement,
): DSL | null {
  const segment = dsl.segments[segIndex];
  if (!segment) return null;

  const segs = [...dsl.segments];

  if (selected.type === 'object') {
    const object = segment.objects?.[selected.objectIndex];
    if (!object || object.locked) return null;
    const objects = (segment.objects || []).filter((_, index) => index !== selected.objectIndex);
    segs[segIndex] = { ...segment, objects };
  } else if (selected.type === 'overlay') {
    const overlays = segment.overlays.filter((_, index) => index !== selected.overlayIndex);
    segs[segIndex] = { ...segment, overlays };
  } else if (selected.type === 'digital_human') {
    segs[segIndex] = {
      ...segment,
      digital_human: { ...segment.digital_human, enabled: false },
    };
  } else if (selected.type === 'subtitle') {
    segs[segIndex] = {
      ...segment,
      subtitle: { ...segment.subtitle, enabled: false },
    };
  } else {
    return null;
  }

  return { ...dsl, segments: segs };
}