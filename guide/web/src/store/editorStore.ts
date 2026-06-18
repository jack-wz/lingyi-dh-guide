import { create } from 'zustand';
import type { DigitalHumanCatalog } from '@shared/digitalHumanStyle';

export interface Segment {
  id: string;
  type: 'narration' | 'product' | 'scene' | 'transition' | 'ending';
  narration_text: string;
  duration_sec: number;
  scene_image_url: string;
  scene_description: string;
  camera_shot: string;
  segment_bgm_url: string;
  segment_bgm_duration_sec?: number;
  subtitle: {
    enabled: boolean;
    style_id: string;
    position: 'top' | 'center' | 'bottom';
    animation: 'none' | 'fadeIn' | 'typewriter';
    font_size?: number;
    font_family?: string;
  };
  transition: { type: string; duration: number };
  digital_human: { enabled: boolean; position: { x: number; y: number }; scale: number };
  overlays: Array<{
    id: string;
    asset_url: string;
    asset_key?: string;
    position: { x: number; y: number };
    scale: number;
    seg_start_time: number;
    duration: number;
    animation: 'none' | 'fadeIn' | 'scaleIn';
    render_width_pct?: number;
    render_height_pct?: number;
  }>;
  thumbnail_url?: string;
  diagnostics?: string[];
  layout?: 'avatar-left' | 'avatar-center' | 'avatar-right' | 'media-grid' | 'full-media';
  avatar_id?: string;
  voice_id?: string;
  objects?: EditorObject[];
}

export type EditorObjectType = 'text' | 'image' | 'logo' | 'sticker' | 'avatar' | 'subtitle';

export interface EditorObject {
  id: string;
  type: EditorObjectType;
  label?: string;
  asset_url?: string;
  text?: string;
  interaction?: {
    kind: 'cta_button' | 'branch_menu' | 'single_answer' | 'multiple_answers' | 'score_card';
    target_url?: string;
    options?: string[];
  };
  metadata?: {
    source?: 'media' | 'motion' | 'shape' | 'record' | 'interactivity';
    note?: string;
    duration_sec?: number;
    provider?: string;
    shape_type?: string;
  };
  seg_start_time?: number;
  duration?: number;
  animation?: 'none' | 'fadeIn' | 'scaleIn';
  style?: {
    fill?: string;
    textColor?: string;
    variant?: string;
    fontSize?: number;
    fontFamily?: string;
    fontWeight?: number;
    outline?: string;
    background?: string;
    borderRadius?: number;
  };
  position: { x: number; y: number };
  scale: number;
  rotation?: number;
  visible?: boolean;
  locked?: boolean;
}

export interface TemplateVariable {
  name: string;
  label: string;
  description: string;
  example_value: string;
  required: boolean;
  default_value?: string;
}

export interface GlobalConfig {
  canvas_width: number;
  canvas_height: number;
  fps: number;
  bgm_url: string;
  bgm_volume: number;
  output_format: string;
  background_color?: string;
  bgm_enabled?: boolean;
  bgm_loop?: boolean;
  transition_enabled?: boolean;
  brand_logo_url?: string;
  brand_color?: string;
  brand_pack_id?: string;
  brand_pack?: Record<string, unknown>;
  default_font_family?: string;
  output_resolution?: string;
  aspect_ratio?: '9:16' | '16:9' | '1:1';
  subtitle_font_size?: number;
  subtitle_font_family?: string;
  asset_map?: Record<string, string>;
  digital_human_catalog?: DigitalHumanCatalog;
}

export interface DSL {
  meta: {
    id: string;
    name: string;
    type: string;
    version: number;
    created_at: string;
    updated_at: string;
    pipeline_key?: string;
    input_mode?: 'template' | 'topic' | 'script';
    topic?: string;
    script_text?: string;
    digital_human_id?: string;
    asset_map?: Record<string, string>;
    brand_pack_id?: string;
    frame_template_id?: string;
  };
  globalConfig: GlobalConfig;
  segments: Segment[];
  variables: TemplateVariable[];
}

export type CanvasElement =
  | { type: 'scene'; segIndex: number }
  | { type: 'digital_human'; segIndex: number }
  | { type: 'overlay'; segIndex: number; overlayIndex: number }
  | { type: 'object'; segIndex: number; objectIndex: number }
  | { type: 'subtitle'; segIndex: number }
  | { type: 'none' };

export type TrackId = 'video' | 'audio' | 'subtitle' | 'overlay' | 'object';
export type AssetTab = 'scene' | 'subtitle' | 'sound' | 'anim' | 'dh' | 'sticker';

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
    const { dsl } = get();
    if (!dsl) return;
    set((state) => ({
      dsl: updater(dsl),
      historyPast: [...state.historyPast.slice(-39), dsl],
      historyFuture: [],
    }));
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
