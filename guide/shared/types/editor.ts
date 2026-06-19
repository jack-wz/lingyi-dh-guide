import type { DigitalHumanCatalog } from '../digitalHumanStyle';

export type SegmentType = 'narration' | 'product' | 'scene' | 'transition' | 'ending';
export type AspectRatio = '9:16' | '16:9' | '1:1';
export type SubtitlePosition = 'top' | 'center' | 'bottom';
export type SubtitleAnimation = 'none' | 'fadeIn' | 'typewriter';
export type OverlayAnimation = 'none' | 'fadeIn' | 'scaleIn';
export type EditorObjectType = 'text' | 'image' | 'logo' | 'sticker' | 'avatar' | 'subtitle';

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
  segment_bgm_duration_sec?: number;
  subtitle: {
    enabled: boolean;
    style_id: string;
    position: SubtitlePosition;
    animation: SubtitleAnimation;
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
    animation: OverlayAnimation;
    render_width_pct?: number;
    render_height_pct?: number;
    rotation?: number;
  }>;
  thumbnail_url?: string;
  diagnostics?: string[];
  layout?: 'avatar-left' | 'avatar-center' | 'avatar-right' | 'media-grid' | 'full-media';
  avatar_id?: string;
  voice_id?: string;
  objects?: EditorObject[];
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
    target_segment_id?: string;
    options?: string[];
    option_targets?: Record<string, string>;
    option_scores?: Record<string, number>;
  };
  metadata?: {
    source?: 'media' | 'motion' | 'shape' | 'record' | 'interactivity';
    note?: string;
    duration_sec?: number;
    provider?: string;
    shape_type?: string;
    animation?: string;
  };
  seg_start_time?: number;
  duration?: number;
  animation?: OverlayAnimation;
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
  aspect_ratio?: AspectRatio;
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

export interface ConfigDiagnostics {
  providers: Array<{
    key: string;
    name: string;
    configured: boolean;
    used_for: string[];
    fallback: string;
  }>;
  pipelines: Record<string, {
    blockers: string[];
    warnings: string[];
    provider_keys: string[];
  }>;
}

export type ApiSegment = Partial<Omit<Segment, 'subtitle'>> & {
  subtitle?: Partial<Segment['subtitle']>;
};