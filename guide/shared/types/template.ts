// Template DSL type contract shared by client, server, and worker.

export type SegmentType = 'narration' | 'product' | 'scene' | 'transition' | 'ending';
export type AspectRatio = '9:16' | '16:9' | '1:1';
export type TemplateStatus = 'draft' | 'pending' | 'published' | 'offline';
export type SubtitlePosition = 'top' | 'center' | 'bottom';
export type SubtitleAnimation = 'none' | 'fadeIn' | 'typewriter';
export type OverlayAnimation = 'none' | 'fadeIn' | 'scaleIn';
export type EditorObjectType = 'text' | 'image' | 'logo' | 'sticker' | 'avatar' | 'subtitle';

export interface TemplateDSL {
  meta: TemplateMeta;
  globalConfig: GlobalConfig;
  segments: Segment[];
  variables: TemplateVariable[];
}

export interface TemplateMeta {
  id: string;
  name: string;
  type: string;
  description: string;
  coverUrl: string;
  status: TemplateStatus;
  version: number;
  referenceVideoUrl?: string;
  created_at: string;
  updated_at: string;
  createdAt: string;
  updatedAt: string;
  pipeline_key?: string;
  input_mode?: 'template' | 'topic' | 'script';
  topic?: string;
  script_text?: string;
  /** Persisted brand pack library id for template list / hydration. */
  brand_pack_id?: string;
}

export interface GlobalConfig {
  canvas_width: number;
  canvas_height: number;
  fps: number;
  bgm_url: string;
  bgm_volume: number;
  output_format: 'mp4' | string;
  background_color: string;
  bgm_enabled: boolean;
  bgm_loop: boolean;
  transition_enabled: boolean;
  brand_logo_url: string;
  brand_color: string;
  output_resolution: '720p' | '1080p' | '4K' | string;
  aspect_ratio: AspectRatio;
  /** Default subtitle font size (ASS px at 1080×1920). Segments may override via subtitle.font_size. */
  subtitle_font_size?: number;
  /** Default subtitle font family (CSS / ASS Fontname). Segments may override via subtitle.font_family. */
  subtitle_font_family?: string;
  /** Full-video HyperFrames overlays (grain, vignette). */
  hf_overlays?: HfGlobalOverlayItem[];
}

export type HfGlobalOverlayType = 'hf-grain' | 'hf-vignette';

export interface HfGlobalOverlayItem {
  type: HfGlobalOverlayType;
  enabled: boolean;
  opacity?: number;
  intensity?: number;
  vignette_size?: number;
}

export interface Segment {
  id: string;
  index?: number;
  type: SegmentType;
  narration_text: string;
  duration_sec: number;
  scene_image_url: string;
  scene_description: string;
  camera_shot: string;
  segment_bgm_url: string;
  subtitle: SubtitleConfig;
  transition: TransitionConfig;
  digital_human: DigitalHumanSegmentConfig;
  overlays: SegmentOverlay[];
  thumbnail_url: string;
  diagnostics: string[];
  layout: 'avatar-left' | 'avatar-center' | 'avatar-right' | 'media-grid' | 'full-media';
  avatar_id: string;
  voice_id: string;
  objects: EditorObject[];
}

export interface Position {
  x: number;
  y: number;
}

export interface DigitalHumanSegmentConfig {
  enabled: boolean;
  position: Position;
  scale: number;
}

export interface SegmentOverlay {
  id: string;
  asset_url: string;
  position: Position;
  scale: number;
  seg_start_time: number;
  duration: number;
  animation: OverlayAnimation;
}

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
    animation?: string;
  };
  style?: {
    fill?: string;
    textColor?: string;
    variant?: string;
  };
  position: Position;
  scale: number;
  rotation?: number;
  visible?: boolean;
  locked?: boolean;
}

export interface SubtitleHfParams {
  emphasis_words?: string[];
  accent_color?: string;
  intensity?: number;
  word_timings?: Array<{ text: string; start: number; end: number }>;
  /** whisper = ASR-aligned; heuristic = estimated from duration */
  word_timing_source?: 'whisper' | 'heuristic';
}

export interface SubtitleConfig {
  enabled: boolean;
  style_id: string;
  position: SubtitlePosition;
  animation: SubtitleAnimation;
  /** ASS/render font size (px baseline at 1080×1920). Omit to use globalConfig.subtitle_font_size or style preset. */
  font_size?: number;
  /** Font family for burned-in subtitles. Omit to use globalConfig.subtitle_font_family / default_font_family. */
  font_family?: string;
  /** HyperFrames caption component params (when style_id uses engine=hyperframes). */
  hf_params?: SubtitleHfParams;
}

