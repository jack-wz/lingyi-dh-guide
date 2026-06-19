import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useEditorStore } from '../store/editorStore';
import { getSegmentLocalTime, isOverlayVisibleAtLocalTime } from '../utils/overlayTiming';
import { isTimedElementVisibleAtLocalTime } from '../utils/elementTiming';
import {
  buildSubtitleTextShadow,
  getSubtitleStyleDefinition,
  normalizeSubtitleStyleId,
  resolveSubtitleFontFamily,
  resolveSubtitlePreviewFontSizePx,
} from '@shared/subtitleStyles';
import { bakeOverlayDimensions, getDigitalHumanBox, getObjectBox, getOverlayBox } from './VideoCanvas/utils/objectBox';
import { duplicateCanvasSelection, removeCanvasSelection } from '../utils/canvasSelectionActions';
import { patchPreviewDomForGesture, syncDomTargetFromSegment } from '../utils/previewDomPatch';

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

type ResizeAnchor = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

type GestureKind = 'drag' | 'resize' | 'rotate';

interface GestureSession {
  kind: GestureKind;
  target: DragTarget;
  anchor?: ResizeAnchor;
  startClientX: number;
  startClientY: number;
  origX: number;
  origY: number;
  origScale: number;
  origRotation: number;
  startDist: number;
  startAngle?: number;
}

