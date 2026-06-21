import { dslUsesHyperframesGlobalOverlays } from './hfGlobalOverlayRenderer.js';
import { dslUsesHyperframesTransitions } from './hfTransitionRenderer.js';
import { pipelineUsesHyperframesStyleLayer } from './hfStylePass.js';
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
  if (activePipeline === 'hyperframes_template') {
    warnings.push('「HyperFrames 模板」流水线会跳过场景图/口型生成，仅输出 HTML 合成；导购成片请使用「模板编辑器」流水线');
    return warnings;
  }
  if (dslUsesHyperframesSubtitles(dsl)) {
    const hfWarning = getHyperframesSubtitlePipelineWarning(activePipeline);
    if (hfWarning) warnings.push(hfWarning);
  }
  if (dslUsesHyperframesTransitions(dsl) && !pipelineUsesHyperframesStyleLayer(activePipeline)) {
    warnings.push('模板含动效转场；请使用「模板编辑器」或「标准」流水线，成片将由 FFmpeg 渲染转场');
  }
  if (dslUsesHyperframesGlobalOverlays(dsl) && !pipelineUsesHyperframesStyleLayer(activePipeline)) {
    warnings.push('模板启用了全局质感；请使用「模板编辑器」或「标准」流水线，成片将由 FFmpeg 渲染质感滤镜');
  }
  return warnings;
}