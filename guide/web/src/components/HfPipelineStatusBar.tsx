import { dslUsesAnyHyperframesFeatures, summarizeHyperframesFeatures } from '@shared/lookPreset';
import { pipelineUsesHyperframesStyleLayer } from '@shared/hfStylePass';
import type { DSL } from '@shared/types/editor';
import { IconCheck, IconZap } from './Icons';

export default function HfPipelineStatusBar({
  dsl,
  pipelineKey,
  onOpenMotionPanel,
}: {
  dsl: DSL;
  pipelineKey: string;
  onOpenMotionPanel?: () => void;
}) {
  const usesHf = dslUsesAnyHyperframesFeatures(dsl);
  if (!usesHf) return null;

  const summary = summarizeHyperframesFeatures(dsl);
  const styleLayerReady = pipelineUsesHyperframesStyleLayer(pipelineKey);

  return (
    <div
      className={`shrink-0 px-4 py-1.5 border-b text-[11px] flex items-center gap-2 min-w-0 ${
        styleLayerReady
          ? 'bg-brand-green/5 border-brand-green/20 text-foreground'
          : 'bg-brand-amber/5 border-brand-amber/25 text-foreground'
      }`}
      data-testid="hf-pipeline-status"
    >
      <IconZap size={14} className={styleLayerReady ? 'text-brand-green shrink-0' : 'text-brand-amber shrink-0'} />
      <span className="truncate">
        HF 动效 {summary.total} 项
        {summary.subtitleCount > 0 && ` · 字幕 ${summary.subtitleCount}`}
        {summary.transitionCount > 0 && ` · 转场 ${summary.transitionCount}`}
        {summary.overlayCount > 0 && ` · 质感 ${summary.overlayCount}`}
        {' · '}
        {styleLayerReady
          ? '成片流程：场景生成 → FFmpeg 单路径（字幕/转场/质感）'
          : '请使用「模板编辑器」流水线以保留动效样式'}
      </span>
      {styleLayerReady && (
        <span className="hidden sm:inline text-brand-green shrink-0 flex items-center gap-0.5">
          <IconCheck size={12} /> FFmpeg 动效已映射
        </span>
      )}
      <div className="ml-auto flex items-center gap-1.5 shrink-0">
        {onOpenMotionPanel && (
          <button
            type="button"
            onClick={onOpenMotionPanel}
            className="h-6 px-2 rounded border border-border hover:bg-accent text-[10px]"
          >
            动效面板
          </button>
        )}
      </div>
    </div>
  );
}