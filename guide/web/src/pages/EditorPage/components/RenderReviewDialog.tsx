import type { PipelineOption } from '@shared/data/pipelines';
import { resolveDiagnosticsPipelineKey } from '@shared/data/pipelines';
import type { ConfigDiagnostics, DSL } from '@shared/types/editor';
import { IconAlertCircle, IconCheck, IconZap } from '../../../components/Icons';
import { estimateRenderCostRisk, getGenerationExpectation } from '../utils/renderIssues';

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
}) {
  const totalDuration = dsl.segments.reduce((sum, seg) => sum + Number(seg.duration_sec || 0), 0);
  const estimate = estimateRenderCostRisk(dsl, pipeline, diagnostics);
  const expectation = getGenerationExpectation(dsl, pipeline, diagnostics);
  const diagKey = pipeline ? resolveDiagnosticsPipelineKey(pipeline.key) : '';
  const pipelineDiagnostics = diagKey ? diagnostics?.pipelines?.[diagKey] : undefined;
  const pipelineBlockers = pipelineDiagnostics?.blockers || [];
  const pipelineWarnings = pipelineDiagnostics?.warnings || [];
  const riskNotes = [...pipelineBlockers, ...pipelineWarnings, ...warnings].filter(Boolean);

  const inputHint =
    inputMode === 'topic'
      ? (topic.trim() || '未填写主题')
      : inputMode === 'script'
        ? (scriptText.trim().slice(0, 60) || '未填写脚本')
        : null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="render-review-title"
        className="w-[400px] max-w-full bg-card border border-border rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3">
          <h2 id="render-review-title" className="text-[15px] font-semibold text-foreground">确认生成视频</h2>
          <button
            type="button"
            onClick={onCancel}
            className="w-8 h-8 shrink-0 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent"
            aria-label="关闭"
          >
            ×
          </button>
        </div>

        <div className="px-4 py-3 border-b border-border bg-secondary/30">
          <p className="text-[13px] font-medium text-foreground">{expectation.oneLine}</p>
          {expectation.aiFills.length > 0 && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              缺槽检测：将 AI 补 {expectation.aiFills.join('、')}
            </p>
          )}
        </div>

        <div className="px-4 py-3 space-y-3 max-h-[min(260px,50vh)] overflow-y-auto">
          <p className="text-[13px] text-foreground leading-relaxed">
            <span className="font-medium">{dsl.segments.length} 镜头</span>
            <span className="text-muted-foreground"> · </span>
            就绪 {expectation.readyShots} · 待完善 {expectation.warningShots} · 缺素材 {expectation.missingShots}
            <span className="text-muted-foreground"> · </span>
            {totalDuration}s
            <span className="text-muted-foreground"> · </span>
            {selectedDhId ? '数字人已选' : '未选数字人'}
            <span className="text-muted-foreground"> · </span>
            约 {estimate.durationRange}
          </p>

          {inputHint && (
            <p className="text-[11px] text-muted-foreground line-clamp-2">
              {inputMode === 'topic' ? '主题：' : '脚本：'}
              {inputHint}
            </p>
          )}

          {ready && riskNotes.length === 0 && (
            <div className="flex items-center gap-1.5 text-[12px] text-brand-green">
              <IconCheck size={14} />
              检查通过，可提交生成
            </div>
          )}

          {issues.length > 0 && (
            <div className="rounded-md border border-brand-amber/30 bg-brand-amber/10 p-2.5">
              <div className="text-[11px] font-medium text-brand-amber flex items-center gap-1 mb-1.5">
                <IconAlertCircle size={13} />
                需要先处理
              </div>
              <ul className="space-y-0.5">
                {issues.map((issue) => (
                  <li key={issue}>
                    <button
                      type="button"
                      onClick={() => onIssueClick(issue)}
                      className="w-full text-left text-[12px] text-muted-foreground hover:text-foreground rounded px-1 py-0.5 flex items-center justify-between gap-2"
                    >
                      <span>{issue}</span>
                      <span className="text-[10px] text-brand-amber shrink-0">去处理</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {riskNotes.length > 0 && (
            <div className="rounded-md border border-border bg-secondary/40 p-2.5">
              <div className="text-[11px] font-medium text-muted-foreground mb-1">运行提示</div>
              <ul className="space-y-0.5 text-[11px] text-muted-foreground">
                {riskNotes.slice(0, 4).map((item) => (
                  <li key={item} className={pipelineBlockers.includes(item) ? 'text-destructive' : undefined}>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-border flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="h-9 px-3 text-[13px] rounded-md bg-secondary text-secondary-foreground hover:bg-accent"
          >
            返回编辑
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!ready}
            className="h-9 px-4 text-[13px] rounded-md bg-primary text-primary-foreground disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            <IconZap size={15} />
            提交生成
          </button>
        </div>
      </div>
    </div>
  );
}