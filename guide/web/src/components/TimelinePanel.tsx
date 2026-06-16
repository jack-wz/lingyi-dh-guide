import { useEffect, useMemo, useRef, useState } from 'react';
import { useEditorStore } from '../store/editorStore';
import { resolveElementTiming } from '../utils/elementTiming';
import { IconPlay, IconPause } from './Icons';

const TRACK_HEIGHT = 32;
const SECOND_WIDTH = 40;
const LABEL_WIDTH = 80;

interface TrackClip {
  id: string;
  segIndex: number;
  startTime: number;
  duration: number;
  text: string;
}

interface ElementClip {
  id: string;
  kind: 'object' | 'overlay';
  subIndex: number;
  label: string;
  startTime: number;
  duration: number;
  visible: boolean;
  locked: boolean;
}

export default function TimelinePanel() {
  const dsl = useEditorStore(s => s.dsl);
  const currentSegIndex = useEditorStore(s => s.currentSegIndex);
  const currentTime = useEditorStore(s => s.currentTime);
  const playing = useEditorStore(s => s.playing);
  const selectedElement = useEditorStore(s => s.selectedElement);
  const updateDsl = useEditorStore(s => s.updateDsl);
  const setCurrentSegIndex = useEditorStore(s => s.setCurrentSegIndex);
  const setSelectedElement = useEditorStore(s => s.setSelectedElement);
  const seekToTime = useEditorStore(s => s.seekToTime);
  const togglePlayback = useEditorStore(s => s.togglePlayback);
  const getSegmentStartTime = useEditorStore(s => s.getSegmentStartTime);

  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [scrubbing, setScrubbing] = useState(false);
  const [draggingEl, setDraggingEl] = useState<{
    id: string;
    pointerId: number;
    startX: number;
    origStartTime: number;
    sceneDuration: number;
    elDuration: number;
    kind: 'object' | 'overlay';
    subIndex: number;
  } | null>(null);

  const segments = dsl?.segments ?? [];
  const totalDuration = Math.max(segments.reduce((sum, s) => sum + Number(s.duration_sec || 0), 0), 1);
  const selectedSeg = segments[currentSegIndex];

  const { videoClips, audioClips, captionClips } = useMemo(() => {
    let cursor = 0;
    const video: TrackClip[] = [];
    const audio: TrackClip[] = [];
    const caption: TrackClip[] = [];
    segments.forEach((seg, si) => {
      const dur = Number(seg.duration_sec || 5);
      const text = (seg.narration_text || '').slice(0, 20) + ((seg.narration_text?.length || 0) > 20 ? '…' : '');
      const base = {
        segIndex: si,
        startTime: cursor,
        duration: dur,
        text: text || `分镜 ${si + 1}`,
      };
      video.push({ id: `clip-${seg.id}`, ...base });
      if (seg.segment_bgm_url || seg.narration_text) {
        audio.push({ id: `clip-audio-${seg.id}`, ...base, text: seg.segment_bgm_url ? 'BGM' : '语音' });
      }
      if (seg.subtitle.enabled && seg.narration_text) {
        caption.push({ id: `clip-sub-${seg.id}`, ...base });
      }
      cursor += dur;
    });
    return { videoClips: video, audioClips: audio, captionClips: caption };
  }, [segments]);

  const elementTrack = useMemo(() => {
    if (!selectedSeg) return null;
    const sceneStart = getSegmentStartTime(currentSegIndex);
    const sceneDur = Number(selectedSeg.duration_sec || 5);
    const items: ElementClip[] = [];

    (selectedSeg.objects || []).forEach((obj, oi) => {
      if (obj.visible === false) return;
      const timing = resolveElementTiming(obj, sceneDur);
      items.push({
        id: `obj-${obj.id}`,
        kind: 'object',
        subIndex: oi,
        label: obj.label || obj.type,
        startTime: timing.start,
        duration: timing.duration,
        visible: true,
        locked: !!obj.locked,
      });
    });

    selectedSeg.overlays.forEach((ov, oi) => {
      const timing = resolveElementTiming(ov, sceneDur);
      items.push({
        id: `ov-${ov.id}`,
        kind: 'overlay',
        subIndex: oi,
        label: ov.asset_url ? '素材' : '叠加',
        startTime: timing.start,
        duration: timing.duration,
        visible: true,
        locked: false,
      });
    });

    return {
      sceneStart,
      sceneDur,
      elements: items,
    };
  }, [selectedSeg, currentSegIndex, getSegmentStartTime]);

  const width = Math.max(600, totalDuration * SECOND_WIDTH * zoom);

  useEffect(() => {
    if (!scrubbing) return;
    const handleMove = (e: PointerEvent) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left + container.scrollLeft - LABEL_WIDTH;
      const time = Math.max(0, Math.min(x / (SECOND_WIDTH * zoom), totalDuration));
      seekToTime(time, { syncSegment: true, clearSelection: false, stopPlayback: true });
    };
    const handleUp = () => setScrubbing(false);
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp, { once: true });
    return () => window.removeEventListener('pointermove', handleMove);
  }, [scrubbing, seekToTime, totalDuration, zoom]);

  if (!dsl) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        加载时间轴…
      </div>
    );
  }

  const selectScene = (segIndex: number) => {
    setCurrentSegIndex(segIndex);
    seekToTime(getSegmentStartTime(segIndex), { syncSegment: true, clearSelection: false, stopPlayback: true });
  };

  const updateTimedElement = (
    kind: 'object' | 'overlay',
    subIndex: number,
    patch: Partial<{ seg_start_time: number; duration: number; visible: boolean; locked: boolean }>,
  ) => {
    updateDsl((draft) => {
      const segs = [...draft.segments];
      const seg = { ...segs[currentSegIndex], overlays: [...segs[currentSegIndex].overlays], objects: [...(segs[currentSegIndex].objects || [])] };
      if (kind === 'object') {
        const objects = [...(seg.objects || [])];
        objects[subIndex] = { ...objects[subIndex], ...patch };
        seg.objects = objects;
      } else {
        const overlays = [...seg.overlays];
        overlays[subIndex] = { ...overlays[subIndex], ...patch };
        seg.overlays = overlays;
      }
      segs[currentSegIndex] = seg;
      return { ...draft, segments: segs };
    });
  };

  const isElementSelected = (el: ElementClip) => {
    if (el.kind === 'object' && selectedElement.type === 'object') {
      return selectedElement.segIndex === currentSegIndex && selectedElement.objectIndex === el.subIndex;
    }
    if (el.kind === 'overlay' && selectedElement.type === 'overlay') {
      return selectedElement.segIndex === currentSegIndex && selectedElement.overlayIndex === el.subIndex;
    }
    return false;
  };

  const renderTrack = (
    name: string,
    clips: TrackClip[],
    variant: 'video' | 'audio' | 'caption',
  ) => (
    <div className="flex items-center border-b border-border/50" style={{ height: TRACK_HEIGHT + 8 }}>
      <div
        className="sticky left-0 z-10 flex shrink-0 items-center border-r border-border bg-card px-2 text-[10px] font-medium text-muted-foreground"
        style={{ width: LABEL_WIDTH, height: TRACK_HEIGHT }}
      >
        {name}
      </div>
      <div className="relative flex-1" style={{ height: TRACK_HEIGHT }}>
        {clips.map((clip) => {
          const isSelected = clip.segIndex === currentSegIndex;
          const variantClass = variant === 'video'
            ? 'border-brand-blue/40 bg-brand-blue/10 text-brand-blue'
            : variant === 'audio'
              ? 'border-brand-green/40 bg-brand-green/10 text-brand-green'
              : 'border-brand-amber/40 bg-brand-amber/10 text-brand-amber';
          return (
            <button
              key={clip.id}
              type="button"
              onClick={() => selectScene(clip.segIndex)}
              className={`absolute top-0 flex items-center overflow-hidden rounded border px-2 text-[10px] transition ${
                isSelected ? 'border-brand-blue bg-brand-blue/15 text-foreground ring-1 ring-brand-blue' : variantClass
              }`}
              style={{
                left: clip.startTime * SECOND_WIDTH * zoom,
                width: Math.max(24, clip.duration * SECOND_WIDTH * zoom),
                height: TRACK_HEIGHT,
              }}
              title={clip.text}
            >
              <span className="truncate">{clip.text}</span>
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="flex h-full flex-col bg-card">
      <div className="flex items-center justify-between border-b border-border px-3 py-2 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-foreground">时间轴</span>
          <button
            type="button"
            onClick={togglePlayback}
            className="w-7 h-7 rounded-md flex items-center justify-center bg-secondary hover:bg-accent text-foreground"
            title={playing ? '暂停' : '播放'}
          >
            {playing ? <IconPause size={14} /> : <IconPlay size={14} />}
          </button>
          <span className="text-[10px] text-muted-foreground tabular-nums" data-testid="timeline-time">
            {currentTime.toFixed(1)}s / {totalDuration.toFixed(1)}s
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setZoom(z => Math.max(0.5, z - 0.25))} className="rounded-md bg-secondary px-2 py-1 text-[11px] hover:bg-accent">−</button>
          <span className="w-10 text-center text-[11px] text-muted-foreground">{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => setZoom(z => Math.min(2, z + 0.25))} className="rounded-md bg-secondary px-2 py-1 text-[11px] hover:bg-accent">+</button>
        </div>
      </div>

      <div ref={containerRef} className="flex-1 overflow-auto min-h-0">
        <div className="relative" style={{ width: width + LABEL_WIDTH, minHeight: '100%' }}>
          <div className="sticky top-0 z-10 flex h-6 border-b border-border bg-card/95 backdrop-blur" style={{ width: width + LABEL_WIDTH }}>
            <div style={{ width: LABEL_WIDTH }} className="shrink-0 border-r border-border" />
            <div className="relative flex" style={{ width }}>
              {Array.from({ length: Math.ceil(totalDuration) + 1 }).map((_, i) => (
                <div
                  key={i}
                  className="border-l border-border/60 pl-1 text-[9px] text-muted-foreground shrink-0"
                  style={{ width: SECOND_WIDTH * zoom }}
                >
                  {i}s
                </div>
              ))}
            </div>
          </div>

          <div
            className="absolute top-0 bottom-0 z-20 w-px cursor-ew-resize bg-destructive"
            style={{ left: LABEL_WIDTH + currentTime * SECOND_WIDTH * zoom }}
            onPointerDown={(e) => { e.stopPropagation(); setScrubbing(true); }}
          >
            <div className="absolute -top-1 -left-1.5 h-3 w-3 rounded-full bg-destructive" />
          </div>

          <div
            className="py-1"
            onPointerDown={(e) => {
              if (e.target !== e.currentTarget || !containerRef.current) return;
              const rect = containerRef.current.getBoundingClientRect();
              const x = e.clientX - rect.left + containerRef.current.scrollLeft - LABEL_WIDTH;
              const time = Math.max(0, Math.min(x / (SECOND_WIDTH * zoom), totalDuration));
              seekToTime(time, { syncSegment: true, clearSelection: false, stopPlayback: true });
              setScrubbing(true);
            }}
          >
            {renderTrack('视频', videoClips, 'video')}
            {audioClips.length > 0 && renderTrack('音频', audioClips, 'audio')}
            {captionClips.length > 0 && renderTrack('字幕', captionClips, 'caption')}

            {elementTrack && (
              <div
                className="flex items-start border-b border-border/50"
                style={{ minHeight: Math.max(TRACK_HEIGHT + 8, elementTrack.elements.length * 28 + 8) }}
              >
                <div
                  className="sticky left-0 z-10 flex shrink-0 items-center border-r border-border bg-card px-2 text-[10px] font-medium text-muted-foreground"
                  style={{ width: LABEL_WIDTH, minHeight: TRACK_HEIGHT }}
                >
                  元素层
                </div>
                <div className="relative flex-1 py-1" style={{ minHeight: TRACK_HEIGHT }}>
                  <div
                    className="absolute top-1 h-7 rounded border border-dashed border-border bg-secondary/40"
                    style={{
                      left: elementTrack.sceneStart * SECOND_WIDTH * zoom,
                      width: Math.max(24, elementTrack.sceneDur * SECOND_WIDTH * zoom),
                    }}
                  />
                  {elementTrack.elements.map((el, index) => {
                    const selected = isElementSelected(el);
                    return (
                      <button
                        key={el.id}
                        type="button"
                        onClick={() => {
                          selectScene(currentSegIndex);
                          if (el.kind === 'object') {
                            setSelectedElement({ type: 'object', segIndex: currentSegIndex, objectIndex: el.subIndex });
                          } else {
                            setSelectedElement({ type: 'overlay', segIndex: currentSegIndex, overlayIndex: el.subIndex });
                          }
                        }}
                        onPointerDown={(e) => {
                          if (el.locked) return;
                          e.stopPropagation();
                          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                          setDraggingEl({
                            id: el.id,
                            pointerId: e.pointerId,
                            startX: e.clientX,
                            origStartTime: el.startTime,
                            sceneDuration: elementTrack.sceneDur,
                            elDuration: el.duration,
                            kind: el.kind,
                            subIndex: el.subIndex,
                          });
                        }}
                        onPointerMove={(e) => {
                          if (!draggingEl || draggingEl.id !== el.id || el.locked) return;
                          const dx = e.clientX - draggingEl.startX;
                          const dt = dx / (SECOND_WIDTH * zoom);
                          const maxStart = Math.max(0, draggingEl.sceneDuration - draggingEl.elDuration);
                          const newStart = Math.max(0, Math.min(draggingEl.origStartTime + dt, maxStart));
                          updateTimedElement(draggingEl.kind, draggingEl.subIndex, { seg_start_time: Math.round(newStart * 2) / 2 });
                        }}
                        onPointerUp={(e) => {
                          if (!draggingEl || draggingEl.id !== el.id) return;
                          (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
                          setDraggingEl(null);
                        }}
                        className={`absolute flex h-7 cursor-grab items-center gap-1 rounded border px-2 text-[10px] transition active:cursor-grabbing ${
                          selected
                            ? 'border-brand-blue bg-brand-blue/15 text-foreground ring-1 ring-brand-blue'
                            : 'border-border bg-background text-muted-foreground hover:bg-accent'
                        } ${el.visible ? '' : 'opacity-50'} ${el.locked ? 'cursor-not-allowed opacity-60' : ''}`}
                        style={{
                          left: (elementTrack.sceneStart + el.startTime) * SECOND_WIDTH * zoom,
                          width: Math.max(48, el.duration * SECOND_WIDTH * zoom),
                          top: 4 + index * 28,
                        }}
                        title={el.label}
                      >
                        <span className="truncate">{el.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}