import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { DSL, Segment } from '@shared/types/editor';
import type { LibraryItem } from '../../../../types/library';
import { HfGlobalOverlayPanel } from '../../../../components/HfGlobalOverlayPanel';
import SegmentTtsPreview from '../../../../components/SegmentTtsPreview';
import { SubtitleStyleHint, SubtitleStyleSelect } from '../../../../components/SubtitleStylePicker';
import { TransitionStyleHint, TransitionStyleSelect } from '../../../../components/TransitionStylePicker';
import { IconSettings2, IconSparkles, IconType, IconZap } from '../../../../components/Icons';
import { isHyperframesTransitionType } from '@shared/hfTransitionRenderer';
import { segmentUsesTtsWordTimings } from '@shared/captionWordTimings';
import { isHyperframesSubtitleStyle } from '@shared/subtitleStyles';
import {
  getBrandLookPresetHints,
  isCustomRecommendedLookPreset,
  partitionLookPresetsForBrand,
} from '@shared/brandLookPreset';
import { applyLookPresetToDsl, migrateLookPresetPayload, parseLookPresetPayload } from '@shared/lookPreset';
import LookPresetStaleBadge from '../../../../components/LookPresetStaleBadge';
import LookPresetThumb from '../../../../components/LookPresetThumb';
import { normalizeLookPresetOverlays } from '../../../../components/LookPresetOverlayFields';
import { assetHubHref, fetchLibraryItems } from '../../../../utils/libraryApi';
import PanelSection from '../common/PanelSection';

function PresetList({
  items,
  onApply,
  accent,
  recommendedLibraryIds = [],
}: {
  items: LibraryItem[];
  onApply: (item: LibraryItem) => void;
  accent?: boolean;
  recommendedLibraryIds?: string[];
}) {
  if (!items.length) return null;
  return (
    <div className="space-y-1.5">
      {items.map((item) => {
        const key = String(item.payload?.seed_id || item.id);
        const isCustom = accent && isCustomRecommendedLookPreset(item, recommendedLibraryIds);
        return (
        <button
          key={item.id}
          type="button"
          data-testid={`motion-preset-apply-${key}`}
          onClick={() => onApply(item)}
          className={`w-full text-left rounded-md border px-2 py-2 transition-colors flex gap-2 ${
            accent
              ? 'border-brand-blue/35 hover:border-brand-blue/60 hover:bg-brand-blue/5'
              : 'border-border hover:border-brand-blue/40 hover:bg-accent'
          }`}
        >
          <div
            className="w-[4.5rem] aspect-[4/3] shrink-0 rounded overflow-hidden border border-border/60"
            data-testid={`motion-preset-thumb-${key}`}
          >
            <LookPresetThumb
              subtitleStyleId={String(item.payload?.subtitle_style_id || '')}
              transitionType={String(item.payload?.transition_type || '')}
              hfOverlays={normalizeLookPresetOverlays(item.payload?.hf_overlays)}
              testId={`motion-preset-thumb-inner-${key}`}
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium flex items-center gap-1.5 flex-wrap">
              <span className="truncate">{item.name}</span>
              {isCustom ? (
                <span
                  className="inline-flex items-center rounded px-1 py-0.5 text-[9px] font-medium bg-amber-100 text-amber-800 border border-amber-200 shrink-0"
                  data-testid={`motion-preset-custom-${item.id}`}
                >
                  自定义
                </span>
              ) : null}
              <LookPresetStaleBadge registryVersion={String(item.payload?.registry_version || '')} />
            </div>
            {item.description && (
              <div className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{item.description}</div>
            )}
          </div>
        </button>
        );
      })}
    </div>
  );
}

