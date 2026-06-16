import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { useEditorStore } from '../store/editorStore';
import type { Segment, TrackId } from '../store/editorStore';
import { IconFilm, IconMic, IconType, IconImage, IconPlus, IconTrash, IconMusic } from './Icons';

const TRACK_HEIGHT = 44;
const RULER_HEIGHT = 28;
const HEADER_WIDTH = 100;
const MIN_PX_PER_SEC = 20;
const MAX_PX_PER_SEC = 200;

const TYPE_COLORS: Record<string, { bg: string; border: string; label: string }> = {
  narration: { bg: '#3B82F6', border: '#60A5FA', label: '口播' },
  product: { bg: '#10B981', border: '#34D399', label: '产品' },
  scene: { bg: '#8B5CF6', border: '#A78BFA', label: '场景' },
  transition: { bg: '#F59E0B', border: '#FBBF24', label: '转场' },
  ending: { bg: '#EC4899', border: '#F472B6', label: '结尾' },
};

interface ClipItem {
  id: string;
  trackId: TrackId;
  startTime: number;
  duration: number;
  label: string;
  color: string;
  borderColor: string;
  segIndex: number;
  subIndex?: number;
}

export default function Timeline() {
  const dsl = useEditorStore(s => s.dsl);
  const currentSegIndex = useEditorStore(s => s.currentSegIndex);
  const setCurrentSegIndex = useEditorStore(s => s.setCurrentSegIndex);
  const updateDsl = useEditorStore(s => s.updateDsl);
  const reorderSegment = useEditorStore(s => s.reorderSegment);
  const setCurrentTime = useEditorStore(s => s.setCurrentTime);
  const timelineZoom = useEditorStore(s => s.timelineZoom);
  const setTimelineZoom = useEditorStore(s => s.setTimelineZoom);
  const mutedTracks = useEditorStore(s => s.mutedTracks);
  const toggleMuteTrack = useEditorStore(s => s.toggleMuteTrack);
  const setSelectedElement = useEditorStore(s => s.setSelectedElement);

  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<{ clipId: string; startX: number; origStart: number; lastX: number } | null>(null);
  const [playheadTime, setPlayheadTime] = useState(0);
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
  const [resizing, setResizing] = useState<{ clipId: string; edge: 'left' | 'right'; startX: number; origStart: number; origDur: number } | null>(null);
  const [dragging, setDragging] = useState<{ clipId: string; startX: number; origStart: number; lastX: number } | null>(null);

  if (!dsl) return null;

  const segments = dsl.segments;
  const totalDuration = Math.max(segments.reduce((a, s) => a + s.duration_sec, 0), 10);
  const pxPerSec = MIN_PX_PER_SEC + (MAX_PX_PER_SEC - MIN_PX_PER_SEC) * ((timelineZoom - 0.5) / 3.5);
  const timelineWidth = totalDuration * pxPerSec;

  // 构建所有 clip (memoized)
  const clips = useMemo(() => {
    const result: ClipItem[] = [];
    let accTime = 0;
    segments.forEach((seg, si) => {
      const tc = TYPE_COLORS[seg.type] || TYPE_COLORS.narration;
      result.push({
        id: seg.id, trackId: 'video', startTime: accTime, duration: seg.duration_sec,
        label: `${tc.label} ${seg.narration_text?.slice(0, 8) || ''} ${seg.duration_sec}s`,
        color: tc.bg, borderColor: tc.border, segIndex: si,
      });
      if (seg.segment_bgm_url || seg.narration_text) {
        result.push({
          id: `${seg.id}-audio`, trackId: 'audio', startTime: accTime, duration: seg.duration_sec,
          label: seg.segment_bgm_url ? '背景音乐' : '语音',
          color: '#6366F1', borderColor: '#818CF8', segIndex: si,
        });
      }
      if (seg.subtitle.enabled && seg.narration_text) {
        result.push({
          id: `${seg.id}-sub`, trackId: 'subtitle', startTime: accTime, duration: seg.duration_sec,
          label: seg.narration_text.slice(0, 12),
          color: '#EAB308', borderColor: '#FACC15', segIndex: si,
        });
      }
      seg.overlays.forEach((ov, oi) => {
        result.push({
          id: ov.id, trackId: 'overlay', startTime: accTime + ov.seg_start_time, duration: ov.duration,
          label: ov.asset_url ? '素材' : '叠加',
          color: '#14B8A6', borderColor: '#2DD4BF', segIndex: si, subIndex: oi,
        });
      });
      accTime += seg.duration_sec;
    });
    return result;
  }, [segments]);

  const tracks: { id: TrackId; label: string; icon: typeof IconFilm }[] = [
    { id: 'video', label: '视频', icon: IconFilm },
    { id: 'audio', label: '音频', icon: IconMusic },
    { id: 'subtitle', label: '字幕', icon: IconType },
    { id: 'overlay', label: '叠加', icon: IconImage },
  ];

  // 播放头拖拽
  const handleRulerMouseDown = useCallback((e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left + (containerRef.current?.scrollLeft || 0);
    const nextTime = Math.max(0, Math.min(totalDuration, x / pxPerSec));
    setPlayheadTime(nextTime);
    setCurrentTime(nextTime);
    setIsDraggingPlayhead(true);
  }, [pxPerSec, totalDuration, setCurrentTime]);

  useEffect(() => {
    if (!isDraggingPlayhead) return;
    const handleMove = (e: MouseEvent) => {
      const ruler = containerRef.current;
      if (!ruler) return;
      const rect = ruler.getBoundingClientRect();
      const x = e.clientX - rect.left - HEADER_WIDTH + ruler.scrollLeft;
      const nextTime = Math.max(0, Math.min(totalDuration, x / pxPerSec));
      setPlayheadTime(nextTime);
      setCurrentTime(nextTime);
    };
    const handleUp = () => setIsDraggingPlayhead(false);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => { window.removeEventListener('mousemove', handleMove); window.removeEventListener('mouseup', handleUp); };
  }, [isDraggingPlayhead, pxPerSec, totalDuration, setCurrentTime]);

  // Clip 边缘拖拽调整时长
  const handleClipEdgeMouseDown = useCallback((e: React.MouseEvent, clip: ClipItem, edge: 'left' | 'right') => {
    e.stopPropagation();
    setResizing({ clipId: clip.id, edge, startX: e.clientX, origStart: clip.startTime, origDur: clip.duration });
  }, []);

  useEffect(() => {
    if (!resizing) return;
    const handleMove = (e: MouseEvent) => {
      const dx = e.clientX - resizing.startX;
      const dt = dx / pxPerSec;
      updateDsl(d => {
        const segs = [...d.segments];
        const clip = clips.find(c => c.id === resizing.clipId);
        if (!clip) return d;
        const seg = segs[clip.segIndex];
        if (!seg) return d;
        if (resizing.edge === 'right') {
          const newDur = Math.max(1, resizing.origDur + dt);
          segs[clip.segIndex] = { ...seg, duration_sec: Math.round(newDur * 2) / 2 };
        } else {
          const newDur = Math.max(1, resizing.origDur - dt);
          segs[clip.segIndex] = { ...seg, duration_sec: Math.round(newDur * 2) / 2 };
        }
        return { ...d, segments: segs };
      });
    };
    const handleUp = () => setResizing(null);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => { window.removeEventListener('mousemove', handleMove); window.removeEventListener('mouseup', handleUp); };
  }, [resizing, pxPerSec, clips, updateDsl]);

  // Clip 整体拖拽
  const handleClipMouseDown = useCallback((e: React.MouseEvent, clip: ClipItem) => {
    if (clip.trackId !== 'video') return;
    e.stopPropagation();
    const nextDragging = { clipId: clip.id, startX: e.clientX, origStart: clip.startTime, lastX: e.clientX };
    draggingRef.current = nextDragging;
    setDragging(nextDragging);
    setCurrentSegIndex(clip.segIndex);
  }, [setCurrentSegIndex]);

  useEffect(() => {
    if (!dragging) return;
    const handleMove = (e: MouseEvent) => {
      if (draggingRef.current) draggingRef.current = { ...draggingRef.current, lastX: e.clientX };
      setDragging((current) => current ? { ...current, lastX: e.clientX } : current);
    };
    const handleUp = () => {
      const latest = useEditorStore.getState();
      const current = draggingRef.current || dragging;
      const clip = clips.find(c => c.id === current.clipId && c.trackId === 'video');
      if (clip) {
        const dx = current.lastX - current.startX;
        if (Math.abs(dx) > 18) {
          const newStart = Math.max(0, current.origStart + dx / pxPerSec);
          const centerTime = newStart + clip.duration / 2;
          let acc = 0;
          let targetIndex = latest.dsl ? latest.dsl.segments.length - 1 : clip.segIndex;
          for (let i = 0; i < segments.length; i += 1) {
            const midpoint = acc + segments[i].duration_sec / 2;
            if (centerTime <= midpoint) {
              targetIndex = i;
              break;
            }
            acc += segments[i].duration_sec;
          }
          reorderSegment(clip.segIndex, targetIndex);
        }
      }
      draggingRef.current = null;
      setDragging(null);
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => { window.removeEventListener('mousemove', handleMove); window.removeEventListener('mouseup', handleUp); };
  }, [dragging, clips, pxPerSec, reorderSegment, segments]);

  // 时间刻度
  const timeMarks: number[] = [];
  const step = timelineZoom >= 2 ? 1 : timelineZoom >= 1 ? 2 : 5;
  for (let t = 0; t <= totalDuration; t += step) timeMarks.push(t);

  const addSegment = () => {
    updateDsl(d => ({
      ...d, segments: [...d.segments, {
        id: `seg-${Date.now()}`, type: 'narration', narration_text: '', duration_sec: 5,
        scene_image_url: '', scene_description: '', camera_shot: '', segment_bgm_url: '',
        subtitle: { enabled: true, style_id: 'default', position: 'bottom', animation: 'fadeIn' },
        transition: { type: 'none', duration: 0.5 },
        digital_human: { enabled: false, position: { x: 50, y: 80 }, scale: 100 },
        overlays: [],
        thumbnail_url: '',
        diagnostics: [],
        layout: 'avatar-center',
        avatar_id: '',
        voice_id: '',
        objects: [],
      }],
    }));
  };

  return (
    <div className="bg-background border-t border-border flex flex-col shrink-0 select-none">
      {/* 工具栏 */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-card/50 border-b border-border/50">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">时间轴</span>
          <div className="flex items-center gap-1 bg-secondary/50 rounded px-1.5 py-0.5">
            <button onClick={() => setTimelineZoom(timelineZoom - 0.25)} className="text-muted-foreground hover:text-foreground text-xs px-1">−</button>
            <span className="text-[9px] text-muted-foreground w-8 text-center">{Math.round(timelineZoom * 100)}%</span>
            <button onClick={() => setTimelineZoom(timelineZoom + 0.25)} className="text-muted-foreground hover:text-foreground text-xs px-1">+</button>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground tabular-nums">{playheadTime.toFixed(1)}s / {totalDuration.toFixed(1)}s</span>
          <button onClick={addSegment} className="h-7 px-2 text-[10px] bg-primary/80 text-primary-foreground rounded-md hover:bg-primary transition flex items-center gap-1"><IconPlus size={12} /> 片段</button>
        </div>
      </div>

      {/* 时间轴主体 */}
      <div className="flex overflow-hidden" style={{ height: tracks.length * TRACK_HEIGHT + RULER_HEIGHT + 8 }}>
        {/* 左侧轨道头 */}
        <div style={{ width: HEADER_WIDTH }} className="shrink-0 flex flex-col">
          {/* 时间标尺占位 */}
          <div style={{ height: RULER_HEIGHT }} className="flex items-end px-2 pb-1">
            <span className="text-[9px] text-muted-foreground/60">时间</span>
          </div>
          {/* 轨道标签 */}
          {tracks.map(t => (
            <div key={t.id} style={{ height: TRACK_HEIGHT }} className="flex items-center justify-between px-2 border-b border-border">
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                <t.icon size={14} /><span>{t.label}</span>
              </span>
              <button onClick={() => toggleMuteTrack(t.id)}
                className={`text-[8px] px-1 py-0.5 rounded ${mutedTracks.has(t.id) ? 'bg-destructive/20 text-destructive' : 'text-muted-foreground/60 hover:text-muted-foreground'}`}>
                {mutedTracks.has(t.id) ? '静' : '♪'}
              </button>
            </div>
          ))}
        </div>

        {/* 右侧时间轴区域（可滚动） */}
        <div ref={containerRef} className="flex-1 overflow-x-auto overflow-y-hidden relative"
          onScroll={(e) => useEditorStore.getState().setTimelineScrollLeft(e.currentTarget.scrollLeft)}>
          <div style={{ width: timelineWidth, minHeight: tracks.length * TRACK_HEIGHT + RULER_HEIGHT + 8 }} className="relative">
            {/* 时间标尺 */}
            <div style={{ height: RULER_HEIGHT }}
              className="sticky top-0 z-10 bg-card/90 backdrop-blur border-b border-border cursor-pointer"
              onMouseDown={handleRulerMouseDown}>
              {timeMarks.map(t => (
                <div key={t} className="absolute bottom-0 flex flex-col items-center" style={{ left: t * pxPerSec }}>
                  <div className="w-px h-2 bg-muted" />
                  <span className="text-[8px] text-muted-foreground mb-0.5">{t}s</span>
                </div>
              ))}
              {/* 小刻度 */}
              {Array.from({ length: Math.ceil(totalDuration / (step / 2)) }, (_, i) => i * (step / 2))
                .filter(t => !timeMarks.includes(t) && t <= totalDuration)
                .map(t => (
                  <div key={`m${t}`} className="absolute bottom-0" style={{ left: t * pxPerSec }}>
                    <div className="w-px h-1 bg-secondary" />
                  </div>
                ))}
            </div>

            {/* 播放头 */}
            <div className="absolute top-0 bottom-0 w-px bg-destructive z-30 pointer-events-none"
              style={{ left: playheadTime * pxPerSec, top: RULER_HEIGHT }}>
              <div className="absolute -top-0 -left-[5px] w-[11px] h-3 bg-destructive"
                style={{ clipPath: 'polygon(0 0, 100% 0, 50% 100%)' }} />
            </div>

            {/* 轨道 */}
            {tracks.map((track, ti) => {
              const trackClips = clips.filter(c => c.trackId === track.id);
              const y = RULER_HEIGHT + ti * TRACK_HEIGHT;
              return (
                <div key={track.id} className="absolute left-0 right-0 border-b border-border/50"
                  style={{ top: y, height: TRACK_HEIGHT }}>
                  {/* 网格线 */}
                  {timeMarks.map(t => (
                    <div key={t} className="absolute top-0 bottom-0 w-px bg-card/30" style={{ left: t * pxPerSec }} />
                  ))}
                  {/* Clips */}
                  {trackClips.map(clip => {
                    const left = clip.startTime * pxPerSec;
                    const width = Math.max(clip.duration * pxPerSec, 20);
                    const isActive = clip.segIndex === currentSegIndex;
                    return (
                      <div
                        key={clip.id}
                        className={`absolute top-1 bottom-1 rounded-md cursor-pointer transition-shadow group ${
                          isActive ? 'ring-2 ring-white/80 shadow-lg z-10' : 'hover:brightness-110 z-0'
                        }`}
                        style={{
                          left, width, backgroundColor: clip.color + 'CC',
                          borderLeft: `2px solid ${clip.borderColor}`,
                          borderRight: `2px solid ${clip.borderColor}`,
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setCurrentSegIndex(clip.segIndex);
                          if (track.id === 'overlay' && clip.subIndex !== undefined) {
                            setSelectedElement({ type: 'overlay', segIndex: clip.segIndex, overlayIndex: clip.subIndex });
                          } else if (track.id === 'subtitle') {
                            setSelectedElement({ type: 'subtitle', segIndex: clip.segIndex });
                          } else {
                            setSelectedElement({ type: 'scene', segIndex: clip.segIndex });
                          }
                        }}
                        onMouseDown={(e) => handleClipMouseDown(e, clip)}
                      >
                        {/* 左边缘拖拽 */}
                        <div className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize opacity-0 group-hover:opacity-100 hover:bg-white/30 transition"
                          onMouseDown={(e) => handleClipEdgeMouseDown(e, clip, 'left')} />
                        {/* 内容 */}
                        <div className="h-full flex items-center px-2 overflow-hidden pointer-events-none">
                          <span className="text-[9px] text-foreground font-medium truncate drop-shadow-sm">{clip.label}</span>
                        </div>
                        {/* 右边缘拖拽 */}
                        <div className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize opacity-0 group-hover:opacity-100 hover:bg-white/30 transition"
                          onMouseDown={(e) => handleClipEdgeMouseDown(e, clip, 'right')} />
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
