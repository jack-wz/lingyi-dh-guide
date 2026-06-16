export interface Template {
  id: string;
  name: string;
  type: string;
  description: string;
  cover_url: string;
  status: 'draft' | 'pending' | 'published' | 'offline';
  dsl_json: DSL;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface DigitalHuman {
  id: string;
  name: string;
  face_photo_url: string;
  half_body_photo_url: string;
  full_body_photo_url: string;
  voice_sample_url: string;
  voice_clone_id: string;
  image_model_id: string;
  status: 'pending' | 'pending_assets' | 'training' | 'ready' | 'failed';
  provider_job_id: string;
  training_error: string;
  last_trained_at: string;
  created_at: string;
  updated_at: string;
}

export interface RenderJob {
  id: string;
  template_id: string;
  digital_human_id: string;
  status: 'queued' | 'parsing' | 'scene_gen' | 'video_gen' | 'ffmpeg' | 'completed' | 'failed' | 'cancelling' | 'cancelled';
  pipeline_key: string;
  input_mode: 'template' | 'topic' | 'script';
  topic: string;
  script_text: string;
  template_dsl_snapshot?: string;
  retry_count: number;
  max_retries: number;
  worker_id: string;
  heartbeat_at: string;
  cancel_requested: number;
  parent_job_id: string;
  stage: string;
  progress: number;
  output_url: string;
  output_exists: boolean;
  error_message: string;
  created_at: string;
  updated_at: string;
  completed_at: string;
}

export interface RenderLog {
  id: number;
  render_job_id: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  created_at: string;
}

export interface UploadResponse {
  url: string;
  filename: string;
  original_name: string;
  size: number;
  mime_type: string;
}

export interface SubCfg {
  enabled: boolean;
  style_id: string;
  position: 'top' | 'center' | 'bottom';
  animation: 'none' | 'fadeIn' | 'typewriter';
}

export interface TransCfg {
  type: string;
  duration: number;
}

export interface DhConfig {
  enabled: boolean;
  position: { x: number; y: number };
  scale: number;
}

export interface SegOverlay {
  id: string;
  asset_url: string;
  position: { x: number; y: number };
  scale: number;
  seg_start_time: number;
  duration: number;
  animation: 'none' | 'fadeIn' | 'scaleIn';
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

export interface Segment {
  id: string;
  type: 'narration' | 'product' | 'scene' | 'transition' | 'ending';
  narration_text: string;
  duration_sec: number;
  scene_image_url: string;
  scene_description: string;
  camera_shot: string;
  segment_bgm_url: string;
  subtitle: SubCfg;
  transition: TransCfg;
  digital_human: DhConfig;
  overlays: SegOverlay[];
  thumbnail_url?: string;
  diagnostics?: string[];
  layout?: 'avatar-left' | 'avatar-center' | 'avatar-right' | 'media-grid' | 'full-media';
  avatar_id?: string;
  voice_id?: string;
  objects?: EditorObject[];
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
  meta: { id: string; name: string; type: string; version: number; created_at: string; updated_at: string };
  globalConfig: GlobalConfig;
  segments: Segment[];
  variables: TemplateVariable[];
}
