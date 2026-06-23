import type { PipelineOption } from '@shared/data/pipelines';
import { dslUsesAnyHyperframesFeatures } from '@shared/lookPreset';
import { pipelineUsesHyperframesStyleLayer } from '@shared/hfStylePass';
import {
  getSegmentVoiceIdWarnings,
  narrationRequiresDigitalHumanIssue,
} from '@shared/renderGuards';
import { getHyperframesPipelineWarnings } from '@shared/hfPipelineWarnings';
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
  warnings.push(...getHyperframesPipelineWarnings(dsl, pipelineKey || dsl.meta?.pipeline_key));
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

  // Detect segment-level lens variable gaps when frame_template_id is bound
  const brandPack = dsl.globalConfig.brand_pack as { frames?: Array<{ id: string; variables?: string[]; name: string }> } | undefined;
  if (brandPack?.frames?.length) {
    const frameMap = new Map(brandPack.frames.map((f) => [f.id, f]));
    for (const seg of dsl.segments) {
      if (!seg.frame_template_id) continue;
      const frame = frameMap.get(seg.frame_template_id);
      if (!frame?.variables?.length) continue;
      const missing = frame.variables.filter((v) => !String(variableValues[v] ?? '').trim());
      if (missing.length) {
        issues.push(`分镜「${frame.name}」缺少变量：${missing.join('、')}`);
      }
    }
  }

  if (pipeline?.key) {
    issues.push(...(diagnostics?.pipelines?.[pipeline.key]?.blockers || []));
  }
  return issues;
}

export interface GenerationExpectation {
  shotCount: number;
  totalDurationSec: number;
  readyShots: number;
  warningShots: number;
  missingShots: number;
  aiGaps: string[];
  aiFills: string[];
  estimate: ReturnType<typeof estimateRenderCostRisk> | null;
  oneLine: string;
}

export function getSegmentShotStatus(
  seg: DSL['segments'][number],
): 'missing' | 'ready' | 'generating' | 'warning' {
  const issues: string[] = [];
  if (!seg.scene_image_url) issues.push('场景图');
  const needsDh = Boolean(seg.digital_human?.enabled);
  if (needsDh && !seg.avatar_id) issues.push('数字人');
  if (!seg.narration_text.trim()) issues.push('口播文案');
  if (!seg.subtitle?.style_id) issues.push('字幕样式');
  if (issues.length >= 2) return 'missing';
  if (issues.length === 1) return 'warning';
  return 'ready';
}

export function getGenerationExpectation(
  dsl: DSL,
  pipeline: PipelineOption | undefined,
  diagnostics: ConfigDiagnostics | null,
): GenerationExpectation {
  const shotCount = dsl.segments.length;
  const totalDurationSec = dsl.segments.reduce((sum, seg) => sum + Number(seg.duration_sec || 0), 0);
  let readyShots = 0, warningShots = 0, missingShots = 0;
  const aiGaps: string[] = [];
  let sceneImgGap = 0, dhGap = 0, voiceGap = 0, motionGap = 0, narrationCompressGap = 0;
  for (const seg of dsl.segments) {
    const status = getSegmentShotStatus(seg);
    if (status === 'ready') readyShots++;
    else if (status === 'warning') warningShots++;
    else missingShots++;
    if (!seg.scene_image_url) sceneImgGap++;
    if (seg.digital_human?.enabled && !seg.avatar_id) dhGap++;
    if (!seg.voice_id) voiceGap++;
    if (seg.objects?.some((o) => o.metadata?.source !== 'record' && !o.metadata?.duration_sec)) motionGap++;
    if (seg.narration_text && seg.narration_text.length > 50) narrationCompressGap++;
  }
  if (sceneImgGap) aiGaps.push(`场景图 ×${sceneImgGap}`);
  if (dhGap) aiGaps.push(`数字人 ×${dhGap}`);
  if (voiceGap) aiGaps.push(`口播配音 ×${voiceGap}`);
  if (motionGap) aiGaps.push(`动效 ×${motionGap}`);

  const aiFills: string[] = [];
  if (sceneImgGap) aiFills.push(`AI 补 ${sceneImgGap} 张场景图`);
  if (motionGap) aiFills.push(`${motionGap} 个 CTA/动效`);
  if (narrationCompressGap) aiFills.push(`压缩 ${narrationCompressGap} 段口播`);
  if (dhGap) aiFills.push(`合成 ${dhGap} 个数字人`);

  const estimate = pipeline ? estimateRenderCostRisk(dsl, pipeline, diagnostics) : null;
  const fillCount = aiFills.length;
  const oneLine = `共 ${shotCount} 镜 · 约 ${Math.round(totalDurationSec)} 秒 · AI 补 ${fillCount} 项` +
    (estimate ? ` · 预计 ${estimate.durationRange}` : '') + ' · 生成';
  return {
    shotCount,
    totalDurationSec,
    readyShots,
    warningShots,
    missingShots,
    aiGaps,
    aiFills,
    estimate,
    oneLine,
  };
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
  const pipelineKey = pipeline?.key;
  const usesHfStyle = dslUsesAnyHyperframesFeatures(dsl);
  const hfStyleLayer = pipelineUsesHyperframesStyleLayer(pipelineKey) && usesHfStyle;
  const pipelineMultiplier = pipelineKey === 'digital_human'
    ? 0.85
    : pipelineKey === 'hyperframes_template'
      ? 0.55
      : 1.25;
  const sceneSceneCost = pipelineKey === 'hyperframes_template' ? 2 : 6;
  const sceneMultiplier = Math.max(1, sceneCount / 4);
  let complexityScore =
    totalDuration * 0.9 * resolutionMultiplier * pipelineMultiplier +
    sceneCount * sceneSceneCost * sceneMultiplier +
    providerWarnings * 10 +
    providerBlockers * 25;
  if (hfStyleLayer) complexityScore += 4;
  const level: 'low' | 'medium' | 'high' =
    providerBlockers > 0 || complexityScore >= 95 ? 'high' : complexityScore >= 45 ? 'medium' : 'low';
  const perSceneOverhead = pipelineKey === 'hyperframes_template' ? 2 : 5;
  const hfOverheadMinutes = 0;
  const minMinutes = Math.max(1, Math.ceil((totalDuration * pipelineMultiplier * resolutionMultiplier + sceneCount * perSceneOverhead) / 45) + hfOverheadMinutes);
  const maxMinutes = Math.max(minMinutes + 1, Math.ceil(minMinutes * (level === 'high' ? 2.4 : level === 'medium' ? 1.8 : 1.4)));
  const costLabel = level === 'high' ? '高成本风险' : level === 'medium' ? '中等成本风险' : '低成本风险';
  const factors = [
    `${sceneCount} 场景`,
    `${totalDuration}s 视频`,
    outputResolution,
    aspectRatio,
    pipelineKey === 'hyperframes_template'
      ? 'HyperFrames HTML 出片（跳过场景生成）'
      : pipelineKey === 'digital_human'
        ? '数字人口播'
        : hfStyleLayer
          ? '场景图+视频+FFmpeg动效'
          : '场景图+视频生成',
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