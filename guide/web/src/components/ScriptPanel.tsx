import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useEditorStore } from '../store/editorStore';
import type { DSL, Segment } from '../store/editorStore';
import { normalizeSegmentObjects } from '../utils/elementTiming';
import { applyVariableSubstitution } from '../utils/dslNormalize';
import SegmentTtsPreview from './SegmentTtsPreview';
import { isHyperframesSubtitleStyle } from '@shared/subtitleStyles';

interface Props {
  dsl: DSL;
  currentSegIndex: number;
  variableValues: Record<string, string>;
  editorId?: string;
  onSelectScene: (index: number) => void;
  onUpdateSegment: (index: number, patch: Partial<Segment>) => void;
  onPickScript?: () => void;
}

export default function ScriptPanel({
  dsl,
  currentSegIndex,
  variableValues,
  editorId,
  onSelectScene,
  onUpdateSegment,
  onPickScript,
}: Props) {
  const totalDuration = useMemo(
    () => dsl.segments.reduce((sum, s) => sum + Number(s.duration_sec || 0), 0),
    [dsl.segments],
  );

  const polishScene = async (index: number) => {
    const seg = dsl.segments[index];
    const text = seg?.narration_text?.trim();
    if (!text) return;
    const brandName = String(
      (dsl.globalConfig.brand_pack as { name?: string } | undefined)?.name
      || dsl.meta.name
      || '',
    );
    try {
      const res = await fetch('/api/ai/polish-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, tone: '导购', brand_name: brandName }),
      });
      const data = await res.json();
      if (res.ok && data.text && data.text !== text) {
        onUpdateSegment(index, { narration_text: data.text });
      }
    } catch {
      /* keep original */
    }
  };

  return (
    <div className="flex h-full flex-col bg-card">
      <div className="flex items-center justify-between border-b border-border px-3 py-2 shrink-0 gap-2">
        <div className="text-xs font-medium text-foreground min-w-0 truncate">
          共 {dsl.segments.length} 个分镜 · 预计 {totalDuration.toFixed(1)}s
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {onPickScript && (
            <button
              type="button"
              onClick={onPickScript}
              className="rounded-md border border-border px-2 py-1 text-[10px] text-brand-blue hover:bg-brand-blue/10"
            >
              资产库脚本
            </button>
          )}
          {editorId && (
            <Link
              to={`/assets?tab=script&from=${encodeURIComponent(`/editor/${editorId}`)}`}
              className="rounded-md border border-border px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground hover:bg-accent"
            >
              管理
            </Link>
          )}
          <button
            type="button"
            className="rounded-md bg-brand-blue/10 px-2 py-1 text-[10px] font-medium text-brand-blue hover:bg-brand-blue/20 disabled:opacity-40"
            title="配置 LLM 后使用大模型润色，否则回退规则模板"
            disabled={!dsl.segments[currentSegIndex]?.narration_text?.trim()}
            onClick={() => void polishScene(currentSegIndex)}
          >
            润色
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-3 min-h-0">
        <div className="flex flex-col gap-3">
          {dsl.segments.map((seg, index) => {
            const preview = applyVariableSubstitution(seg.narration_text || '', variableValues);
            const showPreview = preview !== (seg.narration_text || '');
            return (
              <div
                key={seg.id}
                onClick={() => onSelectScene(index)}
                className={`rounded-lg border p-3 transition cursor-text ${
                  currentSegIndex === index
                    ? 'border-brand-blue bg-brand-blue/5 ring-1 ring-brand-blue'
                    : 'border-border bg-background hover:border-foreground/30'
                }`}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-muted-foreground">
                    分镜 {index + 1}
                    {seg.type === 'scene' ? ' · 场景' : seg.type === 'product' ? ' · 产品' : ''}
                  </span>
                  <label className="flex items-center gap-1 text-[11px] text-muted-foreground shrink-0">
                    时长
                    <input
                      type="number"
                      min={1}
                      max={60}
                      step={0.5}
                      value={seg.duration_sec}
                      onChange={(e) => onUpdateSegment(
                        index,
                        normalizeSegmentObjects({ ...seg, duration_sec: Math.max(1, Number(e.target.value)) }),
                      )}
                      onClick={(e) => e.stopPropagation()}
                      className="w-12 rounded-md border border-border bg-background px-1 py-0.5 text-right text-[11px]"
                    />
                    s
                  </label>
                </div>
                <textarea
                  value={seg.narration_text}
                  onChange={(e) => onUpdateSegment(index, { narration_text: e.target.value })}
                  onClick={(e) => e.stopPropagation()}
                  rows={2}
                  className="w-full resize-none rounded-md border border-border bg-secondary/30 p-2 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring"
                  placeholder="输入该分镜的口播文案，可用 {变量名} 占位…"
                />
                {showPreview && (
                  <p className="mt-1.5 text-[10px] text-muted-foreground truncate">预览：{preview}</p>
                )}
                {seg.subtitle?.enabled && isHyperframesSubtitleStyle(seg.subtitle.style_id) && (
                  <div onClick={(e) => e.stopPropagation()}>
                    <SegmentTtsPreview
                      compact
                      text={preview || seg.narration_text || ''}
                      segment={seg}
                      voiceId={seg.voice_id}
                      onApply={(patch) => onUpdateSegment(index, patch)}
                    />
                  </div>
                )}
                {seg.scene_description && (
                  <p className="mt-1 text-[10px] text-muted-foreground/80 truncate">画面：{seg.scene_description}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}