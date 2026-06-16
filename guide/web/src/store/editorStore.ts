import { create } from 'zustand';

export interface Segment {
  id: string;
  type: 'narration' | 'product' | 'scene' | 'transition' | 'ending';
  narration_text: string;
  duration_sec: number;
  scene_image_url: string;
  scene_description: string;
  camera_shot: string;
  segment_bgm_url: string;
  subtitle: { enabled: boolean; style_id: string; position: 'top' | 'center' | 'bottom'; animation: 'none' | 'fadeIn' | 'typewriter' };
  transition: { type: string; duration: number };
  digital_human: { enabled: boolean; position: { x: number; y: number }; scale: number };
  overlays: Array<{
    id: string;
    asset_url: string;
    position: { x: number; y: number };
    scale: number;
    seg_start_time: number;
    duration: number;
    animation: 'none' | 'fadeIn' | 'scaleIn';
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
  style?: {
    fill?: string;
    textColor?: string;
    variant?: string;
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
  output_resolution?: string;
  aspect_ratio?: '9:16' | '16:9' | '1:1';
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

export type TrackId = 'video' | 'audio' | 'subtitle' | 'overlay';
export type AssetTab = 'scene' | 'subtitle' | 'sound' | 'anim' | 'dh';

export interface EditorState {
  dsl: DSL | null;
  currentSegIndex: number;
  playing: boolean;
  currentTime: number;
  selectedElement: CanvasElement;
  showPresets: boolean;
  timelineZoom: number;
  timelineScrollLeft: number;
  mutedTracks: Set<TrackId>;
  historyPast: DSL[];
  historyFuture: DSL[];

  setDsl: (dsl: DSL | null) => void;
  updateDsl: (updater: (dsl: DSL) => DSL) => void;
  undo: () => void;
  redo: () => void;
  reorderSegment: (fromIndex: number, toIndex: number) => void;
  updateSelectedObject: (partial: Partial<EditorObject>) => void;
  setCurrentSegIndex: (i: number) => void;
  setPlaying: (p: boolean) => void;
  setCurrentTime: (t: number) => void;
  setSelectedElement: (el: CanvasElement) => void;
  setShowPresets: (show: boolean) => void;
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
  showPresets: false,
  timelineZoom: 1,
  timelineScrollLeft: 0,
  mutedTracks: new Set<TrackId>(),
  historyPast: [],
  historyFuture: [],

  setDsl: (dsl) => set({ dsl, historyPast: [], historyFuture: [] }),
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
  setCurrentSegIndex: (i) => set({ currentSegIndex: i, selectedElement: { type: 'none' } }),
  setPlaying: (p) => set({ playing: p }),
  setCurrentTime: (t) => set({ currentTime: t }),
  setSelectedElement: (el) => set({ selectedElement: el }),
  setShowPresets: (show) => set({ showPresets: show }),
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
