import { dslUsesHyperframesGlobalOverlays } from './hfGlobalOverlayRenderer.js';
import { dslUsesHyperframesTransitions } from './hfTransitionRenderer.js';
import { dslUsesHyperframesSubtitles } from './subtitleStyles.js';

/**
 * Pipelines that bake HF-style transitions/overlays/subtitles into Stage4 FFmpeg output.
 * HyperFrames HTML render is preview-only; delivery is single-path FFmpeg.
 */
export const FFMPEG_STYLE_PIPELINES = new Set(['standard', 'template_editor', 'digital_human', 'avatar_talk']);

/** @deprecated use FFMPEG_STYLE_PIPELINES */
export const HF_STYLE_LAYER_PIPELINES = FFMPEG_STYLE_PIPELINES;

export function dslNeedsHyperframesStylePass(dsl: {
  globalConfig?: { hf_overlays?: Array<{ type: string; enabled?: boolean }> };
  segments?: Array<{
    subtitle?: { enabled?: boolean; style_id?: string };
    narration_text?: string;
    transition?: { type?: string };
  }>;
}): boolean {
  return dslUsesHyperframesSubtitles(dsl)
    || dslUsesHyperframesTransitions(dsl)
    || dslUsesHyperframesGlobalOverlays(dsl);
}

/** True when Stage4 FFmpeg maps HF look presets (not a post-render HF pass). */
export function pipelineUsesFfmpegStyleEffects(pipelineKey?: string): boolean {
  return Boolean(pipelineKey && FFMPEG_STYLE_PIPELINES.has(pipelineKey));
}

export function pipelineUsesHyperframesStyleLayer(pipelineKey?: string): boolean {
  return pipelineUsesFfmpegStyleEffects(pipelineKey);
}