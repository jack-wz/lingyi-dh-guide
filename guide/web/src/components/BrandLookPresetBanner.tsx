import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { DSL } from '@shared/types/editor';
import type { LibraryItem } from '../types/library';
import {
  buildBrandLookApplyAllToastMessage,
  getBrandLookPresetHints,
  isCustomRecommendedLookPreset,
  partitionLookPresetsForBrand,
  pickDefaultBrandLookPresetItem,
} from '@shared/brandLookPreset';
import { applyLookPresetToDsl, migrateLookPresetPayload, parseLookPresetPayload } from '@shared/lookPreset';
import { assetHubHref, fetchLibraryItems } from '../utils/libraryApi';
import { showApiToast } from './ApiToast';
import { IconZap } from './Icons';

export default function BrandLookPresetBanner({
  dsl,
  editorId,
  onApply,
  onDismiss,
}: {
  dsl: DSL;
  editorId: string;
  onApply: (updater: (draft: DSL) => DSL, options?: { pipelineKey?: string }) => void;
  onDismiss: () => void;
}) {
  const [presets, setPresets] = useState<LibraryItem[]>([]);
  const brandPack = (dsl.globalConfig.brand_pack || {}) as Record<string, unknown>;
  const hints = getBrandLookPresetHints(brandPack);
  const hasAppliedLook = Boolean(dsl.meta?.look_preset_id);

  useEffect(() => {
    if (!dsl.globalConfig.brand_pack_id || hasAppliedLook) return;
    const controller = new AbortController();
    fetchLibraryItems({ category: 'look_preset', limit: 80, signal: controller.signal })
      .then((items) => setPresets(items))
      .catch(() => setPresets([]));
    return () => controller.abort();
  }, [dsl.globalConfig.brand_pack_id, hasAppliedLook]);

  const { recommended } = useMemo(
    () => partitionLookPresetsForBrand(brandPack, presets),
    [brandPack, presets],
  );

  const unresolvedCustomRefs = useMemo(() => {
    const resolved = new Set(recommended.map((item) => item.id));
    return hints.recommendedLibraryIds
      .filter((id) => !resolved.has(id))
      .map((id) => {
        const item = presets.find((preset) => preset.id === id);
        return {
          id,
          name: item?.name || `自定义预设 ${id.slice(0, 8)}`,
          item,
        };
      });
  }, [hints.recommendedLibraryIds, presets, recommended]);

  const bannerItems = useMemo(() => [
    ...recommended,
    ...unresolvedCustomRefs
      .filter((ref) => ref.item)
      .map((ref) => ref.item as LibraryItem),
  ], [recommended, unresolvedCustomRefs]);

  const defaultItem = useMemo(
    () => pickDefaultBrandLookPresetItem(hints, bannerItems),
    [hints, bannerItems],
  );

  if (!dsl.globalConfig.brand_pack_id || hasAppliedLook) return null;
  if (!bannerItems.length && !hints.recommendedSeedIds.length && !unresolvedCustomRefs.length) return null;

  const applyItem = (
    item: LibraryItem,
    options?: { recordAllRecommendations?: boolean; toastMessage?: string },
  ) => {
    const parsed = parseLookPresetPayload(item.payload);
    if (!parsed) return;
    const { payload } = migrateLookPresetPayload(parsed);
    if (options?.toastMessage) showApiToast(options.toastMessage);
    onApply(
      (draft) => {
        const next = applyLookPresetToDsl(draft, payload, {});
        return {
          ...next,
          meta: {
            ...next.meta,
            look_preset_id: item.id,
            ...(options?.recordAllRecommendations && hints.recommendedSeedIds.length
              ? { recommended_look_preset_seed_ids: [...hints.recommendedSeedIds] }
              : {}),
          },
        };
      },
      payload.pipeline_required === 'template_editor' || payload.pipeline_required === 'hyperframes_template'
        ? { pipelineKey: 'template_editor' }
        : undefined,
    );
    onDismiss();
  };

  const applyAllRecommended = () => {
    if (!defaultItem) return;
    const altCount = Math.max(0, bannerItems.length - 1);
    applyItem(defaultItem, {
      recordAllRecommendations: true,
      toastMessage: buildBrandLookApplyAllToastMessage(defaultItem.name, altCount),
    });
  };

  return (
    <div
      className="shrink-0 px-4 py-2 bg-brand-blue/5 border-b border-brand-blue/20 text-xs flex flex-wrap items-center gap-2"
      data-testid="brand-look-preset-banner"
    >
      <IconZap size={14} className="text-brand-blue shrink-0" />
      <span className="text-muted-foreground">
        品牌包已应用，推荐套用外观预设以统一动效风格：
      </span>
      {defaultItem ? (
        <button
          type="button"
          data-testid="brand-banner-apply-all-recommended"
          onClick={applyAllRecommended}
          className="h-7 px-2.5 rounded-md border border-brand-blue bg-brand-blue text-white hover:bg-brand-blue/90 text-[11px] font-medium"
        >
          一键套用品牌推荐
        </button>
      ) : null}
      {bannerItems.slice(0, 4).map((item) => {
        const key = String(item.payload?.seed_id || item.id);
        const isCustom = isCustomRecommendedLookPreset(item, hints.recommendedLibraryIds);
        return (
          <button
            key={item.id}
            type="button"
            data-testid={`brand-banner-apply-${key}`}
            onClick={() => applyItem(item)}
            className="h-7 px-2.5 rounded-md border border-brand-blue/30 bg-background hover:bg-accent text-[11px] text-brand-blue inline-flex items-center gap-1"
          >
            <span>{item.name}</span>
            {isCustom ? (
              <span
                className="rounded px-1 py-0.5 text-[9px] font-medium bg-amber-100 text-amber-800 border border-amber-200"
                data-testid={`brand-banner-custom-${item.id}`}
              >
                自定义
              </span>
            ) : null}
          </button>
        );
      })}
      {unresolvedCustomRefs
        .filter((ref) => !ref.item)
        .slice(0, 2)
        .map((ref) => (
          <span
            key={ref.id}
            className="h-7 px-2.5 rounded-md border border-dashed border-amber-300/70 bg-amber-50/80 text-[11px] text-amber-900 inline-flex items-center gap-1"
            data-testid={`brand-banner-custom-ref-${ref.id}`}
            title={ref.id}
          >
            <span>{ref.name}</span>
            <span className="rounded px-1 py-0.5 text-[9px] font-medium bg-amber-100 text-amber-800 border border-amber-200">
              自定义
            </span>
          </span>
        ))}
      <Link
        to={assetHubHref(editorId, 'look_preset')}
        className="text-[11px] text-brand-blue hover:underline"
      >
        更多预设
      </Link>
      <button
        type="button"
        onClick={onDismiss}
        className="ml-auto text-[10px] text-muted-foreground hover:text-foreground"
      >
        暂不套用
      </button>
    </div>
  );
}