interface LiveTransform {
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

const HANDLE_SIZE = 14; // larger for silky grab (matching cenker feel)
const PRIMARY = '#4F46E5';

const SCALE_LIMITS = {
  object: { min: 10, max: 260 },
  overlay: { min: 10, max: 250 },
  digital_human: { min: 20, max: 220 },
} as const;

function clampScaleForTarget(kind: NonNullable<DragTarget>['kind'], scale: number) {
  const limits = SCALE_LIMITS[kind];
  return Math.max(limits.min, Math.min(limits.max, scale));
}

function targetsMatch(a: DragTarget, b: DragTarget) {
  if (!a || !b) return false;
  if (a.kind !== b.kind) return false;
  if (a.kind === 'digital_human') return true;
  return a.index === (b as { index: number }).index;
}

function anchorCursor(anchor: ResizeAnchor) {
  if (anchor === 'top-left' || anchor === 'bottom-right') return 'nwse-resize';
  return 'nesw-resize';
}

function cornerOffset(anchor: ResizeAnchor, halfW: number, halfH: number) {
  switch (anchor) {
    case 'top-left': return { x: -halfW, y: -halfH };
    case 'top-right': return { x: halfW, y: -halfH };
    case 'bottom-left': return { x: -halfW, y: halfH };
    default: return { x: halfW, y: halfH };
  }
}

export default function PreviewInteractionLayer({
  layout,
  iframeRef,
  suppressPreviewRebuildRef,
  interactionEnabled = true,
  showSubtitleOverlay = true,
}: {
  layout: Layout;
  iframeRef?: RefObject<HTMLIFrameElement | null>;
  suppressPreviewRebuildRef?: RefObject<boolean>;
  interactionEnabled?: boolean;
  showSubtitleOverlay?: boolean;
}) {
  const dsl = useEditorStore(s => s.dsl);
  const currentSegIndex = useEditorStore(s => s.currentSegIndex);
  const currentTime = useEditorStore(s => s.currentTime);
  const playing = useEditorStore(s => s.playing);
  const getSegmentStartTime = useEditorStore(s => s.getSegmentStartTime);
  const selectedElement = useEditorStore(s => s.selectedElement);
  const setSelectedElement = useEditorStore(s => s.setSelectedElement);
  const updateDsl = useEditorStore(s => s.updateDsl);

  const gestureRef = useRef<GestureSession | null>(null);
  const rafRef = useRef<number | null>(null);
  const pendingTransformRef = useRef<LiveTransform | null>(null);
  const [liveTransform, setLiveTransform] = useState<LiveTransform | null>(null);
  const [liveScaleDisplay, setLiveScaleDisplay] = useState<number | null>(null);

  const syncPreviewDom = useCallback((next: LiveTransform) => {
    const session = gestureRef.current;
    const iframe = iframeRef?.current;
    if (!session?.target || !iframe) return;
    const state = useEditorStore.getState();
    const segment = state.dsl?.segments[state.currentSegIndex];
    const dsl = state.dsl;
    if (!segment || !dsl) return;
    patchPreviewDomForGesture(iframe, segment, session.target, next, {
      canvasWidth: dsl.globalConfig.canvas_width ?? 1080,
      canvasHeight: dsl.globalConfig.canvas_height ?? 1920,
      segmentLayout: segment.layout,
    });
  }, [iframeRef]);

  const flushLiveTransform = useCallback(() => {
    rafRef.current = null;
    const next = pendingTransformRef.current;
    if (next) setLiveTransform(next);
  }, []);

  const scheduleLiveTransform = useCallback((next: LiveTransform) => {
    pendingTransformRef.current = next;
    syncPreviewDom(next);
    if (gestureRef.current?.kind === 'resize') {
      setLiveScaleDisplay(Math.round(next.scale));
    }
    if (rafRef.current == null) {
      rafRef.current = requestAnimationFrame(flushLiveTransform);
    }
  }, [flushLiveTransform, syncPreviewDom]);

  const commitTransform = useCallback((target: DragTarget, transform: LiveTransform) => {
    if (!target) return;
    const px = Math.max(0, Math.min(100, Math.round(transform.x)));
    const py = Math.max(0, Math.min(100, Math.round(transform.y)));
    const scale = Math.round(clampScaleForTarget(target.kind, transform.scale));
    updateDsl((draft) => {
      const segs = [...draft.segments];
      const seg = { ...segs[currentSegIndex] };
      if (target.kind === 'object') {
        const objects = [...(seg.objects || [])];
        const object = objects[target.index];
        if (!object) return draft;
        objects[target.index] = {
          ...object,
          position: { x: px, y: py },
          scale,
          rotation: Math.round(transform.rotation),
        };
        seg.objects = objects;
      } else if (target.kind === 'overlay') {
        const overlays = [...seg.overlays];
        const overlay = overlays[target.index];
        if (!overlay) return draft;
        overlays[target.index] = {
          ...overlay,
          position: { x: px, y: py },
          ...bakeOverlayDimensions(overlay, scale),
          rotation: Math.round(transform.rotation),
        };
        seg.overlays = overlays;
      } else if (target.kind === 'digital_human') {
        seg.digital_human = { ...seg.digital_human, position: { x: px, y: py }, scale };
      }
      segs[currentSegIndex] = seg;
      return { ...draft, segments: segs };
    });
  }, [currentSegIndex, updateDsl]);

  const endGesture = useCallback((e: ReactPointerEvent) => {
    setLiveScaleDisplay(null);
    const session = gestureRef.current;
    const preview = pendingTransformRef.current ?? liveTransform;
    if (session?.target && preview) {
      if (suppressPreviewRebuildRef) suppressPreviewRebuildRef.current = true;
      commitTransform(session.target, preview);
      const state = useEditorStore.getState();
      const seg = state.dsl?.segments[state.currentSegIndex];
      const dsl = state.dsl;
      if (seg && dsl && iframeRef?.current) {
        syncDomTargetFromSegment(iframeRef.current, seg, session.target, {
          canvasWidth: dsl.globalConfig.canvas_width ?? 1080,
          canvasHeight: dsl.globalConfig.canvas_height ?? 1920,
          segmentLayout: seg.layout,
        });
      }
    }
    gestureRef.current = null;
    pendingTransformRef.current = null;
    setLiveTransform(null);
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* noop */ }
  }, [commitTransform, iframeRef, liveTransform, suppressPreviewRebuildRef]);

  const hasCanvasSelection = selectedElement.type !== 'none' && selectedElement.segIndex === currentSegIndex;

