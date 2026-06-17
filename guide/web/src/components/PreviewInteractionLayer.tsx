import { useCallback, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useEditorStore } from '../store/editorStore';
import type { EditorObject } from '../store/editorStore';
import { getSegmentLocalTime, isOverlayVisibleAtLocalTime } from '../utils/overlayTiming';
import { isTimedElementVisibleAtLocalTime } from '../utils/elementTiming';
import {
  buildSubtitleTextShadow,
  getSubtitleStyleDefinition,
  normalizeSubtitleStyleId,
  resolveSubtitlePreviewFontSizePx,
} from '@shared/subtitleStyles';

interface Layout {
  displayW: number;
  displayH: number;
  scale: number;
}

type DragTarget =
  | { kind: 'object'; index: number }
  | { kind: 'overlay'; index: number }
  | { kind: 'digital_human' }
  | null;

export default function PreviewInteractionLayer({ layout }: { layout: Layout }) {
  const dsl = useEditorStore(s => s.dsl);
  const currentSegIndex = useEditorStore(s => s.currentSegIndex);
  const currentTime = useEditorStore(s => s.currentTime);
  const playing = useEditorStore(s => s.playing);
  const getSegmentStartTime = useEditorStore(s => s.getSegmentStartTime);
  const selectedElement = useEditorStore(s => s.selectedElement);
  const setSelectedElement = useEditorStore(s => s.setSelectedElement);
  const updateDsl = useEditorStore(s => s.updateDsl);

  const dragRef = useRef<{ target: DragTarget; startX: number; startY: number; origX: number; origY: number } | null>(null);
  const [dragging, setDragging] = useState<DragTarget>(null);

  if (!dsl) return null;
  const segment = dsl.segments[currentSegIndex];
  if (!segment) return null;

  const { displayW, displayH } = layout;
  const segmentStart = getSegmentStartTime(currentSegIndex);
  const localTime = getSegmentLocalTime(currentTime, segmentStart);
  const segDuration = Number(segment.duration_sec || 5);

  const pctToPx = (x: number, y: number) => ({
    left: (x / 100) * displayW,
    top: (y / 100) * displayH,
  });

  const updatePosition = useCallback((target: DragTarget, x: number, y: number) => {
    if (!target) return;
    const px = Math.max(0, Math.min(100, Math.round(x)));
    const py = Math.max(0, Math.min(100, Math.round(y)));
    updateDsl((draft) => {
      const segs = [...draft.segments];
      const seg = { ...segs[currentSegIndex] };
      if (target.kind === 'object') {
        const objects = [...(seg.objects || [])];
        const obj = objects[target.index];
        if (!obj) return draft;
        objects[target.index] = { ...obj, position: { x: px, y: py } };
        seg.objects = objects;
      } else if (target.kind === 'overlay') {
        const overlays = [...seg.overlays];
        const ov = overlays[target.index];
        if (!ov) return draft;
        overlays[target.index] = { ...ov, position: { x: px, y: py } };
        seg.overlays = overlays;
      } else if (target.kind === 'digital_human') {
        seg.digital_human = { ...seg.digital_human, position: { x: px, y: py } };
      }
      segs[currentSegIndex] = seg;
      return { ...draft, segments: segs };
    });
  }, [currentSegIndex, updateDsl]);

  const startDrag = (e: ReactPointerEvent, target: DragTarget, origX: number, origY: number) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { target, startX: e.clientX, startY: e.clientY, origX, origY };
    setDragging(target);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const drag = dragRef.current;
    if (!drag?.target) return;
    const dx = ((e.clientX - drag.startX) / displayW) * 100;
    const dy = ((e.clientY - drag.startY) / displayH) * 100;
    updatePosition(drag.target, drag.origX + dx, drag.origY + dy);
  };

  const endDrag = (e: ReactPointerEvent) => {
    dragRef.current = null;
    setDragging(null);
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* noop */ }
  };

  const visibleObjects = (segment.objects || [])
    .map((object, index) => ({ object, index }))
    .filter(({ object, index }) => object.visible !== false && (
      !playing
      || isTimedElementVisibleAtLocalTime(object, localTime, segDuration)
      || (selectedElement.type === 'object' && selectedElement.segIndex === currentSegIndex && selectedElement.objectIndex === index)
    ));

  const visibleOverlays = segment.overlays
    .map((ov, index) => ({ ov, index }))
    .filter(({ ov, index }) => !playing
      || isOverlayVisibleAtLocalTime(ov, localTime, segDuration)
      || (selectedElement.type === 'overlay' && selectedElement.segIndex === currentSegIndex && selectedElement.overlayIndex === index));

  const selectedObject = selectedElement.type === 'object' && selectedElement.segIndex === currentSegIndex
    ? segment.objects?.[selectedElement.objectIndex]
    : undefined;

  const updateSelectedObjectTransform = (partial: Partial<EditorObject>) => {
    if (selectedElement.type !== 'object') return;
    updateDsl((d) => {
      const segs = [...d.segments];
      const objects = [...(segs[currentSegIndex].objects || [])];
      const object = objects[selectedElement.objectIndex];
      if (!object) return d;
      objects[selectedElement.objectIndex] = { ...object, ...partial };
      segs[currentSegIndex] = { ...segs[currentSegIndex], objects };
      return { ...d, segments: segs };
    });
  };

  return (
    <div
      className="absolute inset-0 z-10"
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClick={() => setSelectedElement({ type: 'none' })}
    >
      {segment.digital_human.enabled && (
        <button
          type="button"
          className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 ${
            selectedElement.type === 'digital_human' && selectedElement.segIndex === currentSegIndex
              ? 'border-primary bg-primary/10'
              : 'border-transparent hover:border-primary/40'
          }`}
          style={{
            ...pctToPx(segment.digital_human.position.x, segment.digital_human.position.y),
            width: 72 * (segment.digital_human.scale / 100),
            height: 72 * (segment.digital_human.scale / 100),
            cursor: dragging?.kind === 'digital_human' ? 'grabbing' : 'grab',
          }}
          onClick={(e) => { e.stopPropagation(); setSelectedElement({ type: 'digital_human', segIndex: currentSegIndex }); }}
          onPointerDown={(e) => startDrag(e, { kind: 'digital_human' }, segment.digital_human.position.x, segment.digital_human.position.y)}
        />
      )}

      {visibleOverlays.map(({ ov, index }) => {
        const pos = pctToPx(ov.position.x, ov.position.y);
        const selected = selectedElement.type === 'overlay' && selectedElement.segIndex === currentSegIndex && selectedElement.overlayIndex === index;
        return (
          <button
            key={ov.id}
            type="button"
            className={`absolute -translate-x-1/2 -translate-y-1/2 border-2 rounded-md ${
              selected ? 'border-primary bg-primary/5' : 'border-transparent hover:border-primary/30'
            }`}
            style={{
              left: pos.left,
              top: pos.top,
              width: Math.max(48, displayW * 0.16 * (ov.scale / 100)),
              height: Math.max(36, displayH * 0.08 * (ov.scale / 100)),
              cursor: dragging?.kind === 'overlay' && dragging.index === index ? 'grabbing' : 'grab',
            }}
            onClick={(e) => { e.stopPropagation(); setSelectedElement({ type: 'overlay', segIndex: currentSegIndex, overlayIndex: index }); }}
            onPointerDown={(e) => startDrag(e, { kind: 'overlay', index }, ov.position.x, ov.position.y)}
          />
        );
      })}

      {visibleObjects.map(({ object, index }) => {
        const pos = pctToPx(object.position.x, object.position.y);
        const selected = selectedElement.type === 'object' && selectedElement.segIndex === currentSegIndex && selectedElement.objectIndex === index;
        const w = object.type === 'text' || object.type === 'subtitle' ? 140 : 90;
        const h = object.type === 'text' || object.type === 'subtitle' ? 48 : 70;
        return (
          <button
            key={object.id}
            type="button"
            disabled={object.locked}
            className={`absolute -translate-x-1/2 -translate-y-1/2 border-2 rounded-lg ${
              selected ? 'border-primary bg-primary/5' : 'border-transparent hover:border-primary/30'
            } ${object.locked ? 'cursor-not-allowed' : ''}`}
            style={{
              left: pos.left,
              top: pos.top,
              width: w * (object.scale / 100),
              height: h * (object.scale / 100),
              cursor: object.locked ? 'not-allowed' : dragging?.kind === 'object' && dragging.index === index ? 'grabbing' : 'grab',
            }}
            onClick={(e) => { e.stopPropagation(); setSelectedElement({ type: 'object', segIndex: currentSegIndex, objectIndex: index }); }}
            onPointerDown={(e) => !object.locked && startDrag(e, { kind: 'object', index }, object.position.x, object.position.y)}
          />
        );
      })}

      {segment.subtitle.enabled && (() => {
        const styleId = normalizeSubtitleStyleId(segment.subtitle.style_id);
        const styleDef = getSubtitleStyleDefinition(styleId);
        const render = styleDef?.render;
        const previewFont = resolveSubtitlePreviewFontSizePx({
          styleId,
          fontSize: segment.subtitle.font_size,
          globalFontSize: dsl.globalConfig.subtitle_font_size,
          canvasWidth: dsl.globalConfig.canvas_width || 1080,
          previewWidth: displayW,
        });
        const posStyle = {
          bottom: segment.subtitle.position === 'top' ? undefined : segment.subtitle.position === 'center' ? '45%' : '12%',
          top: segment.subtitle.position === 'top' ? '6%' : undefined,
        } as const;
        const previewText = (segment.narration_text || '字幕预览').slice(0, 24);
        return (
          <button
            type="button"
            className={`absolute left-[5%] right-[5%] min-h-9 border-2 rounded-md px-2 py-1 text-center leading-snug pointer-events-auto ${
              selectedElement.type === 'subtitle' && selectedElement.segIndex === currentSegIndex
                ? 'border-primary'
                : 'border-transparent hover:border-primary/30'
            }`}
            style={{
              ...posStyle,
              color: render?.color || '#fff',
              background: render?.bg === 'transparent' ? 'transparent' : (render?.bg || 'rgba(0,0,0,0.45)'),
              fontSize: previewFont,
              fontWeight: render?.weight || 600,
              textShadow: buildSubtitleTextShadow(render?.outline, (render?.weight || 600) >= 700 ? 2 : 1),
              borderRadius: render?.borderRadius ?? 6,
            }}
            onClick={(e) => { e.stopPropagation(); setSelectedElement({ type: 'subtitle', segIndex: currentSegIndex }); }}
          >
            {previewText}
          </button>
        );
      })()}

      {selectedObject && selectedObject.visible !== false && !selectedObject.locked && (
        <ObjectTransformHandles
          object={selectedObject}
          layout={layout}
          onTransform={updateSelectedObjectTransform}
        />
      )}
    </div>
  );
}

function ObjectTransformHandles({
  object,
  layout,
  onTransform,
}: {
  object: EditorObject;
  layout: Layout;
  onTransform: (partial: Partial<EditorObject>) => void;
}) {
  const pos = {
    left: (object.position.x / 100) * layout.displayW,
    top: (object.position.y / 100) * layout.displayH,
  };
  const scale = object.scale / 100;
  const boxW = (object.type === 'text' || object.type === 'subtitle' ? 140 : 90) * scale;
  const boxH = (object.type === 'text' || object.type === 'subtitle' ? 48 : 70) * scale;
  const resizeX = pos.left + boxW / 2;
  const resizeY = pos.top + boxH / 2;

  const startResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const base = Math.max(boxW, boxH) / 2;
    const move = (moveEvent: PointerEvent) => {
      const rect = (event.currentTarget.closest('[data-testid="video-canvas"]') as HTMLElement)?.getBoundingClientRect();
      if (!rect) return;
      const pointerX = moveEvent.clientX - rect.left - pos.left;
      const pointerY = moveEvent.clientY - rect.top - pos.top;
      const distance = Math.hypot(pointerX, pointerY);
      const nextScale = Math.max(10, Math.min(260, (distance / base) * 100));
      onTransform({ scale: Math.round(nextScale) });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <button
      type="button"
      data-testid="object-resize-handle"
      aria-label="缩放对象"
      className="absolute z-20 h-4 w-4 rounded-full border-2 border-primary bg-card shadow cursor-nwse-resize"
      style={{ left: resizeX, top: resizeY, transform: 'translate(-50%, -50%)' }}
      onPointerDown={startResize}
      onClick={(e) => e.stopPropagation()}
    />
  );
}