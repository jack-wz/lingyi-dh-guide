import type { PipelineOption } from '@shared/data/pipelines';
import {
  getSegmentVoiceIdWarnings,
  narrationRequiresDigitalHumanIssue,
} from '@shared/renderGuards';
import {
  dslUsesHyperframesSubtitles,
  getHyperframesSubtitlePipelineWarning,
} from '@shared/subtitleStyles';
import { dslUsesHyperframesTransitions } from '@shared/hfTransitionRenderer';
import type { ConfigDiagnostics, DSL } from '@shared/types/editor';

export function getRenderWarnings(
  dsl: DSL,
  selectedDhId: string = '',
  pipelineKey?: string,
): string[] {
  const warnings: string[] = [];
  if (!dsl.globalConfig.brand_pack_id) {
    warnings.push('未选择品牌包（建议先选，确保字幕样式与成片字体一致）');
  }
  const dhId = selectedDhId || dsl.meta?.digital_human_id || '';
  warnings.push(...getSegmentVoiceIdWarnings(dsl, dhId));
  const activePipeline = pipelineKey || dsl.meta?.pipeline_key;
  if (dslUsesHyperframesSubtitles(dsl)) {
    const hfWarning = getHyperframesSubtitlePipelineWarning(activePipeline);
    if (hfWarning) warnings.push(hfWarning);
  }
  if (dslUsesHyperframesTransitions(dsl) && activePipeline !== 'hyperframes_template') {
    warnings.push('模板含 HyperFrames 动效转场；当前流水线将忽略转场动效，完整效果请选「HyperFrames 模板」流水线');
  }
  return warnings;
}

export function getRenderIssues(
  dsl: DSL,
  pipeline: PipelineOption | undefined,
  selectedDhId: string,
  inputMode: 'template' | 'topic' | 'script',
  topic: string,
  scriptText: string,
  diagnostics: ConfigDiagnostics | null = null,
  variableValues: Record<string, string> = {},
) {
  const issues: string[] = [];
  if (!pipeline) issues.push('请选择生成流水线');
  if (!dsl.segments.length) issues.push('模板至少需要一个片段');
  if (inputMode === 'template' && !dsl.segments.some((s) => s.narration_text.trim())) {
    issues.push('模板模式需要至少一段口播文案');
  }
  if (inputMode === 'topic' && !topic.trim()) issues.push('主题模式需要填写主题');
  if (inputMode === 'script' && !scriptText.trim()) issues.push('固定脚本模式需要填写脚本');
  for (const v of dsl.variables || []) {
    if (v.required && !String(variableValues[v.name] ?? '').trim()) {
      issues.push(`请填写变量：${v.label || v.name}`);
    }
  }
  if (pipeline?.requires_digital_human && !selectedDhId) {
    issues.push('数字人口播流水线需要选择一个就绪数字人');
  }
  const narrationDhIssue = pipeline?.key
    ? narrationRequiresDigitalHumanIssue(pipeline.key, dsl, selectedDhId, {
        inputMode,
        topic,
        scriptText,
      })
    : null;
  if (narrationDhIssue) {
    issues.push(narrationDhIssue);
  }
  if (pipeline?.requires_digital_human && !dsl.segments.some((s) => s.digital_human.enabled)) {
    issues.push('数字人口播流水线至少需要一个启用数字人的场景');
  }
  if (dsl.globalConfig.brand_logo_url && !dsl.globalConfig.brand_color) {
    issues.push('已配置 Logo 时建议同时配置品牌色');
  }
  if (pipeline?.key) {
    issues.push(...(diagnostics?.pipelines?.[pipeline.key]?.blockers || []));
  }
  return issues;
}

export function estimateRenderCostRisk(
  dsl: DSL,
  pipeline: PipelineOption | undefined,
  diagnostics: ConfigDiagnostics | null,
) {
  const totalDuration = dsl.segments.reduce((sum, seg) => sum + Number(seg.duration_sec || 0), 0);
  const sceneCount = Math.max(1, dsl.segments.length);
  const outputResolution = dsl.globalConfig.output_resolution || '1080p';
  const aspectRatio = dsl.globalConfig.aspect_ratio || '9:16';
  const pipelineDiagnostics = pipeline ? diagnostics?.pipelines?.[pipeline.key] : undefined;
  const providerWarnings = pipelineDiagnostics?.warnings?.length || 0;
  const providerBlockers = pipelineDiagnostics?.blockers?.length || 0;
  const resolutionMultiplier = outputResolution === '4K' ? 2.1 : outputResolution === '720p' ? 0.75 : 1;
  const pipelineMultiplier = pipeline?.key === 'digital_human' ? 0.85 : 1.25;
  const sceneMultiplier = Math.max(1, sceneCount / 4);
  const complexityScore =
    totalDuration * 0.9 * resolutionMultiplier * pipelineMultiplier +
    sceneCount * 6 * sceneMultiplier +
    providerWarnings * 10 +
    providerBlockers * 25;
  const level: 'low' | 'medium' | 'high' =
    providerBlockers > 0 || complexityScore >= 95 ? 'high' : complexityScore >= 45 ? 'medium' : 'low';
  const minMinutes = Math.max(1, Math.ceil((totalDuration * pipelineMultiplier * resolutionMultiplier + sceneCount * 5) / 45));
  const maxMinutes = Math.max(minMinutes + 1, Math.ceil(minMinutes * (level === 'high' ? 2.4 : level === 'medium' ? 1.8 : 1.4)));
  const costLabel = level === 'high' ? '高成本风险' : level === 'medium' ? '中等成本风险' : '低成本风险';
  const factors = [
    `${sceneCount} 场景`,
    `${totalDuration}s 视频`,
    outputResolution,
    aspectRatio,
    pipeline?.key === 'digital_human' ? '数字人口播' : '场景图+视频生成',
  ];
  if (providerWarnings > 0) factors.push(`${providerWarnings} 项降级风险`);
  if (providerBlockers > 0) factors.push(`${providerBlockers} 项硬阻塞`);
  const summary = `${costLabel}，预计 ${minMinutes}-${maxMinutes} 分钟；${factors.slice(0, 4).join('、')} 是主要驱动因素。`;

  return {
    level,
    costLabel,
    durationRange: `${minMinutes}-${maxMinutes} 分钟`,
    factors,
    summary,
  };
}