  useEffect(() => {
    if (!interactionEnabled || !hasCanvasSelection) return;

    const nudge = (dx: number, dy: number) => {
      const state = useEditorStore.getState();
      const draft = state.dsl;
      const segIndex = state.currentSegIndex;
      const sel = state.selectedElement;
      const segment = draft?.segments[segIndex];
      if (!draft || !segment) return;

      state.updateDsl((d) => {
        const segs = [...d.segments];
        const seg = { ...segs[segIndex] };
        const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

        if (sel.type === 'object') {
          const objects = [...(seg.objects || [])];
          const object = objects[sel.objectIndex];
          if (!object || object.locked) return d;
          objects[sel.objectIndex] = {
            ...object,
            position: {
              x: clamp(object.position.x + dx),
              y: clamp(object.position.y + dy),
            },
          };
          seg.objects = objects;
        } else if (sel.type === 'overlay') {
          const overlays = [...seg.overlays];
          const overlay = overlays[sel.overlayIndex];
          if (!overlay) return d;
          overlays[sel.overlayIndex] = {
            ...overlay,
            position: {
              x: clamp(overlay.position.x + dx),
              y: clamp(overlay.position.y + dy),
            },
          };
          seg.overlays = overlays;
        } else if (sel.type === 'digital_human') {
          seg.digital_human = {
            ...seg.digital_human,
            position: {
              x: clamp(seg.digital_human.position.x + dx),
              y: clamp(seg.digital_human.position.y + dy),
            },
          };
        } else {
          return d;
        }

        segs[segIndex] = seg;
        return { ...d, segments: segs };
      });

      const updated = useEditorStore.getState().dsl?.segments[segIndex];
      if (updated && iframeRef?.current) {
        if (suppressPreviewRebuildRef) suppressPreviewRebuildRef.current = true;
        const patchContext = {
          canvasWidth: draft.globalConfig.canvas_width ?? 1080,
          canvasHeight: draft.globalConfig.canvas_height ?? 1920,
          segmentLayout: updated.layout,
        };
        if (sel.type === 'object') {
          syncDomTargetFromSegment(iframeRef.current, updated, { kind: 'object', index: sel.objectIndex }, patchContext);
        } else if (sel.type === 'overlay') {
          syncDomTargetFromSegment(iframeRef.current, updated, { kind: 'overlay', index: sel.overlayIndex }, patchContext);
        } else if (sel.type === 'digital_human') {
          syncDomTargetFromSegment(iframeRef.current, updated, { kind: 'digital_human' }, patchContext);
        }
      }
    };

    const duplicateSelection = () => {
      const state = useEditorStore.getState();
      const draft = state.dsl;
      if (!draft) return;
      const result = duplicateCanvasSelection(draft, state.currentSegIndex, state.selectedElement);
      if (!result) return;
      state.updateDsl(() => result.dsl);
      state.setSelectedElement(result.selection);
    };

    const removeSelection = () => {
      const state = useEditorStore.getState();
      const draft = state.dsl;
      if (!draft) return;
      const next = removeCanvasSelection(draft, state.currentSegIndex, state.selectedElement);
      if (!next) return;
      state.updateDsl(() => next);
      state.setSelectedElement({ type: 'none' });
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable) return;

      if (event.key === 'Escape') {
        setSelectedElement({ type: 'none' });
        return;
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        removeSelection();
        event.preventDefault();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') {
        duplicateSelection();
        event.preventDefault();
        return;
      }

      const step = event.shiftKey ? 1.5 : 0.3;
      switch (event.key) {
        case 'ArrowUp': nudge(0, -step); event.preventDefault(); break;
        case 'ArrowDown': nudge(0, step); event.preventDefault(); break;
        case 'ArrowLeft': nudge(-step, 0); event.preventDefault(); break;
        case 'ArrowRight': nudge(step, 0); event.preventDefault(); break;
        default: break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hasCanvasSelection, interactionEnabled, iframeRef, suppressPreviewRebuildRef, setSelectedElement]);

  const segment = dsl?.segments[currentSegIndex];
  if (!dsl || !interactionEnabled || !segment) return null;

  const { displayW, displayH } = layout;
  const segmentStart = getSegmentStartTime(currentSegIndex);
  const localTime = getSegmentLocalTime(currentTime, segmentStart);
  const segDuration = Number(segment.duration_sec || 5);

  const pctToPx = (x: number, y: number) => ({
    left: (x / 100) * displayW,
    top: (y / 100) * displayH,
  });

  const getCanvasRect = () => (
    document.querySelector('[data-testid="video-canvas"]') as HTMLElement | null
  )?.getBoundingClientRect();

  const startGesture = (
    e: ReactPointerEvent,
    session: GestureSession,
    captureTarget?: HTMLElement,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    gestureRef.current = session;
    const initial: LiveTransform = {
      x: session.origX,
      y: session.origY,
      scale: session.origScale,
      rotation: session.origRotation,
    };
    pendingTransformRef.current = initial;
    setLiveTransform(initial);
    syncPreviewDom(initial);
    (captureTarget ?? e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const session = gestureRef.current;
    if (!session) return;

    if (session.kind === 'drag') {
      const dx = ((e.clientX - session.startClientX) / displayW) * 100;
      const dy = ((e.clientY - session.startClientY) / displayH) * 100;
      scheduleLiveTransform({
        x: session.origX + dx,
        y: session.origY + dy,
        scale: session.origScale,
        rotation: session.origRotation,
      });
      return;
    }

    if (!session.target) return;
    const rect = getCanvasRect();
    if (!rect) return;

    const centerX = rect.left + (session.origX / 100) * displayW;
    const centerY = rect.top + (session.origY / 100) * displayH;

    if (session.kind === 'resize' && session.anchor) {
      const distance = Math.max(8, Math.hypot(e.clientX - centerX, e.clientY - centerY));
      const nextScale = clampScaleForTarget(
        session.target.kind,
        session.origScale * (distance / session.startDist),
      );
      scheduleLiveTransform({
        x: session.origX,
        y: session.origY,
        scale: nextScale,
        rotation: session.origRotation,
      });
      return;
    }

    if (
      session.kind === 'rotate'
      && session.startAngle != null
      && (session.target.kind === 'object' || session.target.kind === 'overlay')
    ) {
      const currentAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);
      scheduleLiveTransform({
        x: session.origX,
        y: session.origY,
        scale: session.origScale,
        rotation: session.origRotation + (currentAngle - session.startAngle),
      });
    }
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

  const selectedObjectIndex = selectedElement.type === 'object' && selectedElement.segIndex === currentSegIndex
    ? selectedElement.objectIndex
    : -1;
  const selectedOverlayIndex = selectedElement.type === 'overlay' && selectedElement.segIndex === currentSegIndex
    ? selectedElement.overlayIndex
    : -1;
  const selectedDigitalHuman = selectedElement.type === 'digital_human' && selectedElement.segIndex === currentSegIndex;

  const selectedObject = selectedObjectIndex >= 0 ? segment.objects?.[selectedObjectIndex] : undefined;
  const selectedOverlay = selectedOverlayIndex >= 0 ? segment.overlays[selectedOverlayIndex] : undefined;

  const resolveTransform = (target: DragTarget, base: LiveTransform): LiveTransform => {
    if (gestureRef.current?.target && liveTransform && targetsMatch(gestureRef.current.target, target)) {
      return liveTransform;
    }
    return base;
  };

  const isTargetGesturing = (target: DragTarget) => (
    gestureRef.current?.target != null
    && liveTransform != null
    && targetsMatch(gestureRef.current.target, target)
  );

  const startResizeGesture = (
    e: ReactPointerEvent<HTMLButtonElement>,
    target: DragTarget,
    transform: LiveTransform,
    anchor: ResizeAnchor,
  ) => {
    const rect = getCanvasRect();
    if (!rect) return;
    const centerX = rect.left + (transform.x / 100) * displayW;
    const centerY = rect.top + (transform.y / 100) * displayH;
    const startDist = Math.max(8, Math.hypot(e.clientX - centerX, e.clientY - centerY));
    startGesture(e, {
      kind: 'resize',
      target,
      anchor,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origX: transform.x,
      origY: transform.y,
      origScale: transform.scale,
      origRotation: transform.rotation,
      startDist,
    }, e.currentTarget);
  };

  const startRotateGesture = (
    e: ReactPointerEvent<HTMLButtonElement>,
    target: DragTarget,
    transform: LiveTransform,
  ) => {
    const rect = getCanvasRect();
    if (!rect) return;
    const centerX = rect.left + (transform.x / 100) * displayW;
    const centerY = rect.top + (transform.y / 100) * displayH;
    const startAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);
    startGesture(e, {
      kind: 'rotate',
      target,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origX: transform.x,
      origY: transform.y,
      origScale: transform.scale,
      origRotation: transform.rotation,
      startDist: 1,
      startAngle,
    }, e.currentTarget);
  };

  return (
    <div
      className="absolute inset-0 z-10 touch-none"
      onPointerMove={onPointerMove}
      onPointerUp={endGesture}
      onPointerCancel={endGesture}
      onClick={() => setSelectedElement({ type: 'none' })}
    >
      {/* Silky live scale indicator (inspired by cenker smooth transform + bottom drag scrub UX) */}
      {liveScaleDisplay != null && (
        <div className="absolute top-3 right-3 z-[70] pointer-events-none rounded-md bg-black/75 backdrop-blur px-3 py-1 text-xs font-mono text-white shadow">
          缩放 <span className="font-semibold">{liveScaleDisplay}</span>%
        </div>
      )}
      {segment.digital_human.enabled && (() => {
        const dhTarget: DragTarget = { kind: 'digital_human' };
        const transform = resolveTransform(dhTarget, {
          x: segment.digital_human.position.x,
          y: segment.digital_human.position.y,
          scale: segment.digital_human.scale,
          rotation: 0,
        });
        const pos = pctToPx(transform.x, transform.y);
        const box = getDigitalHumanBox(transform.scale);
        const selected = selectedDigitalHuman;
        const gesturing = isTargetGesturing(dhTarget);
        const dragging = gesturing && gestureRef.current?.kind === 'drag';
        const transforming = gesturing && gestureRef.current?.kind !== 'drag';
        return (
          <button
            type="button"
            className={`absolute rounded-full ${
              selected ? 'border-transparent' : 'border-2 border-transparent hover:border-primary/40'
            }`}
            style={{
              left: pos.left,
              top: pos.top,
              width: box.width,
              height: box.height,
              transform: 'translate(-50%, -50%)',
              opacity: gesturing ? 0 : 1,
              cursor: dragging ? 'grabbing' : transforming ? 'default' : 'grab',
            }}
            onClick={(e) => { e.stopPropagation(); setSelectedElement({ type: 'digital_human', segIndex: currentSegIndex }); }}
            onPointerDown={(e) => startGesture(e, {
              kind: 'drag',
              target: dhTarget,
              startClientX: e.clientX,
              startClientY: e.clientY,
              origX: segment.digital_human.position.x,
              origY: segment.digital_human.position.y,
              origScale: segment.digital_human.scale,
              origRotation: 0,
              startDist: 1,
            })}
          />
        );
      })()}

      {visibleOverlays.map(({ ov, index }) => {
        const overlayTarget: DragTarget = { kind: 'overlay', index };
        const transform = resolveTransform(overlayTarget, {
          x: ov.position.x,
          y: ov.position.y,
          scale: ov.scale,
          rotation: ov.rotation || 0,
        });
        const pos = pctToPx(transform.x, transform.y);
        const box = getOverlayBox(displayW, displayH, { ...ov, scale: transform.scale });
        const selected = selectedOverlayIndex === index;
        const gesturing = isTargetGesturing(overlayTarget);
        const dragging = gesturing && gestureRef.current?.kind === 'drag';
        const transforming = gesturing && gestureRef.current?.kind !== 'drag';
        return (
          <button
            key={ov.id}
            type="button"
            className={`absolute rounded-md ${
              selected ? 'border-transparent' : 'border-2 border-transparent hover:border-primary/30'
            }`}
            style={{
              left: pos.left,
              top: pos.top,
              width: box.width,
              height: box.height,
              transform: `translate(-50%, -50%) rotate(${transform.rotation}deg)`,
              opacity: gesturing ? 0 : 1,
              cursor: dragging ? 'grabbing' : transforming ? 'default' : 'grab',
            }}
            onClick={(e) => { e.stopPropagation(); setSelectedElement({ type: 'overlay', segIndex: currentSegIndex, overlayIndex: index }); }}
            onPointerDown={(e) => startGesture(e, {
              kind: 'drag',
              target: overlayTarget,
              startClientX: e.clientX,
              startClientY: e.clientY,
              origX: ov.position.x,
              origY: ov.position.y,
              origScale: ov.scale,
              origRotation: ov.rotation || 0,
              startDist: 1,
            })}
          />
        );
      })}

      {visibleObjects.map(({ object, index }) => {
        const objectTarget: DragTarget = { kind: 'object', index };
        const transform = resolveTransform(objectTarget, {
          x: object.position.x,
          y: object.position.y,
          scale: object.scale,
          rotation: object.rotation || 0,
        });
        const pos = pctToPx(transform.x, transform.y);
        const selected = selectedObjectIndex === index;
        const box = getObjectBox(object);
        const scale = transform.scale / 100;
        const w = box.width * scale;
        const h = box.height * scale;
        const gesturing = isTargetGesturing(objectTarget);
        const dragging = gesturing && gestureRef.current?.kind === 'drag';
        const transforming = gesturing && gestureRef.current?.kind !== 'drag';
        return (
          <button
            key={object.id}
            type="button"
            disabled={object.locked}
            className={`absolute rounded-lg ${
              selected ? 'border-transparent' : 'border-2 border-transparent hover:border-primary/30'
            } ${object.locked ? 'cursor-not-allowed' : ''}`}
            style={{
              left: pos.left,
              top: pos.top,
              width: w,
              height: h,
              transform: `translate(-50%, -50%) rotate(${transform.rotation}deg)`,
              opacity: gesturing ? 0 : 1,
              cursor: object.locked ? 'not-allowed' : dragging ? 'grabbing' : transforming ? 'default' : 'grab',
            }}
            onClick={(e) => { e.stopPropagation(); setSelectedElement({ type: 'object', segIndex: currentSegIndex, objectIndex: index }); }}
            onPointerDown={(e) => !object.locked && startGesture(e, {
              kind: 'drag',
              target: { kind: 'object', index },
              startClientX: e.clientX,
              startClientY: e.clientY,
              origX: object.position.x,
              origY: object.position.y,
              origScale: object.scale,
              origRotation: object.rotation || 0,
              startDist: 1,
            })}
          />
        );
      })}

      {showSubtitleOverlay && segment.subtitle.enabled && (() => {
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
        const subtitleFont = resolveSubtitleFontFamily({
          fontFamily: segment.subtitle.font_family,
          globalSubtitleFontFamily: dsl.globalConfig.subtitle_font_family,
          defaultFontFamily: dsl.globalConfig.default_font_family,
        });
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
              fontFamily: subtitleFont,
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

      {selectedObject && selectedObject.visible !== false && !selectedObject.locked && (() => {
        const objectTarget: DragTarget = { kind: 'object', index: selectedObjectIndex };
        const transform = resolveTransform(objectTarget, {
          x: selectedObject.position.x,
          y: selectedObject.position.y,
          scale: selectedObject.scale,
          rotation: selectedObject.rotation || 0,
        });
        const box = getObjectBox(selectedObject);
        return (
          <TransformOverlay
            transform={transform}
            layout={layout}
            width={box.width * (transform.scale / 100)}
            height={box.height * (transform.scale / 100)}
            shape="rect"
            rotateEnabled
            resizeTestId="object-resize-handle"
            onStartResize={(e, anchor) => startResizeGesture(e, objectTarget, transform, anchor)}
            onStartRotate={(e) => startRotateGesture(e, objectTarget, transform)}
          />
        );
      })()}

      {selectedOverlay && (() => {
        const overlayTarget: DragTarget = { kind: 'overlay', index: selectedOverlayIndex };
        const transform = resolveTransform(overlayTarget, {
          x: selectedOverlay.position.x,
          y: selectedOverlay.position.y,
          scale: selectedOverlay.scale,
          rotation: selectedOverlay.rotation || 0,
        });
        const box = getOverlayBox(displayW, displayH, { ...selectedOverlay, scale: transform.scale });
        return (
          <TransformOverlay
            transform={transform}
            layout={layout}
            width={box.width}
            height={box.height}
            shape="rect"
            rotateEnabled
            resizeTestId="overlay-resize-handle"
            onStartResize={(e, anchor) => startResizeGesture(e, overlayTarget, transform, anchor)}
            onStartRotate={(e) => startRotateGesture(e, overlayTarget, transform)}
          />
        );
      })()}

      {selectedDigitalHuman && segment.digital_human.enabled && (() => {
        const dhTarget: DragTarget = { kind: 'digital_human' };
        const transform = resolveTransform(dhTarget, {
          x: segment.digital_human.position.x,
          y: segment.digital_human.position.y,
          scale: segment.digital_human.scale,
          rotation: 0,
        });
        const box = getDigitalHumanBox(transform.scale);
        return (
          <TransformOverlay
            transform={transform}
            layout={layout}
            width={box.width}
            height={box.height}
            shape="circle"
            resizeTestId="digital-human-resize-handle"
            onStartResize={(e, anchor) => startResizeGesture(e, dhTarget, transform, anchor)}
          />
        );
      })()}
    </div>
  );
}

function TransformOverlay({
  transform,
  layout,
  width,
  height,
  shape,
  rotateEnabled = false,
  resizeTestId,
  onStartResize,
  onStartRotate,
}: {
  transform: LiveTransform;
  layout: Layout;
  width: number;
  height: number;
  shape: 'rect' | 'circle';
  rotateEnabled?: boolean;
  resizeTestId?: string;
  onStartResize: (e: ReactPointerEvent<HTMLButtonElement>, anchor: ResizeAnchor) => void;
  onStartRotate?: (e: ReactPointerEvent<HTMLButtonElement>) => void;
}) {
  const center = {
    left: (transform.x / 100) * layout.displayW,
    top: (transform.y / 100) * layout.displayH,
  };
  const halfW = width / 2;
  const halfH = height / 2;
  const anchors: ResizeAnchor[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

  return (
    <div
      className="absolute pointer-events-none z-20"
      style={{
        left: center.left,
        top: center.top,
        width,
        height,
        transform: `translate(-50%, -50%) rotate(${transform.rotation}deg)`,
      }}
    >
      <div
        className={`absolute inset-0 ${shape === 'circle' ? 'rounded-full' : 'rounded-lg'}`}
        style={{
          border: `2px dashed ${PRIMARY}`,
          boxShadow: '0 0 0 1px rgba(255,255,255,0.35)',
        }}
      />

      {anchors.map((anchor) => {
        const offset = cornerOffset(anchor, halfW, halfH);
        return (
          <button
            key={anchor}
            type="button"
            data-testid={anchor === 'bottom-right' ? resizeTestId : undefined}
            aria-label={`${anchor} 缩放手柄`}
            className="absolute pointer-events-auto rounded-full bg-white shadow-sm"
            style={{
              left: `calc(50% + ${offset.x}px)`,
              top: `calc(50% + ${offset.y}px)`,
              width: HANDLE_SIZE,
              height: HANDLE_SIZE,
              transform: 'translate(-50%, -50%)',
              border: `1.5px solid ${PRIMARY}`,
              cursor: anchorCursor(anchor),
            }}
            onPointerDown={(e) => onStartResize(e, anchor)}
            onClick={(e) => e.stopPropagation()}
          />
        );
      })}

      {rotateEnabled && onStartRotate && (
        <button
          type="button"
          aria-label="旋转手柄"
          className="absolute pointer-events-auto rounded-full bg-white shadow-sm"
          style={{
            left: '50%',
            top: `calc(50% - ${halfH + 18}px)`,
            width: HANDLE_SIZE,
            height: HANDLE_SIZE,
            transform: 'translate(-50%, -50%)',
            border: `1.5px solid ${PRIMARY}`,
            cursor: 'grab',
          }}
          onPointerDown={onStartRotate}
          onClick={(e) => e.stopPropagation()}
        />
      )}
    </div>
  );
}