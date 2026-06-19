import type { DSL } from '@shared/types/editor';

export function getCanvasSizeForAspectRatio(aspectRatio: NonNullable<DSL['globalConfig']['aspect_ratio']>) {
  if (aspectRatio === '16:9') return { canvas_width: 1920, canvas_height: 1080 };
  if (aspectRatio === '1:1') return { canvas_width: 1080, canvas_height: 1080 };
  return { canvas_width: 1080, canvas_height: 1920 };
}