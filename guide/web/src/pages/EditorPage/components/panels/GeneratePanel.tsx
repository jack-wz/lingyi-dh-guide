import { Link } from 'react-router-dom';
import type { ConfigDiagnostics, DSL } from '@shared/types/editor';
import { IconAlertCircle, IconCheck, IconType, IconZap } from '../../../../components/Icons';
import { estimateRenderCostRisk, getRenderIssues } from '../../utils/renderIssues';
import { getPipelineDisplayName, getPreviewRenderAlignment } from '../../../../utils/previewRenderAlignment';
import type { RenderControlProps } from '../../types';

export default function GeneratePanel({
  dsl,
  editorId,
  pipelines,
  pipelineKey,
  setPipelineKey,
  inputMode,
  setInputMode,
  topic,
  setTopic,
  scriptText,
  setScriptText,
  selectedDhId,
  variableValues,
  setVariableValues,
  onRender,
  diagnostics,
  onPickScript,
}: RenderControlProps) {
  const pipeline = pipelines.find(p => p.key === pipelineKey);
  const issues = getRenderIssues(dsl, pipeline, selectedDhId, inputMode, topic, scriptText, diagnostics, variableValues);
  const duration = dsl.segments.reduce((sum, seg) => sum + Number(seg.duration_sec || 0), 0);
  const ready = issues.length === 0;
  const pipelineDiagnostics = pipeline ? diagnostics?.pipelines?.[pipeline.key] : undefined;
  const providerWarnings = pipelineDiagnostics?.warnings || [];
  const providerBlockers = pipelineDiagnostics?.blockers || [];
  const providerStatus = providerBlockers.length > 0
    ? providerBlockers[0]
    : providerWarnings.length > 0
      ? `${providerWarnings.length} 项降级风险`
      : diagnostics
        ? '供应商就绪'
        : '诊断加载中';
  const estimate = estimateRenderCostRisk(dsl, pipeline, diagnostics);
  const alignment = getPreviewRenderAlignment(pipelineKey);

  return (
    <div className="p-4 space-y-4">
      <div className="rounded-lg border border-border bg-secondary/40 p-3 space-y-3">
        <div className="flex items-center gap-2">
          <IconZap size={16} className="text-brand-blue" />
          <span className="text-sm font-semibold">生成设置</span>
          <span className={`ml-auto text-[11px] flex items-center gap-1 ${ready ? 'text-brand-green' : 'text-brand-amber'}`}>
            {ready ? <IconCheck size={13} /> : <IconAlertCircle size={13} />}
            {ready ? '可生成' : issues[0]}
          </span>
        </div>

        <div>
          <label className="block text-[10px] text-muted-foreground mb-1">流水线</label>
          <select
            value={pipelineKey}
            onChange={(e) => setPipelineKey(e.target.value)}
            className="w-full h-9 rounded-md border border-border bg-background px-3 text-[12px] outline-none"
          >
            {pipelines.map(p => <option key={p.key} value={p.key}>{p.name}</option>)}
          </select>
          <p className="mt-1 text-[10px] text-muted-foreground">{pipeline?.description || '加载流水线...'}</p>
          <div
            className={`mt-2 rounded-md border px-2.5 py-2 text-[10px] leading-relaxed ${
              alignment.tier === 'exact'
                ? 'border-brand-green/30 bg-brand-green/10 text-brand-green'
                : alignment.tier === 'layout'
                  ? 'border-brand-blue/30 bg-brand-blue/5 text-muted-foreground'
                  : 'border-brand-amber/30 bg-brand-amber/10 text-muted-foreground'
            }`}
          >
            <span className="font-medium text-foreground">{alignment.title}</span>
            <span className="mx-1">·</span>
            {alignment.detail}
            {alignment.recommendPipeline && pipelineKey !== alignment.recommendPipeline && (
              <button
                type="button"
                className="ml-2 text-brand-blue hover:underline"
                onClick={() => setPipelineKey(alignment.recommendPipeline!)}
              >
                切换为{getPipelineDisplayName(alignment.recommendPipeline)}
              </button>
            )}
          </div>
        </div>

        <div>
          <label className="block text-[10px] text-muted-foreground mb-1">输入模式</label>
          <div className="flex rounded-md border border-border overflow-hidden h-9">
            {[
              ['template', '模板'],
              ['topic', '主题'],
              ['script', '脚本'],
            ].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setInputMode(key as 'template' | 'topic' | 'script')}
                className={`flex-1 text-[12px] ${inputMode === key ? 'bg-foreground text-background' : 'bg-background text-muted-foreground hover:text-foreground'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-[10px] text-muted-foreground mb-1">生成输入</label>
          {inputMode === 'topic' ? (
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="输入主题，后续可接入大语言模型自动拆分分镜"
              className="w-full h-9 rounded-md border border-border bg-background px-3 text-[12px] outline-none"
            />
          ) : inputMode === 'script' ? (
            <input
              value={scriptText}
              onChange={(e) => setScriptText(e.target.value)}
              placeholder="粘贴固定脚本，按行/段落拆分能力后续接入"
              className="w-full h-9 rounded-md border border-border bg-background px-3 text-[12px] outline-none"
            />
          ) : (
            <div className="h-9 rounded-md border border-border bg-secondary px-3 flex items-center gap-2 text-[12px] text-muted-foreground">
              <IconType size={14} />
              使用当前模板中的 {dsl.segments.length} 个片段，预计 {duration}s
            </div>
          )}
        </div>

        {(dsl.variables?.length ?? 0) > 0 && (
          <div className="space-y-2">
            <label className="block text-[10px] text-muted-foreground">模板变量</label>
            {dsl.variables!.map((v) => (
              <div key={v.name}>
                <label className="block text-[10px] text-muted-foreground mb-0.5">
                  {v.label || v.name}{v.required ? ' *' : ''}
                </label>
                <input
                  value={variableValues[v.name] ?? ''}
                  onChange={(e) => setVariableValues({ ...variableValues, [v.name]: e.target.value })}
                  className="w-full h-9 rounded-md border border-border bg-background px-3 text-[12px] outline-none"
                  placeholder={v.example_value || v.description}
                />
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div className="rounded-md bg-background border border-border p-2">
            <div className="text-[10px] text-muted-foreground">数字人</div>
            <div className={`font-medium ${selectedDhId ? 'text-brand-green' : 'text-destructive'}`}>{selectedDhId ? '已选择' : '未选择'}</div>
          </div>
          <div className="rounded-md bg-background border border-border p-2">
            <div className="text-[10px] text-muted-foreground">供应商状态</div>
            <div className={`font-medium ${providerBlockers.length > 0 ? 'text-destructive' : providerWarnings.length > 0 ? 'text-brand-amber' : 'text-brand-green'}`}>{providerStatus}</div>
          </div>
          <div className="rounded-md bg-background border border-border p-2">
            <div className="text-[10px] text-muted-foreground">预计成本</div>
            <div className={`font-medium ${estimate.level === 'high' ? 'text-destructive' : estimate.level === 'medium' ? 'text-brand-amber' : 'text-brand-green'}`}>{estimate.costLabel}</div>
          </div>
          <div className="rounded-md bg-background border border-border p-2">
            <div className="text-[10px] text-muted-foreground">预计耗时</div>
            <div className="font-medium text-foreground">{estimate.durationRange}</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {onPickScript && (
            <button type="button" onClick={onPickScript} className="text-[11px] text-brand-blue hover:underline">
              从资产库选脚本
            </button>
          )}
          <Link
            to="/"
            className="text-[11px] text-brand-blue hover:underline no-underline"
          >
            模板中心
          </Link>
          <Link
            to={editorId ? `/assets?from=${encodeURIComponent(`/editor/${editorId}`)}` : '/assets'}
            className="text-[11px] text-brand-blue hover:underline no-underline"
          >
            资产库
          </Link>
        </div>
        <p className="text-[10px] text-muted-foreground leading-5 rounded-md border border-dashed border-border px-3 py-2">
          配置完成后，点击「生成视频」进入复核并提交。
        </p>
      </div>
    </div>
  );
}
