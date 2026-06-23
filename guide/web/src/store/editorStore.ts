import { create } from 'zustand';
import type {
  AssetTab,
  CanvasElement,
  DSL,
  EditorObject,
  Segment,
  TrackId,
} from '@shared/types/editor';

export type {
  AspectRatio,
  AssetTab,
  CanvasElement,
  ConfigDiagnostics,
  DSL,
  EditorObject,
  EditorObjectType,
  GlobalConfig,
  OverlayAnimation,
  Segment,
  SegmentType,
  SubtitleAnimation,
  SubtitlePosition,
  TemplateVariable,
  TrackId,
} from '@shared/types/editor';

export interface EditorState {
  dsl: DSL | null;
  currentSegIndex: number;
  playing: boolean;
  currentTime: number;
  selectedElement: CanvasElement;
  timelineZoom: number;
  timelineScrollLeft: number;
  mutedTracks: Set<TrackId>;
  historyPast: DSL[];
  historyFuture: DSL[];
  previewVariables: Record<string, string>;

  setDsl: (dsl: DSL | null) => void;
  setPreviewVariables: (variables: Record<string, string>) => void;
  updateDsl: (updater: (dsl: DSL) => DSL) => void;
  undo: () => void;
  redo: () => void;
  reorderSegment: (fromIndex: number, toIndex: number) => void;
  updateSelectedObject: (partial: Partial<EditorObject>) => void;
  setCurrentSegIndex: (i: number) => void;
  setPlaying: (p: boolean) => void;
  setCurrentTime: (t: number) => void;
  seekToTime: (t: number, opts?: { syncSegment?: boolean; clearSelection?: boolean; stopPlayback?: boolean }) => void;
  seekToSegment: (index: number) => void;
  togglePlayback: () => void;
  setSelectedElement: (el: CanvasElement) => void;
  setTimelineZoom: (z: number) => void;
  setTimelineScrollLeft: (l: number) => void;
  toggleMuteTrack: (id: TrackId) => void;

  getCurrentSegment: () => Segment | null;
  getSegmentStartTime: (index: number) => number;
  getTotalDuration: () => number;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  dsl: null,
  currentSegIndex: 0,
  playing: false,
  currentTime: 0,
  selectedElement: { type: 'none' },
  timelineZoom: 1,
  timelineScrollLeft: 0,
  mutedTracks: new Set<TrackId>(),
  historyPast: [],
  historyFuture: [],
  previewVariables: {},

  setDsl: (dsl) => set({ dsl, historyPast: [], historyFuture: [] }),
  setPreviewVariables: (variables) => set({ previewVariables: variables }),
  updateDsl: (updater) => {
    set((state) => {
      const { dsl } = state;
      if (!dsl) return state;
      return {
        dsl: updater(dsl),
        historyPast: [...state.historyPast.slice(-39), dsl],
        historyFuture: [],
      };
    });
  },
  undo: () => {
    const { dsl, historyPast, historyFuture } = get();
    if (!dsl || historyPast.length === 0) return;
    const previous = historyPast[historyPast.length - 1];
    set({
      dsl: previous,
      historyPast: historyPast.slice(0, -1),
      historyFuture: [dsl, ...historyFuture].slice(0, 40),
      selectedElement: { type: 'none' },
    });
  },
  redo: () => {
    const { dsl, historyPast, historyFuture } = get();
    if (!dsl || historyFuture.length === 0) return;
    const next = historyFuture[0];
    set({
      dsl: next,
      historyPast: [...historyPast.slice(-39), dsl],
      historyFuture: historyFuture.slice(1),
      selectedElement: { type: 'none' },
    });
  },
  reorderSegment: (fromIndex, toIndex) => {
    const { dsl } = get();
    if (!dsl || fromIndex === toIndex || toIndex < 0 || toIndex >= dsl.segments.length) return;
    get().updateDsl((draft) => {
      const segments = [...draft.segments];
      const [moved] = segments.splice(fromIndex, 1);
      segments.splice(toIndex, 0, moved);
      return { ...draft, segments };
    });
    set({ currentSegIndex: toIndex, selectedElement: { type: 'none' } });
  },
  updateSelectedObject: (partial) => {
    const { selectedElement } = get();
    if (selectedElement.type !== 'object') return;
    get().updateDsl((draft) => {
      const segments = [...draft.segments];
      const seg = segments[selectedElement.segIndex];
      if (!seg?.objects?.[selectedElement.objectIndex]) return draft;
      const objects = [...seg.objects];
      objects[selectedElement.objectIndex] = { ...objects[selectedElement.objectIndex], ...partial };
      segments[selectedElement.segIndex] = { ...seg, objects };
      return { ...draft, segments };
    });
  },
  setCurrentSegIndex: (i) => {
    const start = get().getSegmentStartTime(i);
    set({ currentSegIndex: i, currentTime: start, selectedElement: { type: 'none' }, playing: false });
  },
  setPlaying: (p) => set({ playing: p }),
  setCurrentTime: (t) => set({ currentTime: t }),
  seekToTime: (t, opts = { syncSegment: true, clearSelection: true, stopPlayback: true }) => {
    const { dsl } = get();
    if (!dsl) return;
    const total = get().getTotalDuration();
    const clamped = Math.max(0, Math.min(t, total));
    let segIndex = 0;
    if (opts.syncSegment !== false) {
      let acc = 0;
      for (let i = 0; i < dsl.segments.length; i += 1) {
        const dur = dsl.segments[i].duration_sec;
        if (clamped < acc + dur || i === dsl.segments.length - 1) {
          segIndex = i;
          break;
        }
        acc += dur;
      }
    } else {
      segIndex = get().currentSegIndex;
    }
    const patch: Partial<EditorState> = { currentTime: clamped };
    if (opts.stopPlayback !== false) patch.playing = false;
    if (opts.syncSegment !== false) patch.currentSegIndex = segIndex;
    if (opts.clearSelection !== false) patch.selectedElement = { type: 'none' };
    set(patch);
  },
  seekToSegment: (index) => {
    const start = get().getSegmentStartTime(index);
    get().seekToTime(start, { syncSegment: true, clearSelection: true });
  },
  togglePlayback: () => {
    const { playing, currentTime, getTotalDuration, seekToTime } = get();
    if (playing) {
      set({ playing: false });
      return;
    }
    const total = getTotalDuration();
    if (total <= 0) return;
    if (currentTime >= total - 0.05) seekToTime(0, { syncSegment: true, clearSelection: false });
    set({ playing: true });
  },
  setSelectedElement: (el) => set({ selectedElement: el }),
  setTimelineZoom: (z) => set({ timelineZoom: Math.max(0.5, Math.min(4, z)) }),
  setTimelineScrollLeft: (l) => set({ timelineScrollLeft: l }),
  toggleMuteTrack: (id) => set(s => {
    const next = new Set(s.mutedTracks);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    return { mutedTracks: next };
  }),

  getCurrentSegment: () => {
    const { dsl, currentSegIndex } = get();
    return dsl?.segments[currentSegIndex] ?? null;
  },
  getSegmentStartTime: (index) => {
    const { dsl } = get();
    if (!dsl) return 0;
    let t = 0;
    for (let i = 0; i < index; i++) t += dsl.segments[i].duration_sec;
    return t;
  },
  getTotalDuration: () => {
    const { dsl } = get();
    if (!dsl) return 0;
    return dsl.segments.reduce((a, s) => a + s.duration_sec, 0);
  },
}));