export default function MotionPanel({
  dsl,
  editorId,
  currentSegIndex,
  updateDsl,
}: {
  dsl: DSL;
  editorId: string;
  currentSegIndex: number;
  updateDsl: (updater: (dsl: DSL) => DSL) => void;
}) {
  const seg = dsl.segments[currentSegIndex];
  const cfg = dsl.globalConfig;
  const [lookPresets, setLookPresets] = useState<LibraryItem[]>([]);
  const [loadingPresets, setLoadingPresets] = useState(false);
  const [presetMigrationNote, setPresetMigrationNote] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setLoadingPresets(true);
    fetchLibraryItems({ category: 'look_preset', limit: 80, signal: controller.signal })
      .then((items) => setLookPresets(items))
      .catch(() => setLookPresets([]))
      .finally(() => setLoadingPresets(false));
    return () => controller.abort();
  }, []);

  const brandPack = cfg.brand_pack as Record<string, unknown> | undefined;
  const { recommended, others } = useMemo(
    () => partitionLookPresetsForBrand(brandPack, lookPresets),
    [brandPack, lookPresets],
  );
  const recommendedLibraryIds = useMemo(
    () => getBrandLookPresetHints(brandPack).recommendedLibraryIds,
    [brandPack],
  );

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

  const applyLookPreset = (item: LibraryItem) => {
    const parsed = parseLookPresetPayload(item.payload);
    if (!parsed) return;
    const { payload, migrated, reason } = migrateLookPresetPayload(parsed);
    if (migrated) {
      const hint = reason === 'seed_sync'
        ? `已按内置种子同步「${item.name}」`
        : `已将「${item.name}」同步至最新 HF 注册表`;
      setPresetMigrationNote(hint);
      window.setTimeout(() => setPresetMigrationNote(''), 6000);
    }
    updateDsl((draft) => applyLookPresetToDsl(draft, payload, { currentSegIndex }));
  };

  return (
    <div className="p-4 space-y-4">
      <p className="text-[11px] text-muted-foreground -mt-1">
        字幕动效、转场与全局质感集中在此；布局与字体细节可在「对象」面板调整。
      </p>

      <PanelSection title="外观预设" icon={<IconZap size={15} />}>
        <div className="flex items-center justify-between gap-2 mb-2">
          <p className="text-[10px] text-muted-foreground">一键套用字幕 + 转场 + 质感组合</p>
          <Link
            to={assetHubHref(editorId, 'look_preset')}
            className="text-[10px] text-brand-blue hover:underline shrink-0"
          >
            管理
          </Link>
        </div>
        {loadingPresets ? (
          <p className="text-[11px] text-muted-foreground">加载预设…</p>
        ) : lookPresets.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            暂无外观预设。
            <Link to={assetHubHref(editorId, 'look_preset')} className="text-brand-blue hover:underline ml-1">
              去资产库添加
            </Link>
          </p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {recommended.length > 0 && (
              <div>
                <p className="text-[10px] font-medium text-brand-blue mb-1">品牌推荐</p>
                <PresetList
                  items={recommended}
                  onApply={applyLookPreset}
                  accent
                  recommendedLibraryIds={recommendedLibraryIds}
                />
              </div>
            )}
            {others.length > 0 && (
              <div>
                {recommended.length > 0 && (
                  <p className="text-[10px] text-muted-foreground mb-1">更多预设</p>
                )}
                <PresetList items={others} onApply={applyLookPreset} />
              </div>
            )}
          </div>
        )}
        {presetMigrationNote ? (
          <p className="mt-2 text-[10px] text-amber-700" data-testid="look-preset-migration-note">{presetMigrationNote}</p>
        ) : null}
        <p className="mt-2 text-[10px] text-muted-foreground">应用后可撤销（Ctrl+Z）。含 HF 动效时请使用「模板编辑器」流水线，成片后自动叠加动效层。</p>
      </PanelSection>

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
            checked={(cfg.transition_enabled ?? false) || seg.transition.type !== 'none'}
            onChange={(e) => {
              updateGlobal({ transition_enabled: e.target.checked });
              updateSeg({ transition: { ...seg.transition, type: e.target.checked ? 'fade' : 'none' } });
            }}
          />
        </label>
        <div className="mt-3">
          <TransitionStyleSelect
            data-testid="segment-transition-type"
            value={seg.transition.type}
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
        <TransitionStyleHint type={seg.transition.type} />
        {seg.transition.type !== 'none' && (
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
        )}
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
      </PanelSection>

      <PanelSection title="画面质感" icon={<IconSparkles size={15} />}>
        <HfGlobalOverlayPanel
          overlays={cfg.hf_overlays}
          brandColor={cfg.brand_color}
          onChange={(hf_overlays) => updateGlobal({ hf_overlays })}
        />
      </PanelSection>
    </div>
  );
}