import { useMemo } from 'react';
import { useEditorStore } from '../store/editorStore';
import type { CanvasElement, DSL, Segment } from '../store/editorStore';
import {
  buildSegmentLayers,
  isLayerSelected,
  selectionFromLayer,
  type LayerDescriptor,
} from '../utils/layerCatalog';
import { IconEye, IconEyeOff, IconImage, IconLayout, IconMic, IconPlus, IconType, IconUser } from './Icons';

const OVERLAY_ANIMATIONS = [
  { id: 'none', label: '无' },
  { id: 'fadeIn', label: '淡入' },
  { id: 'scaleIn', label: '缩放' },
] as const;

function layerIcon(kind: LayerDescriptor['kind']) {
  if (kind === 'scene') return <IconImage size={14} />;
  if (kind === 'digital_human') return <IconUser size={14} />;
  if (kind === 'subtitle') return <IconType size={14} />;
  if (kind === 'overlay') return <IconLayout size={14} />;
  return <IconLayout size={14} />;
}

export default function LayersPanel({
  dsl,
  currentSegIndex,
  selectedElement,
  updateDsl,
  onOpenObjectTab,
}: {
  dsl: DSL;
  currentSegIndex: number;
  selectedElement: CanvasElement;
  updateDsl: (updater: (dsl: DSL) => DSL) => void;
  onOpenObjectTab?: () => void;
}) {
  const seg = dsl.segments[currentSegIndex];
  const setSelectedElement = useEditorStore(s => s.setSelectedElement);
  const seekToTime = useEditorStore(s => s.seekToTime);
  const getSegmentStartTime = useEditorStore(s => s.getSegmentStartTime);

  const layers = useMemo(() => buildSegmentLayers(seg), [seg]);

  const updateSeg = (partial: Partial<Segment>) => {
    updateDsl((draft) => {
      const segments = [...draft.segments];
      segments[currentSegIndex] = { ...segments[currentSegIndex], ...partial };
      return { ...draft, segments };
    });
  };

  const addOverlay = () => {
    const localT = Math.max(0, useEditorStore.getState().currentTime - getSegmentStartTime(currentSegIndex));
    const duration = Math.min(3, Math.max(1, seg.duration_sec - localT));
    updateSeg({
      overlays: [
        ...seg.overlays,
        {
          id: `overlay-${Date.now()}`,
          asset_url: '',
          position: { x: 50, y: 50 },
          scale: 100,
          seg_start_time: localT,
          duration,
          animation: 'fadeIn',
        },
      ],
    });
    setSelectedElement({ type: 'overlay', segIndex: currentSegIndex, overlayIndex: seg.overlays.length });
  };

  const toggleVisibility = (layer: LayerDescriptor) => {
    if (layer.kind === 'digital_human') {
      updateSeg({ digital_human: { ...seg.digital_human, enabled: !seg.digital_human.enabled } });
      return;
    }
    if (layer.kind === 'subtitle') {
      updateSeg({ subtitle: { ...seg.subtitle, enabled: !seg.subtitle.enabled } });
      return;
    }
    if (layer.kind === 'object' && layer.objectIndex !== undefined) {
      const objects = [...(seg.objects || [])];
      const object = objects[layer.objectIndex];
      if (!object) return;
      objects[layer.objectIndex] = { ...object, visible: object.visible === false };
      updateSeg({ objects });
      return;
    }
  };

  const moveOverlay = (index: number, direction: -1 | 1) => {
    const overlays = [...seg.overlays];
    const next = index + direction;
    if (next < 0 || next >= overlays.length) return;
    [overlays[index], overlays[next]] = [overlays[next], overlays[index]];
    updateSeg({ overlays });
    if (selectedElement.type === 'overlay' && selectedElement.overlayIndex === index) {
      setSelectedElement({ type: 'overlay', segIndex: currentSegIndex, overlayIndex: next });
    }
  };

  const moveObject = (index: number, direction: -1 | 1) => {
    const objects = [...(seg.objects || [])];
    const next = index + direction;
    if (next < 0 || next >= objects.length) return;
    [objects[index], objects[next]] = [objects[next], objects[index]];
    updateSeg({ objects });
    if (selectedElement.type === 'object' && selectedElement.objectIndex === index) {
      setSelectedElement({ type: 'object', segIndex: currentSegIndex, objectIndex: next });
    }
  };

  const selectLayer = (layer: LayerDescriptor) => {
    setSelectedElement(selectionFromLayer(layer, currentSegIndex));
    if (layer.kind === 'overlay' && layer.startTime !== undefined) {
      seekToTime(getSegmentStartTime(currentSegIndex) + layer.startTime, {
        syncSegment: true,
        clearSelection: false,
        stopPlayback: true,
      });
    }
  };

  const selectedOverlay = selectedElement.type === 'overlay'
    ? seg.overlays[selectedElement.overlayIndex]
    : undefined;

  const updateOverlay = (partial: Partial<NonNullable<typeof selectedOverlay>>) => {
    if (!selectedOverlay || selectedElement.type !== 'overlay') return;
    const overlays = [...seg.overlays];
    overlays[selectedElement.overlayIndex] = { ...selectedOverlay, ...partial };
    updateSeg({ overlays });
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="p-3 border-b border-border flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">图层</h3>
          <p className="text-[10px] text-muted-foreground">场景 {currentSegIndex + 1} · {layers.length} 层</p>
        </div>
        <button
          type="button"
          onClick={addOverlay}
          className="h-8 px-2.5 rounded-md bg-secondary hover:bg-accent text-[11px] flex items-center gap-1"
        >
          <IconPlus size={13} />
          贴片
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {layers.map((layer) => {
          const active = isLayerSelected(layer, selectedElement, currentSegIndex);
          const canToggle = layer.kind === 'digital_human' || layer.kind === 'subtitle' || layer.kind === 'object';
          return (
            <div
              key={layer.id}
              className={`rounded-md border transition-colors ${active ? 'border-foreground bg-accent' : 'border-border hover:border-foreground/30 hover:bg-accent/30'}`}
            >
              <button
                type="button"
                onClick={() => selectLayer(layer)}
                className="w-full px-2.5 py-2 text-left flex items-center gap-2"
              >
                <span className="text-muted-foreground shrink-0">{layerIcon(layer.kind)}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-xs font-medium truncate">{layer.label}</span>
                  <span className="block text-[10px] text-muted-foreground truncate">{layer.meta}</span>
                </span>
                {layer.animation && layer.animation !== 'none' && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground shrink-0">
                    {layer.animation}
                  </span>
                )}
              </button>
              <div className="px-2 pb-2 flex items-center gap-1">
                {canToggle && (
                  <button
                    type="button"
                    title={layer.visible ? '隐藏' : '显示'}
                    onClick={() => toggleVisibility(layer)}
                    className="w-7 h-7 rounded bg-background border border-border flex items-center justify-center text-muted-foreground hover:text-foreground"
                  >
                    {layer.visible ? <IconEye size={13} /> : <IconEyeOff size={13} />}
                  </button>
                )}
                {layer.kind === 'overlay' && layer.overlayIndex !== undefined && (
                  <>
                    <button type="button" onClick={() => moveOverlay(layer.overlayIndex!, 1)} className="h-7 px-2 rounded bg-background border border-border text-[10px] text-muted-foreground hover:text-foreground">前移</button>
                    <button type="button" onClick={() => moveOverlay(layer.overlayIndex!, -1)} className="h-7 px-2 rounded bg-background border border-border text-[10px] text-muted-foreground hover:text-foreground">后移</button>
                  </>
                )}
                {layer.kind === 'object' && layer.objectIndex !== undefined && (
                  <>
                    <button type="button" onClick={() => moveObject(layer.objectIndex!, 1)} className="h-7 px-2 rounded bg-background border border-border text-[10px] text-muted-foreground hover:text-foreground">前移</button>
                    <button type="button" onClick={() => moveObject(layer.objectIndex!, -1)} className="h-7 px-2 rounded bg-background border border-border text-[10px] text-muted-foreground hover:text-foreground">后移</button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {selectedOverlay && (
        <div className="border-t border-border p-3 space-y-2 bg-secondary/20 shrink-0">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold">贴片动画</span>
            {onOpenObjectTab && (
              <button type="button" onClick={onOpenObjectTab} className="text-[10px] text-brand-blue hover:underline">
                更多属性
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[10px] text-muted-foreground">
              开始 (s)
              <input
                type="number"
                min={0}
                max={seg.duration_sec}
                step={0.1}
                value={selectedOverlay.seg_start_time}
                onChange={(e) => updateOverlay({ seg_start_time: Number(e.target.value) })}
                className="mt-0.5 w-full h-8 rounded-md border border-border bg-background px-2 text-[12px]"
              />
            </label>
            <label className="text-[10px] text-muted-foreground">
              时长 (s)
              <input
                type="number"
                min={0.1}
                max={seg.duration_sec}
                step={0.1}
                value={selectedOverlay.duration}
                onChange={(e) => updateOverlay({ duration: Number(e.target.value) })}
                className="mt-0.5 w-full h-8 rounded-md border border-border bg-background px-2 text-[12px]"
              />
            </label>
          </div>
          <label className="text-[10px] text-muted-foreground block">
            入场动画
            <select
              value={selectedOverlay.animation}
              onChange={(e) => updateOverlay({ animation: e.target.value as typeof selectedOverlay.animation })}
              className="mt-0.5 w-full h-8 rounded-md border border-border bg-background px-2 text-[12px]"
            >
              {OVERLAY_ANIMATIONS.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </label>
        </div>
      )}
    </div>
  );
}