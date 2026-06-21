import { useEffect, useMemo, useState } from 'react';
import { LOOK_PRESET_SEEDS } from '@shared/lookPreset';
import { BRAND_CATEGORY_LOOK_SEEDS } from '@shared/brandLookPreset';
import {
  buildBrandLookBundleDocument,
  buildLibraryIdRemapFromUpsertResults,
  collectLookPresetsForBundle,
  lookPresetSettingsToBrandHints,
  parseBrandLookBundleDocument,
  pickBrandLookBundlePayload,
  planLookPresetUpserts,
  summarizeBrandLookBundleExportFields,
  remapBrandLookLibraryIds,
  remapBrandPayloadLibraryIds,
} from '@shared/brandLookBundleExport';
import { parseLookPresetBrandHintsJson } from '@shared/lookPresetExport';
import {
  builtinSeedPreviewTagRows,
  mergeBuiltinSeedPreviewTags,
  parseLookPresetSeedPreviewTagOverrides,
} from '@shared/lookPresetSeedTags';
import { fetchLibraryItems } from '../../utils/libraryApi';

const CATEGORY_OPTIONS = [
  { id: 'general', label: '通用' },
  { id: 'enterprise', label: '企业 / 口播' },
  { id: '母婴', label: '母婴导购' },
  { id: '美妆', label: '美妆高端' },
  { id: '大促', label: '大促活动' },
  { id: '导购', label: '零售导购' },
];

const SEED_OPTIONS = LOOK_PRESET_SEEDS.map((seed) => ({
  id: seed.seed_id,
  label: seed.name,
  description: seed.description,
}));

type SeedTagRow = { seedId: string; label: string };

function seedTagsToRows(tags?: Record<string, string>): SeedTagRow[] {
  const entries = Object.entries(tags || {});
  return entries.length
    ? entries.map(([seedId, label]) => ({ seedId, label }))
    : [{ seedId: '', label: '' }];
}

function rowsToSeedTags(rows: SeedTagRow[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of rows) {
    const seedId = row.seedId.trim();
    const label = row.label.trim();
    if (seedId && label) out[seedId] = label;
  }
  return out;
}

export interface BrandLookPresetSettings {
  category: string;
  defaultLookPresetSeedId: string;
  recommendedLookPresetSeedIds: string[];
  defaultLookPresetLibraryId?: string;
  recommendedLookPresetLibraryIds?: string[];
  lookPresetSeedPreviewTags?: Record<string, string>;
}

export function defaultBrandLookPresetSettings(category = 'general'): BrandLookPresetSettings {
  const seeds = BRAND_CATEGORY_LOOK_SEEDS[category] || BRAND_CATEGORY_LOOK_SEEDS.general;
  return {
    category,
    defaultLookPresetSeedId: seeds[0] || '',
    recommendedLookPresetSeedIds: [...seeds],
  };
}

export function brandPayloadToLookPresetSettings(payload: Record<string, unknown> | undefined): BrandLookPresetSettings {
  const category = String(payload?.category || 'general').trim() || 'general';
  const defaultLookPresetSeedId = String(payload?.default_look_preset_seed_id || '').trim();
  const explicit = Array.isArray(payload?.recommended_look_preset_seed_ids)
    ? payload.recommended_look_preset_seed_ids.map((id) => String(id).trim()).filter(Boolean)
    : [];
  const defaultLookPresetLibraryId = String(payload?.default_look_preset_library_id || '').trim() || undefined;
  const explicitLibrary = Array.isArray(payload?.recommended_look_preset_library_ids)
    ? payload.recommended_look_preset_library_ids.map((id) => String(id).trim()).filter(Boolean)
    : [];
  if (defaultLookPresetSeedId || explicit.length > 0 || defaultLookPresetLibraryId || explicitLibrary.length > 0) {
    const recommended = defaultLookPresetSeedId
      ? [defaultLookPresetSeedId, ...explicit.filter((id) => id !== defaultLookPresetSeedId)]
      : explicit;
    const recommendedLibrary = defaultLookPresetLibraryId
      ? [defaultLookPresetLibraryId, ...explicitLibrary.filter((id) => id !== defaultLookPresetLibraryId)]
      : explicitLibrary;
    const lookPresetSeedPreviewTags = parseLookPresetSeedPreviewTagOverrides(payload?.look_preset_seed_preview_tags);
    return {
      category,
      defaultLookPresetSeedId: defaultLookPresetSeedId || recommended[0] || '',
      recommendedLookPresetSeedIds: [...new Set(recommended)],
      defaultLookPresetLibraryId: defaultLookPresetLibraryId || recommendedLibrary[0],
      recommendedLookPresetLibraryIds: [...new Set(recommendedLibrary)],
      ...(Object.keys(lookPresetSeedPreviewTags).length ? { lookPresetSeedPreviewTags } : {}),
    };
  }
  const lookPresetSeedPreviewTags = parseLookPresetSeedPreviewTagOverrides(payload?.look_preset_seed_preview_tags);
  const base = defaultBrandLookPresetSettings(category);
  return Object.keys(lookPresetSeedPreviewTags).length
    ? { ...base, lookPresetSeedPreviewTags }
    : base;
}

