import type { DSL, Segment } from '@shared/types/editor';
import SegmentTtsPreview from '../../../../components/SegmentTtsPreview';
import { SubtitleStyleHint, SubtitleStyleSelect } from '../../../../components/SubtitleStylePicker';
import { TransitionStyleHint, TransitionStyleSelect } from '../../../../components/TransitionStylePicker';
import { IconSettings2, IconType } from '../../../../components/Icons';
import { isHyperframesTransitionType } from '@shared/hfTransitionRenderer';
import { segmentUsesTtsWordTimings } from '@shared/captionWordTimings';
import { isHyperframesSubtitleStyle } from '@shared/subtitleStyles';
import PanelSection from '../common/PanelSection';
export default function MotionPanel({
  dsl,
  currentSegIndex,
  updateDsl,
}: {
  dsl: DSL;
  currentSegIndex: number;
  updateDsl: (updater: (dsl: DSL) => DSL) => void;
}) {
  const seg = dsl.segments[currentSegIndex];
  const cfg = dsl.globalConfig;

  const updateGlobal = (partial: Partial<DSL['globalConfig']>) => {
    updateDsl((draft) => ({ ...draft, globalConfig: { ...draft.globalConfig, ...partial } }));
  };
  const updateSeg = (partial: Partial<Segment>) => {
    updateDsl((draft) => {
      const segments = [...draft.segments];
      segments[currentSegIndex] = { ...segments[currentSegIndex], ...partial };
      return { ...draft, segments };
    });
  };

  const transitionEnabled = cfg.transition_enabled ?? seg.transition.type !== 'none';

  return (
    <div className="p-4 space-y-4">
      <p className="text-[11px] text-muted-foreground -mt-1">
        字幕动效与场景转场集中在此；默认无转场，可在下方开启。
      </p>

      <PanelSection title="字幕动效" icon={<IconType size={15} />}>
        <label className="block text-xs text-muted-foreground mb-1">当前分镜字幕样式</label>
        <SubtitleStyleSelect
          value={seg.subtitle.style_id}
          onChange={(styleId) => updateSeg({ subtitle: { ...seg.subtitle, enabled: true, style_id: styleId } })}
        />
        <SubtitleStyleHint styleId={seg.subtitle.style_id} />
        {isHyperframesSubtitleStyle(seg.subtitle.style_id) && (
          <>
            <p className="mt-2 text-[10px] text-muted-foreground leading-relaxed">
              {segmentUsesTtsWordTimings(seg)
                ? '已绑定 TTS 词级时间轴，卡拉 OK 将与配音对齐。'
                : '预览使用估算词级时间轴；可试听对齐，或成片后自动 Whisper 对齐。'}
            </p>
            <SegmentTtsPreview
              text={seg.narration_text || ''}
              segment={seg}
              voiceId={seg.voice_id}
              onApply={(patch) => updateSeg(patch)}
            />
            <div className="mt-3">
              <label className="block text-xs text-muted-foreground mb-1">强调词（逗号分隔）</label>
              <input
                value={(seg.subtitle.hf_params?.emphasis_words || []).join('，')}
                onChange={(e) => {
                  const emphasis_words = e.target.value
                    .split(/[,，]/)
                    .map((w) => w.trim())
                    .filter(Boolean);
                  updateSeg({
                    subtitle: {
                      ...seg.subtitle,
                      hf_params: { ...seg.subtitle.hf_params, emphasis_words },
                    },
                  });
                }}
                placeholder="例如：限时特惠，新品"
                className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm"
              />
            </div>
          </>
        )}
        <button
          type="button"
          onClick={() => {
            const styleId = seg.subtitle.style_id;
            updateDsl((draft) => ({
              ...draft,
              segments: draft.segments.map((segment) => (
                segment.subtitle.enabled || String(segment.narration_text || '').trim()
                  ? { ...segment, subtitle: { ...segment.subtitle, style_id: styleId } }
                  : segment
              )),
            }));
          }}
          className="mt-2 h-8 w-full rounded-md border border-border text-[11px] hover:bg-accent"
        >
          同步样式到全部分镜
        </button>
      </PanelSection>

      <PanelSection title="场景转场" icon={<IconSettings2 size={15} />}>
        <label className="flex items-center justify-between text-sm">
          启用转场
          <input
            type="checkbox"
            checked={transitionEnabled}
            onChange={(e) => {
              const enabled = e.target.checked;
              updateGlobal({ transition_enabled: enabled });
              updateSeg({ transition: { ...seg.transition, type: enabled ? 'fade' : 'none' } });
            }}
          />
        </label>
        {transitionEnabled && (
          <>
            <div className="mt-3">
              <TransitionStyleSelect
                data-testid="segment-transition-type"
                value={seg.transition.type === 'none' ? 'fade' : seg.transition.type}
                onChange={(type) => updateSeg({
                  transition: {
                    ...seg.transition,
                    type,
                    duration: isHyperframesTransitionType(type)
                      ? Math.max(0.4, Number(seg.transition.duration) || 0.6)
                      : seg.transition.duration,
                  },
                })}
              />
            </div>
            <TransitionStyleHint type={seg.transition.type === 'none' ? 'fade' : seg.transition.type} />
            <div className="mt-3">
              <label className="block text-xs text-muted-foreground mb-1">转场时长（秒）</label>
              <input
                type="number"
                min={0.2}
                max={2}
                step={0.1}
                value={seg.transition.duration}
                onChange={(e) => updateSeg({
                  transition: { ...seg.transition, duration: Math.max(0.2, Number(e.target.value) || 0.5) },
                })}
                className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                const { type, duration } = seg.transition;
                if (type === 'none') return;
                updateDsl((draft) => ({
                  ...draft,
                  globalConfig: { ...draft.globalConfig, transition_enabled: true },
                  segments: draft.segments.map((segment, index) => (
                    index < draft.segments.length - 1
                      ? { ...segment, transition: { ...segment.transition, type, duration } }
                      : segment
                  )),
                }));
              }}
              className="mt-2 h-8 w-full rounded-md border border-border text-[11px] hover:bg-accent"
            >
              同步转场到全部分镜
            </button>
          </>
        )}
      </PanelSection>
    </div>
  );
}