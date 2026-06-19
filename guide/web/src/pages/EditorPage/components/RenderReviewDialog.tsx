import type { PipelineOption } from '@shared/data/pipelines';
import type { ConfigDiagnostics, DSL } from '@shared/types/editor';
import { dslUsesHyperframesSubtitles } from '@shared/subtitleStyles';
import { dslUsesHyperframesTransitions } from '@shared/hfTransitionRenderer';
import { IconAlertCircle, IconCheck, IconZap } from '../../../components/Icons';
import { estimateRenderCostRisk } from '../utils/renderIssues';
import { getPreviewRenderAlignment } from '../../../utils/previewRenderAlignment';

function ReviewMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-[10px] text-muted-foreground mb-1">{label}</div>
      <div className="text-sm font-medium text-foreground truncate">{value}</div>
    </div>
  );
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className={`rounded-md px-2 py-1.5 flex items-center gap-1 ${ok ? 'bg-brand-green/10 text-brand-green' : 'bg-brand-amber/10 text-brand-amber'}`}>
      {ok ? <IconCheck size={13} /> : <IconAlertCircle size={13} />}
      {label}
    </div>
  );
}

export default function RenderReviewDialog({
  dsl,
  pipeline,
  inputMode,
  topic,
  scriptText,
  selectedDhId,
  issues,
  warnings = [],
  ready,
  diagnostics,
  onCancel,
  onConfirm,
  onIssueClick,
  hfPipelineAvailable = false,
  onSwitchToHfPipeline,
}: {
  dsl: DSL;
  pipeline: PipelineOption | undefined;
  inputMode: 'template' | 'topic' | 'script';
  topic: string;
  scriptText: string;
  selectedDhId: string;
  issues: string[];
  warnings?: string[];
  ready: boolean;
  diagnostics: ConfigDiagnostics | null;
  onCancel: () => void;
  onConfirm: () => void;
  onIssueClick: (issue: string) => void;
  hfPipelineAvailable?: boolean;
  onSwitchToHfPipeline?: () => void;
}) {
  const totalDuration = dsl.segments.reduce((sum, seg) => sum + Number(seg.duration_sec || 0), 0);
  const textCount = dsl.segments.filter((seg) => seg.narration_text.trim()).length;
  const sceneCount = dsl.segments.filter((seg) => seg.scene_image_url || seg.scene_description).length;
  const brandReady = Boolean(dsl.globalConfig.brand_pack_id || dsl.globalConfig.brand_color || dsl.globalConfig.brand_logo_url);
  const musicEnabled = Boolean(dsl.globalConfig.bgm_enabled || dsl.globalConfig.bgm_url);
  const transitionEnabled = Boolean(dsl.globalConfig.transition_enabled || dsl.segments.some((seg) => seg.transition.type !== 'none'));
  const inputLabel = inputMode === 'template' ? '模板片段' : inputMode === 'topic' ? '主题生成' : '固定脚本';
  const inputPreview = inputMode === 'topic' ? topic : inputMode === 'script' ? scriptText : `${dsl.segments.length} 个场景`;
  const pipelineDiagnostics = pipeline ? diagnostics?.pipelines?.[pipeline.key] : undefined;
  const pipelineWarnings = pipelineDiagnostics?.warnings || [];
  const pipelineBlockers = pipelineDiagnostics?.blockers || [];
  const providerKeys = pipelineDiagnostics?.provider_keys || [];
  const activeProviders = diagnostics?.providers?.filter((provider) => providerKeys.includes(provider.key)) || [];
  const estimate = estimateRenderCostRisk(dsl, pipeline, diagnostics);
  const alignment = getPreviewRenderAlignment(pipeline?.key);
  const usesHfSubtitles = dslUsesHyperframesSubtitles(dsl);
  const usesHfTransitions = dslUsesHyperframesTransitions(dsl);
  const showHfPipelineCta = (usesHfSubtitles || usesHfTransitions)
    && pipeline?.key !== 'hyperframes_template'
    && hfPipelineAvailable
    && Boolean(onSwitchToHfPipeline);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="render-review-title"
        className="w-[560px] max-w-full bg-card border border-border rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-border flex items-start justify-between">
          <div>
            <h2 id="render-review-title" className="text-base font-semibold text-foreground">生成前复核</h2>
            <p className="text-xs text-muted-foreground mt-1">确认任务参数、素材状态和阻塞项后再提交渲染。</p>
          </div>
          <button onClick={onCancel} className="w-8 h-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent">×</button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <ReviewMetric label="流水线" value={pipeline?.name || '未选择'} />
            <ReviewMetric label="输入模式" value={inputLabel} />
            <ReviewMetric label="预计时长" value={`${totalDuration}s`} />
            <ReviewMetric label="数字人" value={selectedDhId ? '已选择' : '未选择'} />
            <ReviewMetric label="预计耗时" value={estimate.durationRange} />
            <ReviewMetric label="成本风险" value={estimate.costLabel} />
          </div>
          <div className={`rounded-md border p-3 ${
            alignment.tier === 'exact'
              ? 'border-brand-green/30 bg-brand-green/10'
              : alignment.tier === 'layout'
                ? 'border-brand-blue/30 bg-brand-blue/5'
                : 'border-brand-amber/30 bg-brand-amber/10'
          }`}>
            <div className="text-xs font-medium text-foreground mb-1">预览与成片一致性</div>
            <p className="text-xs text-muted-foreground leading-5">
              <span className="font-medium text-foreground">{alignment.title}。</span>
              {' '}
              {alignment.detail}
              {' '}
              画布可切换「成片预览」模式播放时间轴；也可点击顶部胶片图标打开 HyperFrames 新标签预览。
            </p>
          </div>
          <div className={`rounded-md border p-3 ${estimate.level === 'high' ? 'border-destructive/30 bg-destructive/10' : estimate.level === 'medium' ? 'border-brand-amber/30 bg-brand-amber/10' : 'border-brand-green/20 bg-brand-green/10'}`}>
            <div className="text-xs font-medium text-foreground mb-1">成本与耗时预估</div>
            <p className="text-xs text-muted-foreground leading-5">
              {estimate.summary}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {estimate.factors.map((factor) => (
                <span key={factor} className="rounded bg-background/70 px-2 py-0.5 text-[10px] text-muted-foreground">{factor}</span>
              ))}
            </div>
          </div>
          <div className="rounded-md border border-border bg-secondary/50 p-3">
            <div className="text-[11px] text-muted-foreground mb-1">输入摘要</div>
            <p className="text-sm text-foreground line-clamp-3">{inputPreview || '无输入'}</p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <StatusPill ok={textCount > 0} label={`${textCount}/${dsl.segments.length} 文案`} />
            <StatusPill ok={sceneCount > 0} label={`${sceneCount}/${dsl.segments.length} 场景`} />
            <StatusPill ok={brandReady} label={dsl.globalConfig.brand_pack_id ? '品牌包' : '品牌'} />
            <StatusPill ok={musicEnabled} label="音乐" />
            <StatusPill ok={transitionEnabled} label="转场" />
            <StatusPill ok={ready} label={ready ? '可提交' : '有阻塞'} />
          </div>
          {activeProviders.length > 0 && (
            <div className="rounded-md border border-border bg-background p-3">
              <div className="text-[11px] text-muted-foreground mb-2">供应商与运行环境</div>
              <div className="grid grid-cols-2 gap-2">
                {activeProviders.map((provider) => (
                  <div key={provider.key} className="flex items-start gap-2 rounded-md bg-secondary/70 px-2 py-1.5">
                    {provider.configured ? <IconCheck size={13} className="text-brand-green mt-0.5" /> : <IconAlertCircle size={13} className="text-brand-amber mt-0.5" />}
                    <div className="min-w-0">
                      <div className="text-xs text-foreground truncate">{provider.name}</div>
                      <div className="text-[10px] text-muted-foreground">{provider.configured ? '已配置' : '未配置/不可用'}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {(pipelineBlockers.length > 0 || pipelineWarnings.length > 0) && (
            <div className="rounded-md border border-brand-amber/30 bg-brand-amber/10 p-3">
              <div className="text-xs font-medium text-brand-amber flex items-center gap-1 mb-2">
                <IconAlertCircle size={14} />
                运行风险
              </div>
              <ul className="space-y-1 text-xs text-muted-foreground">
                {pipelineBlockers.map((item) => <li key={item} className="text-destructive">{item}</li>)}
                {pipelineWarnings.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          )}
          {showHfPipelineCta && (
            <div className="rounded-md border border-brand-blue/35 bg-brand-blue/10 p-3">
              <div className="text-xs font-medium text-foreground mb-1">动效样式需 HyperFrames 流水线</div>
              <p className="text-xs text-muted-foreground leading-5 mb-3">
                当前模板使用了 HyperFrames 动效{usesHfSubtitles && usesHfTransitions ? '字幕与转场' : usesHfSubtitles ? '字幕' : '转场'}。
                切换到「HyperFrames 模板」流水线可保留预览中的动效；否则成片将降级或忽略相关效果。
              </p>
              <button
                type="button"
                onClick={onSwitchToHfPipeline}
                className="h-8 px-3 text-xs rounded-md bg-brand-blue text-white hover:opacity-90"
              >
                切换为 HyperFrames 模板流水线
              </button>
            </div>
          )}
          {warnings && warnings.length > 0 && (
            <div className="rounded-md border border-border bg-secondary/50 p-3">
              <div className="text-xs font-medium text-muted-foreground mb-2">建议项（不阻塞提交）</div>
              <ul className="space-y-1 text-xs text-muted-foreground">
                {warnings.map((w) => <li key={w}>{w}</li>)}
              </ul>
            </div>
          )}
          {issues.length > 0 && (
            <div className="rounded-md border border-brand-amber/30 bg-brand-amber/10 p-3">
              <div className="text-xs font-medium text-brand-amber flex items-center gap-1 mb-2">
                <IconAlertCircle size={14} />
                需要处理
              </div>
              <ul className="space-y-1">
                {issues.map((issue) => (
                  <li key={issue}>
                    <button
                      type="button"
                      onClick={() => onIssueClick(issue)}
                      className="w-full text-left text-xs text-muted-foreground hover:text-foreground hover:bg-background/70 rounded px-2 py-1 flex items-center justify-between gap-2"
                    >
                      <span>{issue}</span>
                      <span className="text-[10px] text-brand-amber shrink-0">去处理</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="px-5 py-4 border-t border-border flex justify-end gap-2">
          <button onClick={onCancel} className="h-9 px-4 text-sm rounded-md bg-secondary text-secondary-foreground hover:bg-accent">返回编辑</button>
          <button
            onClick={onConfirm}
            disabled={!ready}
            className="h-9 px-4 text-sm rounded-md bg-primary text-primary-foreground disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            <IconZap size={15} />
            提交生成
          </button>
        </div>
      </div>
    </div>
  );
}