import type { CanvasElement, EditorObject, Segment } from '../store/editorStore';

export type LayerKind = 'scene' | 'digital_human' | 'subtitle' | 'overlay' | 'object';

export interface LayerDescriptor {
  kind: LayerKind;
  id: string;
  label: string;
  meta: string;
  visible: boolean;
  overlayIndex?: number;
  objectIndex?: number;
  startTime?: number;
  duration?: number;
  animation?: string;
  canReorder: boolean;
  zIndex: number;
}

export function getObjectLabel(object: EditorObject): string {
  return object.label || ({
    text: '文本',
    image: '图片',
    logo: 'Logo',
    sticker: '贴纸',
    avatar: '数字人',
    subtitle: '字幕',
  }[object.type] || object.type);
}

export function buildSegmentLayers(seg: Segment): LayerDescriptor[] {
  const layers: LayerDescriptor[] = [];
  let z = 0;

  layers.push({
    kind: 'scene',
    id: 'layer-scene',
    label: '背景场景',
    meta: seg.scene_image_url ? '图片' : seg.scene_description ? '描述' : '未配置',
    visible: true,
    canReorder: false,
    zIndex: z++,
  });

  layers.push({
    kind: 'digital_human',
    id: 'layer-dh',
    label: '数字人',
    meta: seg.digital_human.enabled ? '显示' : '隐藏',
    visible: seg.digital_human.enabled,
    canReorder: false,
    zIndex: z++,
  });

  seg.overlays.forEach((overlay, index) => {
    layers.push({
      kind: 'overlay',
      id: overlay.id,
      label: overlay.asset_key ? `贴片 · ${overlay.asset_key}` : `贴片 ${index + 1}`,
      meta: `${overlay.seg_start_time.toFixed(1)}s · ${overlay.duration.toFixed(1)}s`,
      visible: true,
      overlayIndex: index,
      startTime: overlay.seg_start_time,
      duration: overlay.duration,
      animation: overlay.animation || 'none',
      canReorder: true,
      zIndex: z++,
    });
  });

  (seg.objects || []).forEach((object, index) => {
    layers.push({
      kind: 'object',
      id: object.id,
      label: getObjectLabel(object),
      meta: object.visible === false ? '隐藏' : object.type,
      visible: object.visible !== false,
      objectIndex: index,
      animation: object.metadata?.note,
      canReorder: true,
      zIndex: z++,
    });
  });

  layers.push({
    kind: 'subtitle',
    id: 'layer-subtitle',
    label: '字幕',
    meta: `${seg.subtitle.position} · ${seg.subtitle.animation}`,
    visible: seg.subtitle.enabled,
    canReorder: false,
    zIndex: z++,
  });

  return layers.reverse();
}

export function isLayerSelected(layer: LayerDescriptor, selected: CanvasElement, segIndex: number): boolean {
  if (selected.type === 'none' || selected.segIndex !== segIndex) return false;
  if (layer.kind === 'scene') return selected.type === 'scene';
  if (layer.kind === 'digital_human') return selected.type === 'digital_human';
  if (layer.kind === 'subtitle') return selected.type === 'subtitle';
  if (layer.kind === 'overlay') return selected.type === 'overlay' && selected.overlayIndex === layer.overlayIndex;
  if (layer.kind === 'object') return selected.type === 'object' && selected.objectIndex === layer.objectIndex;
  return false;
}

export function selectionFromLayer(layer: LayerDescriptor, segIndex: number): CanvasElement {
  if (layer.kind === 'scene') return { type: 'scene', segIndex };
  if (layer.kind === 'digital_human') return { type: 'digital_human', segIndex };
  if (layer.kind === 'subtitle') return { type: 'subtitle', segIndex };
  if (layer.kind === 'overlay' && layer.overlayIndex !== undefined) {
    return { type: 'overlay', segIndex, overlayIndex: layer.overlayIndex };
  }
  if (layer.kind === 'object' && layer.objectIndex !== undefined) {
    return { type: 'object', segIndex, objectIndex: layer.objectIndex };
  }
  return { type: 'none' };
}