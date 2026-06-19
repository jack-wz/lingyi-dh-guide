import type { CanvasElement } from '@shared/types/editor';

export function getCanvasSelectionKey(selection: CanvasElement): string {
  if (selection.type === 'none') return 'none';
  if (selection.type === 'scene' || selection.type === 'digital_human' || selection.type === 'subtitle') {
    return `${selection.type}:${selection.segIndex}`;
  }
  if (selection.type === 'overlay') return `overlay:${selection.segIndex}:${selection.overlayIndex}`;
  return `object:${selection.segIndex}:${selection.objectIndex}`;
}