import type { EditorObject } from '../store/editorStore';

export function getObjectLabel(object: Pick<EditorObject, 'type' | 'label'>) {
  if (object.label) return object.label;
  const labels: Record<EditorObject['type'], string> = {
    text: '文字对象',
    image: '图片对象',
    logo: 'Logo 对象',
    sticker: '贴片对象',
    avatar: '数字人对象',
    subtitle: '字幕对象',
  };
  return labels[object.type];
}

export function createEditorObject(
  type: EditorObject['type'],
  patch: Partial<EditorObject> = {},
  segmentDuration = 5,
): EditorObject {
  const duration = patch.duration ?? patch.metadata?.duration_sec ?? segmentDuration;
  return {
    id: `obj-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    label: patch.label || getObjectLabel({ type } as EditorObject),
    text: patch.text || '',
    asset_url: patch.asset_url || '',
    interaction: patch.interaction,
    metadata: patch.metadata,
    style: patch.style,
    seg_start_time: patch.seg_start_time ?? 0,
    duration: Math.max(0.1, Math.min(duration, segmentDuration)),
    animation: patch.animation ?? 'none',
    position: patch.position || { x: 50, y: 48 },
    scale: patch.scale ?? 100,
    rotation: patch.rotation || 0,
    visible: patch.visible ?? true,
    locked: patch.locked ?? false,
  };
}