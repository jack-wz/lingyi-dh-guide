import { dslUsesHyperframesGlobalOverlays } from './hfGlobalOverlayRenderer.js';
import { dslUsesHyperframesTransitions } from './hfTransitionRenderer.js';
import {
  dslUsesHyperframesSubtitles,
  getHyperframesSubtitlePipelineWarning,
} from './subtitleStyles.js';

export function getHyperframesPipelineWarnings(
  dsl: {
    meta?: { pipeline_key?: string };
    globalConfig?: { hf_overlays?: Array<{ type: string; enabled?: boolean }> };
    segments?: Array<{
      subtitle?: { enabled?: boolean; style_id?: string };
      narration_text?: string;
      transition?: { type?: string };
    }>;
  },
  pipelineKey?: string,
): string[] {
  const warnings: string[] = [];
  const activePipeline = pipelineKey || dsl.meta?.pipeline_key;
  if (dslUsesHyperframesSubtitles(dsl)) {
    const hfWarning = getHyperframesSubtitlePipelineWarning(activePipeline);
    if (hfWarning) warnings.push(hfWarning);
  }
  if (dslUsesHyperframesTransitions(dsl) && activePipeline !== 'hyperframes_template') {
    warnings.push('模板含 HyperFrames 动效转场；当前流水线将忽略转场动效，完整效果请选「HyperFrames 模板」流水线');
  }
  if (dslUsesHyperframesGlobalOverlays(dsl) && activePipeline !== 'hyperframes_template') {
    warnings.push('模板启用了 HyperFrames 全局质感叠加（颗粒/暗角）；当前流水线将忽略，完整效果请选「HyperFrames 模板」流水线');
  }
  return warnings;
}