export function brandHintsToLookPresetSettings(hints: {
  category: string;
  default_look_preset_seed_id?: string;
  recommended_look_preset_seed_ids?: string[];
  default_look_preset_library_id?: string;
  recommended_look_preset_library_ids?: string[];
}): BrandLookPresetSettings {
  const recommendedSeeds = hints.recommended_look_preset_seed_ids || [];
  const defaultSeed = hints.default_look_preset_seed_id || recommendedSeeds[0] || '';
  const recommendedLibrary = hints.recommended_look_preset_library_ids || [];
  const defaultLibrary = hints.default_look_preset_library_id || recommendedLibrary[0] || '';
  const base = defaultSeed || recommendedSeeds.length
    ? {
      category: hints.category,
      defaultLookPresetSeedId: defaultSeed,
      recommendedLookPresetSeedIds: defaultSeed
        ? [defaultSeed, ...recommendedSeeds.filter((id) => id !== defaultSeed)]
        : [...new Set(recommendedSeeds)],
    }
    : defaultBrandLookPresetSettings(hints.category);
  return {
    ...base,
    defaultLookPresetLibraryId: defaultLibrary || undefined,
    recommendedLookPresetLibraryIds: defaultLibrary
      ? [defaultLibrary, ...recommendedLibrary.filter((id) => id !== defaultLibrary)]
      : [...new Set(recommendedLibrary)],
  };
}

export function lookPresetSettingsToPayload(settings: BrandLookPresetSettings): Record<string, unknown> {
  const recommended = settings.recommendedLookPresetSeedIds.filter(Boolean);
  const defaultId = settings.defaultLookPresetSeedId || recommended[0] || '';
  const ordered = defaultId
    ? [defaultId, ...recommended.filter((id) => id !== defaultId)]
    : recommended;
  const libRecommended = (settings.recommendedLookPresetLibraryIds || []).filter(Boolean);
  const defaultLibrary = settings.defaultLookPresetLibraryId || libRecommended[0] || '';
  const libOrdered = defaultLibrary
    ? [defaultLibrary, ...libRecommended.filter((id) => id !== defaultLibrary)]
    : libRecommended;
  const tagOverrides = settings.lookPresetSeedPreviewTags || {};
  return {
    category: settings.category,
    default_look_preset_seed_id: defaultId || undefined,
    recommended_look_preset_seed_ids: ordered.length ? ordered : undefined,
    default_look_preset_library_id: defaultLibrary || undefined,
    recommended_look_preset_library_ids: libOrdered.length ? libOrdered : undefined,
    ...(Object.keys(tagOverrides).length ? { look_preset_seed_preview_tags: tagOverrides } : {}),
  };
}