export interface TransitionConfig {
  type: string;
  duration: number;
}

export interface TemplateVariable {
  name: string;
  label: string;
  description: string;
  example_value: string;
  required: boolean;
  default_value?: string;
}

export interface SubtitleStyleTemplate {
  id: string;
  name: string;
  fontFamily: string;
  fontSize: number;
  fontColor: string;
  outlineColor: string;
  outlineWidth: number;
  backgroundStyle: 'none' | 'semiTransparent' | 'solid';
  backgroundColor: string;
}

export const SUBTITLE_STYLE_TEMPLATES: SubtitleStyleTemplate[] = [
  {
    id: 'classic-white-stroke',
    name: '经典白字黑边',
    fontFamily: 'Source Han Sans',
    fontSize: 42,
    fontColor: '#FFFFFF',
    outlineColor: '#000000',
    outlineWidth: 3,
    backgroundStyle: 'none',
    backgroundColor: 'transparent',
  },
  {
    id: 'bold-yellow',
    name: '醒目黄字',
    fontFamily: 'Source Han Sans',
    fontSize: 46,
    fontColor: '#FFD700',
    outlineColor: '#333333',
    outlineWidth: 3,
    backgroundStyle: 'none',
    backgroundColor: 'transparent',
  },
  {
    id: 'semi-transparent-bar',
    name: '半透明底栏白字',
    fontFamily: 'Source Han Sans',
    fontSize: 38,
    fontColor: '#FFFFFF',
    outlineColor: '#000000',
    outlineWidth: 1,
    backgroundStyle: 'semiTransparent',
    backgroundColor: '#00000099',
  },
  {
    id: 'stroke-large',
    name: '描边大字',
    fontFamily: 'Source Han Sans',
    fontSize: 52,
    fontColor: '#FFFFFF',
    outlineColor: '#000000',
    outlineWidth: 5,
    backgroundStyle: 'none',
    backgroundColor: 'transparent',
  },
  {
    id: 'brand-elegant',
    name: '品牌优雅',
    fontFamily: 'Source Han Sans',
    fontSize: 40,
    fontColor: '#F5E6CC',
    outlineColor: '#8B7355',
    outlineWidth: 2,
    backgroundStyle: 'none',
    backgroundColor: 'transparent',
  },
  {
    id: 'subtitle-card',
    name: '字幕卡片',
    fontFamily: 'Source Han Sans',
    fontSize: 36,
    fontColor: '#FFFFFF',
    outlineColor: '#000000',
    outlineWidth: 1,
    backgroundStyle: 'solid',
    backgroundColor: '#333333CC',
  },
];

export function createDefaultDSL(input: {
  id?: string;
  name?: string;
  type?: string;
  description?: string;
  now?: string;
} = {}): TemplateDSL {
  const now = input.now || new Date().toISOString();
  const id = input.id || '';

  return {
    meta: {
      id,
      name: input.name || '未命名模板',
      type: input.type || '新品发布',
      description: input.description || '',
      coverUrl: '',
      status: 'draft',
      version: 1,
      created_at: now,
      updated_at: now,
      createdAt: now,
      updatedAt: now,
    },
    globalConfig: {
      canvas_width: 1080,
      canvas_height: 1920,
      fps: 30,
      bgm_url: '',
      bgm_volume: 0.3,
      output_format: 'mp4',
      background_color: '#f6f6f6',
      bgm_enabled: false,
      bgm_loop: true,
      transition_enabled: false,
      brand_logo_url: '',
      brand_color: '#4f46e5',
      output_resolution: '1080p',
      aspect_ratio: '9:16',
    },
    segments: [createDefaultSegment(0, { id: `seg-${Date.now()}` })],
    variables: [],
  };
}

export function createDefaultSegment(index = 0, input: { id?: string } = {}): Segment {
  return {
    id: input.id || `seg-${Date.now()}-${index}`,
    index,
    type: 'narration',
    narration_text: '',
    duration_sec: 5,
    scene_image_url: '',
    scene_description: '',
    camera_shot: '',
    segment_bgm_url: '',
    subtitle: {
      enabled: true,
      style_id: 'default',
      position: 'bottom',
      animation: 'fadeIn',
    },
    transition: { type: 'none', duration: 0.5 },
    digital_human: { enabled: false, position: { x: 50, y: 72 }, scale: 100 },
    overlays: [],
    thumbnail_url: '',
    diagnostics: [],
    layout: 'avatar-center',
    avatar_id: '',
    voice_id: '',
    objects: [],
  };
}