export default function BrandLookPresetEditor({
  settings,
  onChange,
  brandName,
  brandPayload,
  onBrandPayloadImport,
}: {
  settings: BrandLookPresetSettings;
  onChange: (next: BrandLookPresetSettings) => void;
  brandName?: string;
  brandPayload?: Record<string, unknown>;
  onBrandPayloadImport?: (patch: Record<string, unknown>) => void;
}) {
  const [importMsg, setImportMsg] = useState('');
  const [seedTagRows, setSeedTagRows] = useState<SeedTagRow[]>(
    () => seedTagsToRows(settings.lookPresetSeedPreviewTags),
  );

  const settingsTagsKey = JSON.stringify(settings.lookPresetSeedPreviewTags || {});

  useEffect(() => {
    const exported = rowsToSeedTags(seedTagRows);
    if (JSON.stringify(exported) === settingsTagsKey) return;
    setSeedTagRows(seedTagsToRows(settings.lookPresetSeedPreviewTags));
  }, [settingsTagsKey, seedTagRows]);

  const isKnownSeedId = (seedId: string) => SEED_OPTIONS.some((seed) => seed.id === seedId);

  const updateSeedTagRow = (index: number, patch: Partial<SeedTagRow>) => {
    const next = seedTagRows.map((row, rowIndex) => (
      rowIndex === index ? { ...row, ...patch } : row
    ));
    setSeedTagRows(next);
    onChange({ ...settings, lookPresetSeedPreviewTags: rowsToSeedTags(next) });
  };

  const handleSeedSelect = (index: number, value: string) => {
    if (value === '__custom__') {
      updateSeedTagRow(index, { seedId: '' });
      return;
    }
    const seed = SEED_OPTIONS.find((item) => item.id === value);
    const row = seedTagRows[index];
    updateSeedTagRow(index, {
      seedId: value,
      label: row?.label?.trim() || seed?.label || '',
    });
  };

  const bundleExportPreview = useMemo(() => summarizeBrandLookBundleExportFields({
    ...(brandPayload || {}),
    ...lookPresetSettingsToPayload(settings),
  }), [brandPayload, settings]);

  const importBrandHintsJson = async (file: File) => {
    try {
      const text = await file.text();
      const hints = parseLookPresetBrandHintsJson(JSON.parse(text) as unknown);
      onChange(brandHintsToLookPresetSettings(hints));
      setImportMsg(`已导入品牌推荐：${hints.category}`);
    } catch (err) {
      setImportMsg(err instanceof Error ? err.message : '导入失败');
    }
  };

  const exportBrandLookBundle = async () => {
    try {
      const hints = lookPresetSettingsToBrandHints(settings);
      const libraryItems = await fetchLibraryItems({ category: 'look_preset', limit: 200 });
      const lookPresets = collectLookPresetsForBundle({ hints, libraryItems });
      const bundle = buildBrandLookBundleDocument({
        brandName,
        brand_hints: hints,
        look_presets: lookPresets,
        brand_payload: {
          ...(brandPayload || {}),
          ...lookPresetSettingsToPayload(settings),
        },
      });
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${(brandName || 'brand').trim() || 'brand'}-look-bundle.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setImportMsg(`已导出迁移包（${lookPresets.length} 个外观预设）`);
    } catch (err) {
      setImportMsg(err instanceof Error ? err.message : '导出失败');
    }
  };

  const importBrandLookBundle = async (file: File) => {
    try {
      const text = await file.text();
      const bundle = parseBrandLookBundleDocument(JSON.parse(text) as unknown);

      const existing = await fetchLibraryItems({ category: 'look_preset', limit: 200 });
      const plans = planLookPresetUpserts(existing, bundle.look_presets);
      const resultIds: string[] = [];
      for (const plan of plans) {
        const body = {
          category: 'look_preset',
          name: plan.name,
          description: plan.description,
          tags: plan.tags,
          payload: plan.payload,
        };
        if (plan.mode === 'update' && plan.existingId) {
          const res = await fetch(`/api/library/${plan.existingId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          if (!res.ok) throw new Error(await res.text());
          resultIds.push(plan.existingId);
        } else {
          const res = await fetch('/api/library', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          if (!res.ok) throw new Error(await res.text());
          const saved = await res.json() as { id?: string };
          resultIds.push(String(saved.id || plan.existingId || ''));
        }
      }
      const idMap = buildLibraryIdRemapFromUpsertResults(plans, resultIds);
      const remappedHints = remapBrandLookLibraryIds(bundle.brand_hints, idMap);
      const nextSettings = brandHintsToLookPresetSettings(remappedHints);
      if (bundle.brand_payload) {
        const slimPayload = pickBrandLookBundlePayload(bundle.brand_payload);
        const remappedPayload = remapBrandPayloadLibraryIds(slimPayload, idMap);
        const importedSettings = brandPayloadToLookPresetSettings(remappedPayload);
        onChange({
          ...nextSettings,
          ...importedSettings,
          lookPresetSeedPreviewTags: importedSettings.lookPresetSeedPreviewTags
            || parseLookPresetSeedPreviewTagOverrides(remappedPayload.look_preset_seed_preview_tags),
        });
        onBrandPayloadImport?.(remappedPayload);
      } else {
        onChange(nextSettings);
      }

      const remappedCount = Object.keys(idMap).length;
      setImportMsg(
        remappedCount
          ? `已导入迁移包：${remappedHints.category}，同步 ${resultIds.length} 个外观预设，重映射 ${remappedCount} 个库 ID`
          : `已导入迁移包：${remappedHints.category}，同步 ${resultIds.length} 个外观预设`,
      );
    } catch (err) {
      setImportMsg(err instanceof Error ? err.message : '迁移包导入失败');
    }
  };

  const toggleRecommended = (seedId: string) => {
    const set = new Set(settings.recommendedLookPresetSeedIds);
    if (set.has(seedId)) set.delete(seedId);
    else set.add(seedId);
    const recommendedLookPresetSeedIds = [...set];
    const defaultLookPresetSeedId = settings.defaultLookPresetSeedId && set.has(settings.defaultLookPresetSeedId)
      ? settings.defaultLookPresetSeedId
      : recommendedLookPresetSeedIds[0] || '';
    onChange({ ...settings, recommendedLookPresetSeedIds, defaultLookPresetSeedId });
  };

  const applyCategoryDefaults = (category: string) => {
    onChange(defaultBrandLookPresetSettings(category));
  };

  const importBuiltinSeedTags = () => {
    const merged = mergeBuiltinSeedPreviewTags(settings.lookPresetSeedPreviewTags);
    const rows = Object.entries(merged).map(([seedId, label]) => ({ seedId, label }));
    setSeedTagRows(rows.length ? rows : builtinSeedPreviewTagRows());
    onChange({ ...settings, lookPresetSeedPreviewTags: merged });
    setImportMsg(`已导入 ${Object.keys(merged).length} 条内置种子标签`);
  };

  return (
    <div className="space-y-4 max-w-lg" data-testid="brand-look-preset-editor">
      <p className="text-xs text-muted-foreground leading-relaxed">
        配置品牌在编辑器中推荐的外观预设（HyperFrames 字幕 + 转场 + 质感）。应用品牌包后会引导用户一键套用。
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="px-3 py-1.5 rounded-md border border-border text-sm hover:bg-accent cursor-pointer">
          导入 brand_hints JSON
          <input
            type="file"
            accept="application/json,.json"
            className="hidden"
            data-testid="brand-look-import-hints"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void importBrandHintsJson(file);
              e.target.value = '';
            }}
          />
        </label>
        <button
          type="button"
          className="px-3 py-1.5 rounded-md border border-border text-sm hover:bg-accent"
          data-testid="brand-look-export-bundle"
          onClick={() => void exportBrandLookBundle()}
        >
          导出外观迁移包
        </button>
        {bundleExportPreview.length > 0 ? (
          <p
            className="w-full text-[10px] text-muted-foreground leading-relaxed"
            data-testid="brand-look-bundle-export-preview"
          >
            迁移包 brand_payload 将包含：
            {' '}
            {bundleExportPreview.join('、')}
          </p>
        ) : null}
        <label className="px-3 py-1.5 rounded-md border border-border text-sm hover:bg-accent cursor-pointer">
          导入外观迁移包
          <input
            type="file"
            accept="application/json,.json"
            className="hidden"
            data-testid="brand-look-import-bundle"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void importBrandLookBundle(file);
              e.target.value = '';
            }}
          />
        </label>
        {importMsg && (
          <span className="text-[10px] text-brand-blue" data-testid="brand-look-import-msg">{importMsg}</span>
        )}
      </div>
      {(settings.recommendedLookPresetLibraryIds?.length || settings.defaultLookPresetLibraryId) && (
        <p className="text-[10px] text-muted-foreground" data-testid="brand-look-library-refs">
          自定义预设库 ID：
          {(settings.recommendedLookPresetLibraryIds || []).slice(0, 2).join('、')}
          {(settings.recommendedLookPresetLibraryIds?.length || 0) > 2 ? '…' : ''}
        </p>
      )}
      <div className="space-y-2" data-testid="brand-look-seed-preview-tags">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">种子预览标签（覆盖资产库卡片角标）</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="brand-look-seed-tag-import-builtin"
              className="text-[11px] text-brand-blue hover:underline"
              onClick={importBuiltinSeedTags}
            >
              导入内置表
            </button>
            <button
              type="button"
              data-testid="brand-look-seed-tag-add"
              className="text-[11px] text-brand-blue hover:underline"
              onClick={() => {
                const next = [...seedTagRows, { seedId: '', label: '' }];
                setSeedTagRows(next);
              }}
            >
              + 添加
            </button>
          </div>
        </div>
        {seedTagRows.map((row, index) => {
          const knownSeed = isKnownSeedId(row.seedId);
          const selectValue = knownSeed ? row.seedId : row.seedId ? '__custom__' : '';
          return (
          <div
            key={`seed-tag-row-${index}`}
            className="flex flex-wrap items-center gap-2"
            data-testid={`brand-look-seed-tag-row-${index}`}
          >
            <select
              data-testid={`brand-look-seed-tag-select-${index}`}
              className="h-8 flex-1 min-w-[9rem] rounded-md border border-border bg-background px-2 text-[11px]"
              value={selectValue}
              onChange={(e) => handleSeedSelect(index, e.target.value)}
            >
              <option value="">选择内置种子</option>
              {SEED_OPTIONS.map((seed) => (
                <option key={seed.id} value={seed.id}>{seed.label}</option>
              ))}
              <option value="__custom__">自定义 seed_id</option>
            </select>
            {!knownSeed ? (
              <input
                data-testid={`brand-look-seed-tag-seed-${index}`}
                className="h-8 flex-1 min-w-[9rem] rounded-md border border-border bg-background px-2 text-[11px] font-mono"
                placeholder="自定义 seed_id"
                value={row.seedId}
                onChange={(e) => updateSeedTagRow(index, { seedId: e.target.value })}
              />
            ) : null}
            <input
              data-testid={`brand-look-seed-tag-label-${index}`}
              className="h-8 flex-1 min-w-[7rem] rounded-md border border-border bg-background px-2 text-[11px]"
              placeholder="卡片标签"
              value={row.label}
              onChange={(e) => updateSeedTagRow(index, { label: e.target.value })}
            />
            <button
              type="button"
              data-testid={`brand-look-seed-tag-remove-${index}`}
              className="h-8 px-2 rounded-md border border-border text-[11px] text-muted-foreground hover:bg-accent"
              onClick={() => {
                const next = seedTagRows.filter((_, rowIndex) => rowIndex !== index);
                const normalized = next.length ? next : [{ seedId: '', label: '' }];
                setSeedTagRows(normalized);
                onChange({ ...settings, lookPresetSeedPreviewTags: rowsToSeedTags(normalized) });
              }}
            >
              删除
            </button>
          </div>
          );
        })}
      </div>
      <label className="block text-xs text-muted-foreground">
        品牌场景分类
        <select
          data-testid="brand-look-category"
          className="mt-1 w-full h-9 rounded-md border border-border bg-background px-2 text-sm"
          value={settings.category}
          onChange={(e) => applyCategoryDefaults(e.target.value)}
        >
          {CATEGORY_OPTIONS.map((opt) => (
            <option key={opt.id} value={opt.id}>{opt.label}</option>
          ))}
        </select>
      </label>
      <label className="block text-xs text-muted-foreground">
        默认外观预设
        <select
          data-testid="brand-look-default"
          className="mt-1 w-full h-9 rounded-md border border-border bg-background px-2 text-sm"
          value={settings.defaultLookPresetSeedId}
          onChange={(e) => {
            const defaultLookPresetSeedId = e.target.value;
            const recommended = new Set(settings.recommendedLookPresetSeedIds);
            if (defaultLookPresetSeedId) recommended.add(defaultLookPresetSeedId);
            onChange({
              ...settings,
              defaultLookPresetSeedId,
              recommendedLookPresetSeedIds: [...recommended],
            });
          }}
        >
          <option value="">（未指定）</option>
          {SEED_OPTIONS.map((opt) => (
            <option key={opt.id} value={opt.id}>{opt.label}</option>
          ))}
        </select>
      </label>
      <div>
        <p className="text-xs text-muted-foreground mb-2">推荐外观预设（多选）</p>
        <div className="space-y-2">
          {SEED_OPTIONS.map((opt) => (
            <label
              key={opt.id}
              className="flex items-start gap-2 rounded-md border border-border px-3 py-2 hover:bg-accent/40 cursor-pointer"
            >
              <input
                type="checkbox"
                data-testid={`brand-look-recommend-${opt.id}`}
                className="mt-0.5"
                checked={settings.recommendedLookPresetSeedIds.includes(opt.id)}
                onChange={() => toggleRecommended(opt.id)}
              />
              <span>
                <span className="text-sm font-medium">{opt.label}</span>
                <span className="block text-[10px] text-muted-foreground mt-0.5">{opt.description}</span>
              </span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}