import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { IconArrowRight, IconMic, IconMusic, IconPlus, IconSearch, IconFilm, IconImage, IconType } from '../components/Icons';
import { HF_SUBTITLE_STYLES } from '@shared/subtitleStyles';
import { HF_TRANSITIONS } from '../components/TransitionStylePicker';
import { LOOK_PRESET_REGISTRY_VERSION, parseLookPresetPayload } from '@shared/lookPreset';
import { buildLookPresetExportDocument, parseLookPresetImportDocument } from '@shared/lookPresetExport';
import LookPresetSeedTag from '../components/LookPresetSeedTag';
import LookPresetStaleBadge from '../components/LookPresetStaleBadge';
import LookPresetOverlayFields, { normalizeLookPresetOverlays } from '../components/LookPresetOverlayFields';
import LookPresetThumb from '../components/LookPresetThumb';
import {
  isWritableLookPresetBrandHints,
  mergeBrandLookHintsIntoPayload,
  resolveLookPresetBrandHints,
  type LookPresetBrandHints,
} from '@shared/brandLookPreset';
import { DEFAULT_HF_GLOBAL_OVERLAYS } from '@shared/hfGlobalOverlayRenderer';
import { partitionLookPresetsForBrand } from '@shared/brandLookPreset';
import { mergeSeedTagOverridesFromBrandPayloads } from '@shared/lookPresetSeedTags';
import AssetPreviewPanel from '../components/AssetPreviewPanel';
import { libraryPayloadToBrandPack } from '@shared/brandPack';
import BrandColorSwatches from '../components/BrandColorSwatches';
import BrandAssetEditor from '../components/BrandAssetEditor';
import ConfirmDialog from '../components/ConfirmDialog';
import ImportCatalogBanner from '../components/ImportCatalogBanner';
import type { AssetHubTab, LibraryItem, LibrarySummary } from '../types/library';
import { ASSET_GROUPS, tabToGroup, groupDef } from '../types/library';
import type { AssetGroup } from '../types/library';

const TABS: { id: AssetHubTab; label: string; hint: string; primary?: boolean }[] = [
  { id: 'digital_human', label: '数字人', hint: '训练与管理数字人形象', primary: true },
  { id: 'brand', label: '品牌包', hint: '本地 design.md / frame.md，可视化 + Markdown 编辑：颜色、字体、圆角间距、镜头、色板、文本/字幕/动画/版式/形状/元素库', primary: true },
  { id: 'script', label: '脚本', hint: '旁白与导购话术', primary: true },
  { id: 'look_preset', label: '外观预设', hint: 'HyperFrames 动效组合：字幕样式 + 转场 + 全局质感，可一键应用到编辑器项目' },
  { id: 'template', label: '模板', hint: '视频模板，编辑时仅选择' },
  { id: 'voice', label: '声音', hint: 'TTS 音色、克隆与 BGM 背景音乐' },
  { id: 'media', label: '媒体素材', hint: '图片、视频、贴纸等' },
  { id: 'knowledge', label: '知识库', hint: '目录维护；文档上传与检索开发中' },
];

const STORED_TABS = new Set<AssetHubTab>(['brand', 'look_preset', 'voice', 'script', 'knowledge']);
type VoiceSubTab = 'tts' | 'bgm';

function emptyForm(tab: AssetHubTab, voiceKind: VoiceSubTab = 'tts') {
  if (tab === 'brand') {
    return {
      name: '',
      description: '',
      payload: {
        brand_color: '#1d4ed8',
        background_color: '#f6f8fb',
        text_color: '#ffffff',
        subtitle_style: 'default',
        subtitle_position: 'bottom',
        logo_label: '品牌',
      },
    };
  }
  if (tab === 'look_preset') {
    return {
      name: '',
      description: '',
      payload: {
        subtitle_style_id: 'hf-caption-highlight',
        transition_type: 'hf-dissolve',
        transition_duration: 0.6,
        pipeline_required: 'template_editor',
        registry_version: LOOK_PRESET_REGISTRY_VERSION,
        hf_overlays: DEFAULT_HF_GLOBAL_OVERLAYS.map((item) => ({ ...item, enabled: false })),
      },
    };
  }
  if (tab === 'script') {
    return { name: '', description: '', payload: { content: '', format: 'plain' } };
  }
  if (tab === 'voice') {
    return voiceKind === 'bgm'
      ? { name: '', description: '', file_url: '', payload: { kind: 'bgm', duration: '60s' } }
      : { name: '', description: '', file_url: '', payload: { kind: 'tts', provider: 'yuntts', voice_id: 'zh-CN-XiaoxiaoNeural', language: 'zh-CN' } };
  }
  return { name: '', description: '', payload: { content: '' } };
}

function isVideoUrl(url: string) {
  return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url);
}

function CardThumb({
  tab,
  item,
  voiceKind,
  seedTagOverrides,
}: {
  tab: AssetHubTab;
  item: LibraryItem;
  voiceKind?: VoiceSubTab;
  seedTagOverrides?: Record<string, string>;
}) {
  if (tab === 'digital_human' && item.file_url) {
    return <img src={item.file_url} alt="" className="w-full h-full object-cover" />;
  }
  if (tab === 'template' && item.file_url) {
    return <img src={item.file_url} alt="" className="w-full h-full object-cover" />;
  }
  if (tab === 'media' && item.file_url) {
    if (isVideoUrl(item.file_url)) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-black/80 text-white text-[10px]">
          <IconFilm size={20} aria-hidden />
        </div>
      );
    }
    return <img src={item.file_url} alt="" className="w-full h-full object-cover" />;
  }
  if (tab === 'brand') {
    const pack = libraryPayloadToBrandPack(item);
    const textColor = pack.textColor;
    return (
      <div className="w-full h-full flex flex-col relative">
        <div className="flex-1 flex items-center justify-center p-2" style={{ background: pack.brandColor }}>
          {pack.useLogo && pack.logoUrl ? (
            <img src={pack.logoUrl} alt="" className="max-h-[70%] max-w-[85%] object-contain" />
          ) : (
            <span className="text-xs font-semibold px-2 py-1 rounded" style={{ color: textColor, background: 'rgba(0,0,0,0.15)' }}>
              {(pack.logoLabel || item.name || '品牌').slice(0, 4)}
            </span>
          )}
        </div>
        <div className="h-1/3 px-3 flex items-end pb-2 gap-1" style={{ background: pack.backgroundColor }}>
          <span className="inline-block px-2 py-0.5 rounded text-[9px] bg-black/70 text-white">字幕预览</span>
        </div>
      </div>
    );
  }
  if (tab === 'voice') {
    const kind = String(item.payload?.kind || voiceKind || 'tts');
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-1 bg-secondary text-muted-foreground">
        {kind === 'bgm' ? <IconMusic size={22} aria-hidden /> : <IconMic size={22} aria-hidden />}
        <span className="text-[9px]">{kind === 'bgm' ? 'BGM' : 'TTS'}</span>
      </div>
    );
  }
  if (tab === 'look_preset') {
    const seedId = String(item.payload?.seed_id || '').trim();
    return (
      <div className="relative w-full h-full">
        <LookPresetThumb
          subtitleStyleId={String(item.payload?.subtitle_style_id || '')}
          transitionType={String(item.payload?.transition_type || '')}
          hfOverlays={normalizeLookPresetOverlays(item.payload?.hf_overlays)}
          testId={`look-preset-thumb-${item.id}`}
        />
        <LookPresetSeedTag
          seedId={seedId}
          tagOverrides={seedTagOverrides}
          testId={`look-preset-card-seed-tag-${seedId || item.id}`}
          className="absolute top-1.5 left-1.5 z-10 shadow-sm"
        />
      </div>
    );
  }
  if (tab === 'script') {
    return (
      <div className="w-full h-full p-2 text-[8px] leading-tight text-muted-foreground overflow-hidden bg-secondary">
        {String(item.payload?.content || item.description || '脚本').slice(0, 80)}
      </div>
    );
  }
  if (tab === 'knowledge') {
    return (
      <div className="w-full h-full flex items-center justify-center bg-secondary text-muted-foreground">
        <IconType size={22} aria-hidden />
      </div>
    );
  }
  return (
    <div className="w-full h-full flex items-center justify-center bg-secondary text-muted-foreground">
      <IconImage size={22} aria-hidden />
    </div>
  );
}

export default function AssetHubPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get('tab') as AssetHubTab) || 'digital_human';
  const returnTo = searchParams.get('from');
  const [summary, setSummary] = useState<LibrarySummary | null>(null);
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<LibraryItem | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>(emptyForm(activeTab));
  const [uploading, setUploading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [voiceSubTab, setVoiceSubTab] = useState<VoiceSubTab>('tts');
  const [previewItem, setPreviewItem] = useState<LibraryItem | null>(null);
  const [devNotice, setDevNotice] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState('');
  const [brandEditorOpen, setBrandEditorOpen] = useState(false);
  const [brandEditorMode, setBrandEditorMode] = useState<'create' | 'edit'>('edit');
  const [brandEditorId, setBrandEditorId] = useState<string | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<{ kind: 'library' | 'media' | 'digital_human'; id: string; name: string } | null>(null);
  const [lookPresetItems, setLookPresetItems] = useState<LibraryItem[]>([]);
  const [syncingLookPresets, setSyncingLookPresets] = useState(false);
  const [lookPresetSyncMsg, setLookPresetSyncMsg] = useState('');
  const [importedBrandHints, setImportedBrandHints] = useState<LookPresetBrandHints | null>(null);
  const [savingLookPreset, setSavingLookPreset] = useState(false);
  const [applyingBrandHints, setApplyingBrandHints] = useState(false);
  const [seedTagOverrides, setSeedTagOverrides] = useState<Record<string, string>>({});
  const [scope, setScope] = useState<'enterprise' | 'project' | 'all'>('all');
  const editorRoundtrip = Boolean(returnTo) && (searchParams.get('segment_id') || searchParams.get('slot'));
  const activeGroup: AssetGroup = useMemo(() => tabToGroup(activeTab), [activeTab]);

  const parseEditorIdFromReturnTo = (href: string | null) => {
    const match = String(href || '').match(/^\/editor\/([^/?]+)/);
    return match?.[1] || null;
  };

  const resolveCurrentBrandHints = useCallback((): LookPresetBrandHints | undefined => {
    const payload = parseLookPresetPayload(form.payload);
    return resolveLookPresetBrandHints({
      payload: payload || undefined,
      explicit: importedBrandHints,
      libraryId: editing?.id,
    });
  }, [form.payload, importedBrandHints, editing?.id]);

  const fetchEditorBrandPackId = async (): Promise<string | undefined> => {
    const editorId = parseEditorIdFromReturnTo(returnTo);
    if (!editorId) return undefined;
    const res = await fetch(`/api/templates/${editorId}`);
    if (!res.ok) return undefined;
    const body = await res.json() as {
      dsl_json?: { globalConfig?: { brand_pack_id?: string } };
    };
    return String(body.dsl_json?.globalConfig?.brand_pack_id || '').trim() || undefined;
  };

  const setTab = (tab: AssetHubTab) => {
    const next: Record<string, string> = { tab };
    if (returnTo) next.from = returnTo;
    setSearchParams(next);
    setEditing(null);
    setForm(emptyForm(tab));
    setShowForm(false);
    setPreviewItem(null);
    setVoiceSubTab('tts');
  };

  const loadSummary = useCallback(() => {
    fetch('/api/library/summary').then(r => r.json()).then(setSummary).catch(() => setSummary(null));
  }, []);

  const loadItems = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ category: activeTab, limit: '120' });
    if (search) params.set('q', search);
    if (activeTab === 'voice') params.set('sub_type', voiceSubTab);
    fetch(`/api/library?${params}`)
      .then(r => r.json())
      .then((data) => {
        const next = data.items || [];
        setItems(next);
        setPreviewItem((prev) => {
          if (!prev) return next[0] || null;
          return next.find((i: LibraryItem) => i.id === prev.id) || next[0] || null;
        });
      })
      .catch(() => { setItems([]); setPreviewItem(null); })
      .finally(() => setLoading(false));
  }, [activeTab, search, voiceSubTab]);

  useEffect(() => { loadSummary(); }, [loadSummary]);
  useEffect(() => { loadItems(); }, [loadItems]);

  useEffect(() => {
    if (activeTab !== 'brand') return;
    const controller = new AbortController();
    fetch(`/api/library?category=look_preset&limit=40`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => setLookPresetItems(data.items || []))
      .catch(() => setLookPresetItems([]));
    return () => controller.abort();
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'look_preset') return;
    const controller = new AbortController();
    fetch(`/api/library?category=brand&limit=80`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => {
        const brands = (data.items || []) as LibraryItem[];
        setSeedTagOverrides(mergeSeedTagOverridesFromBrandPayloads(brands.map((brand) => brand.payload)));
      })
      .catch(() => setSeedTagOverrides({}));
    return () => controller.abort();
  }, [activeTab]);

  const tabMeta = useMemo(() => TABS.find(t => t.id === activeTab), [activeTab]);

  const reloadLocalBrand = async () => {
    setImporting(true);
    setImportMsg('');
    try {
      const res = await fetch('/api/library/brand/reload-local', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '重置失败');
      setImportMsg(data.result === 'updated' ? '已从本地 design.md / frame.md 更新默认品牌包' : '已导入本地品牌模板');
      loadItems();
      loadSummary();
    } catch (err) {
      setImportMsg(err instanceof Error ? err.message : '重置失败');
    } finally {
      setImporting(false);
    }
  };

  const openBrandCreate = () => {
    setBrandEditorMode('create');
    setBrandEditorId(undefined);
    setBrandEditorOpen(true);
  };

  const saveStoredItem = async (category: string, body: Record<string, unknown>, id?: string) => {
    const url = id ? `/api/library/${id}` : '/api/library';
    const method = id ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, category }),
    });
    if (!res.ok) throw new Error((await res.json()).error || '保存失败');
    const saved = await res.json() as { id?: string };
    loadItems();
    loadSummary();
    setEditing(null);
    setForm(emptyForm(activeTab, voiceSubTab));
    setShowForm(false);
    setImportedBrandHints(null);
    return String(saved.id || id || '').trim() || undefined;
  };

  const buildLookPresetSaveBody = () => ({
    name: form.name,
    description: form.description,
    file_url: form.file_url,
    payload: form.payload,
  });

  const saveLookPresetAndApply = async () => {
    if (!returnTo?.startsWith('/editor/')) return;
    setSavingLookPreset(true);
    setLookPresetSyncMsg('');
    try {
      const savedId = await saveStoredItem('look_preset', buildLookPresetSaveBody(), editing?.id);
      if (!savedId) throw new Error('保存失败');
      const joiner = returnTo.includes('?') ? '&' : '?';
      navigate(`${returnTo}${joiner}apply_look=${encodeURIComponent(savedId)}`);
    } catch (err) {
      setLookPresetSyncMsg(err instanceof Error ? err.message : '保存并应用失败');
    } finally {
      setSavingLookPreset(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    if (deleteTarget.kind === 'library') {
      await fetch(`/api/library/${deleteTarget.id}`, { method: 'DELETE' });
      if (editing?.id === deleteTarget.id) setEditing(null);
    } else if (deleteTarget.kind === 'digital_human') {
      await fetch(`/api/digital-humans/${deleteTarget.id}`, { method: 'DELETE' });
    } else {
      await fetch(`/api/assets/${deleteTarget.id}`, { method: 'DELETE' });
    }
    loadItems();
    loadSummary();
    if (previewItem?.id === deleteTarget.id) setPreviewItem(null);
    setDeleteTarget(null);
  };

  const uploadFile = async (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    const up = await fetch('/api/uploads', { method: 'POST', body: fd });
    if (!up.ok) {
      const body = await up.json().catch(() => ({}));
      throw new Error((body as { error?: string }).error || '上传失败');
    }
    return up.json() as Promise<{ url: string; asset_id?: string }>;
  };

  const handleMediaUpload = async (file: File) => {
    setUploading(true);
    try {
      await uploadFile(file);
      loadItems();
      loadSummary();
    } finally {
      setUploading(false);
    }
  };

  const exportLookPresetJson = (source?: {
    name?: string;
    description?: string;
    tags?: string[];
    payload?: Record<string, unknown>;
    brandHints?: LookPresetBrandHints;
    downloadOnly?: boolean;
  }) => {
    const payload = parseLookPresetPayload(source?.payload ?? form.payload);
    if (!payload) {
      setLookPresetSyncMsg('无法导出：请先填写有效的字幕/转场/质感组合');
      return;
    }
    try {
      const doc = buildLookPresetExportDocument({
        name: String(source?.name ?? form.name ?? editing?.name ?? '外观预设'),
        description: String(source?.description ?? form.description ?? editing?.description ?? ''),
        tags: source?.tags ?? (Array.isArray(form.tags) ? form.tags.map(String) : editing?.tags),
        payload,
        brand_hints: source?.brandHints ?? resolveLookPresetBrandHints({
          payload,
          explicit: importedBrandHints,
          libraryId: editing?.id,
        }),
        libraryId: editing?.id,
      });
      const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${doc.name.replace(/\s+/g, '-') || 'look-preset'}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      if (!source?.downloadOnly) {
        setLookPresetSyncMsg('已导出 JSON');
      }
    } catch (err) {
      setLookPresetSyncMsg(err instanceof Error ? err.message : '导出失败');
      throw err;
    }
  };

  const applyBrandHintsToPack = async (hints: LookPresetBrandHints, options?: { exportJson?: boolean }) => {
    const brandId = await fetchEditorBrandPackId();
    if (!brandId) {
      throw new Error('请先在编辑器绑定品牌包');
    }
    const brandRes = await fetch(`/api/library/${brandId}`);
    if (!brandRes.ok) throw new Error('读取品牌包失败');
    const brand = await brandRes.json() as LibraryItem;
    const mergedPayload = mergeBrandLookHintsIntoPayload(
      (brand.payload || {}) as Record<string, unknown>,
      hints,
    );
    const updateRes = await fetch(`/api/library/${brandId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload: mergedPayload }),
    });
    if (!updateRes.ok) {
      const body = await updateRes.json().catch(() => ({}));
      throw new Error((body as { error?: string }).error || '写入品牌推荐失败');
    }
    if (options?.exportJson) {
      exportLookPresetJson({ downloadOnly: true, brandHints: hints });
    }
    setLookPresetSyncMsg(
      options?.exportJson
        ? `已导出 JSON，并写入品牌包「${brand.name}」的外观推荐`
        : `已写入品牌包「${brand.name}」的外观推荐`,
    );
  };

  const exportLookPresetAndApplyBrand = async () => {
    const hints = resolveCurrentBrandHints();
    if (!isWritableLookPresetBrandHints(hints)) {
      setLookPresetSyncMsg('无法写入：请先保存自定义预设，或设置 seed_id / 导入 brand_hints');
      return;
    }
    setApplyingBrandHints(true);
    setLookPresetSyncMsg('');
    try {
      await applyBrandHintsToPack(hints!, { exportJson: true });
    } catch (err) {
      setLookPresetSyncMsg(err instanceof Error ? err.message : '导出并写入失败');
    } finally {
      setApplyingBrandHints(false);
    }
  };

  const writeBrandHintsOnly = async () => {
    const hints = resolveCurrentBrandHints();
    if (!isWritableLookPresetBrandHints(hints)) {
      setLookPresetSyncMsg('无法写入：请先保存自定义预设，或设置 seed_id / 导入 brand_hints');
      return;
    }
    setApplyingBrandHints(true);
    setLookPresetSyncMsg('');
    try {
      await applyBrandHintsToPack(hints!);
    } catch (err) {
      setLookPresetSyncMsg(err instanceof Error ? err.message : '写入品牌推荐失败');
    } finally {
      setApplyingBrandHints(false);
    }
  };

  const importLookPresetJson = async (file: File) => {
    try {
      const text = await file.text();
      const raw = JSON.parse(text) as unknown;
      const imported = parseLookPresetImportDocument(raw);
      setEditing(null);
      setShowForm(true);
      setImportedBrandHints(imported.brand_hints ?? null);
      setForm({
        name: imported.name,
        description: imported.description,
        tags: imported.tags,
        payload: {
          ...imported.payload,
          registry_version: LOOK_PRESET_REGISTRY_VERSION,
          pipeline_required: imported.payload.pipeline_required === 'hyperframes_template'
            ? 'template_editor'
            : (imported.payload.pipeline_required || 'template_editor'),
        },
      });
      setLookPresetSyncMsg(
        returnTo?.startsWith('/editor/')
          ? `已导入「${imported.name}」，可保存并应用到项目`
          : `已导入「${imported.name}」，请确认后保存`,
      );
    } catch (err) {
      setLookPresetSyncMsg(err instanceof Error ? err.message : '导入失败');
    }
  };

  const syncLookPresets = async () => {
    setSyncingLookPresets(true);
    setLookPresetSyncMsg('');
    try {
      const res = await fetch('/api/library/look-presets/sync', { method: 'POST' });
      const body = await res.json().catch(() => ({})) as {
        error?: string;
        migrated?: number;
        seed?: string;
        updated_ids?: string[];
      };
      if (!res.ok) throw new Error(body.error || '同步失败');
      const migrated = Number(body.migrated || 0);
      const seed = String(body.seed || 'skipped');
      setLookPresetSyncMsg(
        migrated > 0 || seed !== 'skipped'
          ? `已同步：内置种子 ${seed}，迁移 ${migrated} 个过期预设`
          : '所有外观预设已是最新版本',
      );
      loadItems();
      loadSummary();
      if (activeTab === 'brand' || lookPresetItems.length) {
        fetch('/api/library?category=look_preset&limit=40')
          .then((r) => r.json())
          .then((data) => setLookPresetItems(data.items || []))
          .catch(() => {});
      }
    } catch (err) {
      setLookPresetSyncMsg(err instanceof Error ? err.message : '同步失败');
    } finally {
      setSyncingLookPresets(false);
    }
  };

  const handleBgmUpload = async (file: File) => {
    setUploading(true);
    try {
      const uploaded = await uploadFile(file);
      if (uploaded.asset_id) {
        await fetch(`/api/assets/${uploaded.asset_id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: file.name,
            type: 'audio',
            file_url: uploaded.url,
            metadata: { size: file.size, mime: file.type, role: 'bgm' },
          }),
        });
      }
      loadItems();
      loadSummary();
    } finally {
      setUploading(false);
    }
  };

  const startEdit = (item: LibraryItem) => {
    if (activeTab === 'knowledge') return;
    if (activeTab === 'brand') {
      setBrandEditorMode('edit');
      setBrandEditorId(item.id);
      setBrandEditorOpen(true);
      return;
    }
    setEditing(item);
    setShowForm(true);
    if (activeTab === 'voice') {
      const kind = String(item.payload?.kind || 'tts') as VoiceSubTab;
      setVoiceSubTab(kind === 'bgm' ? 'bgm' : 'tts');
    }
    setForm({
      name: item.name,
      description: item.description,
      tags: item.tags,
      file_url: item.file_url,
      payload: { ...item.payload },
    });
  };

  const renderStoredForm = (category: string) => {
    const payload = (form.payload || {}) as Record<string, unknown>;
    return (
      <div
        className="border border-border rounded-lg p-4 bg-card space-y-3 mb-4"
        data-testid={category === 'look_preset' ? 'look-preset-form' : undefined}
      >
        <div className="text-sm font-medium">{editing ? '编辑' : '新建'}{category === 'voice' ? (voiceSubTab === 'bgm' ? 'BGM' : '音色') : tabMeta?.label}</div>
        <input
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          placeholder="名称"
          data-testid={category === 'look_preset' ? 'look-preset-name' : undefined}
          value={String(form.name || '')}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
        />
        <input
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          placeholder="描述"
          value={String(form.description || '')}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
        />

        {category === 'brand' && (
          <div className="grid grid-cols-2 gap-2">
            {(['brand_color', 'background_color', 'text_color'] as const).map(key => (
              <label key={key} className="text-xs text-muted-foreground">
                {key}
                <input
                  className="mt-1 w-full rounded border border-border px-2 py-1 text-sm"
                  value={String(payload[key] || '')}
                  onChange={e => setForm(f => ({
                    ...f,
                    payload: { ...(f.payload as object), [key]: e.target.value },
                  }))}
                />
              </label>
            ))}
          </div>
        )}

        {category === 'look_preset' && (
          <div className="space-y-2">
            <label className="block text-xs text-muted-foreground">
              字幕样式
              <select
                data-testid="look-preset-subtitle"
                className="mt-1 w-full h-9 rounded-md border border-border bg-background px-2 text-sm"
                value={String(payload.subtitle_style_id || 'hf-caption-highlight')}
                onChange={(e) => setForm((f) => ({
                  ...f,
                  payload: { ...(f.payload as object), subtitle_style_id: e.target.value },
                }))}
              >
                {HF_SUBTITLE_STYLES.map((style) => (
                  <option key={style.id} value={style.id}>{style.name}</option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-muted-foreground">
              默认转场
              <select
                data-testid="look-preset-transition"
                className="mt-1 w-full h-9 rounded-md border border-border bg-background px-2 text-sm"
                value={String(payload.transition_type || 'hf-dissolve')}
                onChange={(e) => setForm((f) => ({
                  ...f,
                  payload: { ...(f.payload as object), transition_type: e.target.value },
                }))}
              >
                {HF_TRANSITIONS.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-muted-foreground">
              转场时长（秒）
              <input
                type="number"
                min={0.3}
                max={2}
                step={0.1}
                className="mt-1 w-full h-9 rounded-md border border-border bg-background px-2 text-sm"
                value={Number(payload.transition_duration ?? 0.6)}
                onChange={(e) => setForm((f) => ({
                  ...f,
                  payload: { ...(f.payload as object), transition_duration: Number(e.target.value) || 0.6 },
                }))}
              />
            </label>
            <LookPresetOverlayFields
              overlays={normalizeLookPresetOverlays(payload.hf_overlays)}
              onChange={(hf_overlays) => setForm((f) => ({
                ...f,
                payload: {
                  ...(f.payload as object),
                  hf_overlays,
                  pipeline_required: 'template_editor',
                  registry_version: LOOK_PRESET_REGISTRY_VERSION,
                },
              }))}
            />
            <div
              className="rounded-md border border-border overflow-hidden aspect-[4/3] max-w-[220px]"
              data-testid="look-preset-form-thumb"
            >
              <LookPresetThumb
                subtitleStyleId={String(payload.subtitle_style_id || '')}
                transitionType={String(payload.transition_type || '')}
                hfOverlays={normalizeLookPresetOverlays(payload.hf_overlays)}
              />
            </div>
            {importedBrandHints && (
              <p className="text-[10px] text-muted-foreground leading-relaxed" data-testid="look-preset-import-brand-hints">
                品牌推荐（导出附带）：{importedBrandHints.category}
                {importedBrandHints.default_look_preset_seed_id
                  ? ` · 种子 ${importedBrandHints.default_look_preset_seed_id}`
                  : ''}
                {importedBrandHints.default_look_preset_library_id
                  ? ` · 库 ${importedBrandHints.default_look_preset_library_id}`
                  : ''}
              </p>
            )}
          </div>
        )}

        {category === 'script' && (
          <textarea
            className="w-full min-h-[120px] rounded-md border border-border bg-background px-3 py-2 text-sm"
            placeholder="脚本正文"
            value={String(payload.content || '')}
            onChange={e => setForm(f => ({
              ...f,
              payload: { ...(f.payload as object), content: e.target.value },
            }))}
          />
        )}

        {category === 'voice' && voiceSubTab === 'tts' && (
          <div className="grid grid-cols-2 gap-2">
            <input className="rounded border border-border px-2 py-1 text-sm" placeholder="provider"
              value={String(payload.provider || '')}
              onChange={e => setForm(f => ({ ...f, payload: { ...(f.payload as object), kind: 'tts', provider: e.target.value } }))} />
            <input className="rounded border border-border px-2 py-1 text-sm" placeholder="voice_id"
              value={String(payload.voice_id || '')}
              onChange={e => setForm(f => ({ ...f, payload: { ...(f.payload as object), kind: 'tts', voice_id: e.target.value } }))} />
            <input className="col-span-2 rounded border border-border px-2 py-1 text-sm" placeholder="试听音频 URL（可选）"
              value={String(form.file_url || payload.sample_url || '')}
              onChange={e => setForm(f => ({ ...f, file_url: e.target.value, payload: { ...(f.payload as object), kind: 'tts', sample_url: e.target.value } }))} />
          </div>
        )}

        {category === 'voice' && voiceSubTab === 'bgm' && (
          <div className="space-y-2">
            <input className="w-full rounded border border-border px-2 py-1 text-sm" placeholder="音频 URL"
              value={String(form.file_url || '')}
              onChange={e => setForm(f => ({ ...f, file_url: e.target.value }))} />
            <label className="inline-flex items-center gap-2 text-xs text-brand-blue cursor-pointer">
              上传 BGM 文件
              <input type="file" className="hidden" accept="audio/*" disabled={uploading}
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setUploading(true);
                  try {
                    const asset = await uploadFile(f);
                    setForm(prev => ({ ...prev, file_url: asset.url, name: prev.name || f.name }));
                  } finally { setUploading(false); e.target.value = ''; }
                }} />
            </label>
          </div>
        )}

        {category === 'knowledge' && (
          <textarea
            className="w-full min-h-[80px] rounded-md border border-border bg-background px-3 py-2 text-sm"
            placeholder="知识库说明（可选）"
            value={String(payload.content || '')}
            onChange={e => setForm(f => ({
              ...f,
              payload: { ...(f.payload as object), content: e.target.value },
            }))}
          />
        )}

        {category === 'look_preset' && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              data-testid="look-preset-export-json"
              className="px-3 py-1.5 rounded-md border border-border text-sm hover:bg-accent"
              onClick={() => exportLookPresetJson()}
            >
              导出 JSON
            </button>
            {returnTo?.startsWith('/editor/') && isWritableLookPresetBrandHints(resolveCurrentBrandHints()) && (
              <button
                type="button"
                data-testid="look-preset-export-apply-brand"
                className="px-3 py-1.5 rounded-md border border-brand-blue text-brand-blue text-sm hover:bg-brand-blue/5 disabled:opacity-50"
                disabled={applyingBrandHints}
                onClick={() => void exportLookPresetAndApplyBrand()}
              >
                {applyingBrandHints ? '处理中…' : '导出并写入品牌推荐'}
              </button>
            )}
            {returnTo?.startsWith('/editor/') && isWritableLookPresetBrandHints(resolveCurrentBrandHints()) && (
              <button
                type="button"
                data-testid="look-preset-apply-brand-hints"
                className="px-3 py-1.5 rounded-md border border-border text-sm hover:bg-accent disabled:opacity-50"
                disabled={applyingBrandHints}
                onClick={() => void writeBrandHintsOnly()}
              >
                仅写入品牌推荐
              </button>
            )}
            <label className="px-3 py-1.5 rounded-md border border-border text-sm hover:bg-accent cursor-pointer">
              导入 JSON
              <input
                type="file"
                accept="application/json,.json"
                className="hidden"
                data-testid="look-preset-import-json"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void importLookPresetJson(file);
                  e.target.value = '';
                }}
              />
            </label>
          </div>
        )}

        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            data-testid={category === 'look_preset' ? 'look-preset-save' : undefined}
            className="px-3 py-1.5 rounded-md bg-brand-blue text-white text-sm"
            disabled={category === 'look_preset' && savingLookPreset}
            onClick={() => void saveStoredItem(category, {
              name: form.name,
              description: form.description,
              file_url: form.file_url,
              payload: category === 'voice'
                ? { ...(form.payload as object), kind: voiceSubTab }
                : form.payload,
            }, editing?.id)}>
            保存
          </button>
          {category === 'look_preset' && returnTo?.startsWith('/editor/') && (
            <button
              type="button"
              data-testid="look-preset-save-apply"
              className="px-3 py-1.5 rounded-md border border-brand-blue text-brand-blue text-sm font-medium hover:bg-brand-blue/5 disabled:opacity-50"
              disabled={savingLookPreset}
              onClick={() => void saveLookPresetAndApply()}
            >
              {savingLookPreset ? '保存中…' : '保存并应用到项目'}
            </button>
          )}
          <button type="button" className="px-3 py-1.5 rounded-md border border-border text-sm"
            onClick={() => {
              setEditing(null);
              setForm(emptyForm(activeTab, voiceSubTab));
              setShowForm(false);
              setImportedBrandHints(null);
            }}>
            取消
          </button>
        </div>
      </div>
    );
  };

  const renderItemCard = (item: LibraryItem) => {
    const selected = previewItem?.id === item.id;
    return (
      <div
        key={item.id}
        role="button"
        tabIndex={0}
        onClick={() => setPreviewItem(item)}
        onKeyDown={(e) => { if (e.key === 'Enter') setPreviewItem(item); }}
        className={`border rounded-xl overflow-hidden bg-card transition-colors duration-150 cursor-pointer ${
          selected
            ? 'border-brand-blue border-l-[3px] border-l-brand-blue ring-1 ring-brand-blue/20 scale-[1.01]'
            : 'border-border hover:border-brand-blue/40'
        }`}
      >
        <div className="aspect-[4/3] bg-secondary border-b border-border overflow-hidden">
          <CardThumb tab={activeTab} item={item} voiceKind={voiceSubTab} seedTagOverrides={seedTagOverrides} />
        </div>
        <div className="p-3">
          <div className="text-sm font-medium truncate flex items-center gap-1.5">
            <span className="truncate">{item.name}</span>
            {activeTab === 'look_preset' && (
              <>
                <LookPresetSeedTag
                  seedId={String(item.payload?.seed_id || '')}
                  tagOverrides={seedTagOverrides}
                />
                <LookPresetStaleBadge
                  registryVersion={String(item.payload?.registry_version || '')}
                  testId={`look-preset-stale-${item.id}`}
                />
              </>
            )}
          </div>
          <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5 min-h-[2rem]">{item.description || '—'}</div>
          {activeTab === 'brand' && (() => {
            const pack = libraryPayloadToBrandPack(item);
            const { recommended } = partitionLookPresetsForBrand(item.payload, lookPresetItems);
            return (
              <div className="mt-2 space-y-1.5">
                <BrandColorSwatches item={item} />
                <p className="text-[10px] text-muted-foreground">
                  {pack.fontCount} 字体 · {pack.frameCount} 镜头 · {pack.presetCount} 预设
                </p>
                {recommended.length > 0 && (
                  <p className="text-[10px] text-brand-blue/90">
                    推荐外观：{recommended.slice(0, 2).map((p) => p.name).join('、')}
                  </p>
                )}
              </div>
            );
          })()}
          {item.status && activeTab === 'digital_human' && (
            <span className="text-[10px] mt-1 inline-block px-1.5 py-0.5 rounded bg-secondary">{item.status}</span>
          )}
          <div className="flex gap-2 mt-2 flex-wrap" onClick={e => e.stopPropagation()}>
            {activeTab === 'digital_human' && (
              <>
                <Link to={`/digital-humans/${item.id}`} className="text-xs text-brand-blue hover:underline">管理</Link>
                <button type="button" className="text-xs text-red-500" onClick={() => setDeleteTarget({ kind: 'digital_human', id: item.id, name: item.name })}>删除</button>
              </>
            )}
            {activeTab === 'template' && (
              <Link to={`/editor/${item.id}`} className="text-xs text-brand-blue hover:underline">编辑</Link>
            )}
            {activeTab === 'look_preset' && returnTo?.startsWith('/editor/') && (
              <Link
                to={`${returnTo}${returnTo.includes('?') ? '&' : '?'}apply_look=${encodeURIComponent(item.id)}`}
                className="text-xs text-brand-blue hover:underline font-medium"
              >
                应用到项目
              </Link>
            )}
            {STORED_TABS.has(activeTab) && activeTab !== 'knowledge' && (
              <>
                <button type="button" className="text-xs text-brand-blue" onClick={() => startEdit(item)}>编辑</button>
                <button type="button" className="text-xs text-red-500" onClick={() => setDeleteTarget({ kind: 'library', id: item.id, name: item.name })}>删除</button>
              </>
            )}
            {activeTab === 'media' && (
              <button type="button" className="text-xs text-red-500" onClick={() => setDeleteTarget({ kind: 'media', id: item.id, name: item.name })}>删除</button>
            )}
            {activeTab === 'knowledge' && (
              <button type="button" className="text-xs text-muted-foreground" onClick={() => setDevNotice(true)}>查看文档</button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-secondary/30">
      <div className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.16em] text-brand-blue">制作素材中心</p>
            <h1 className="text-xl font-semibold tracking-tight">资产库</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              先选类型，再看预览；确认效果后再应用到项目。
            </p>
            {importMsg && <p className="text-xs text-brand-blue mt-1">{importMsg}</p>}
            {lookPresetSyncMsg && activeTab === 'look_preset' && (
              <p className="text-xs text-brand-blue mt-1" data-testid="look-preset-sync-msg">{lookPresetSyncMsg}</p>
            )}
          </div>
          {activeTab === 'brand' && (
            <button
              type="button"
              disabled={importing}
              onClick={reloadLocalBrand}
              className="px-3 py-2 rounded-md border border-border text-sm hover:bg-accent disabled:opacity-50"
            >
              {importing ? '重置中...' : '从本地模板重置'}
            </button>
          )}
        </div>

        {returnTo && (
          <div className="mb-4 flex items-center gap-3 rounded-xl border border-brand-blue/25 bg-card px-4 py-3 text-sm shadow-sm">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-blue text-xs font-semibold text-white">1</span>
            <span className="font-medium">挑选资产</span>
            <IconArrowRight size={14} className="text-muted-foreground" />
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary text-xs font-semibold">2</span>
            <span className="text-muted-foreground">预览效果</span>
            <IconArrowRight size={14} className="text-muted-foreground" />
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary text-xs font-semibold">3</span>
            <span className="text-muted-foreground">返回编辑</span>
            <Link to={returnTo} className="ml-auto shrink-0 rounded-lg bg-foreground px-3 py-2 text-xs font-medium text-background hover:opacity-90">
              完成挑选，返回编辑器
            </Link>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="h-fit rounded-xl border border-border bg-card p-3 shadow-sm lg:sticky lg:top-4">
            <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">资源分组</p>
            <div className="space-y-1">
              {ASSET_GROUPS.map((grp) => {
                const counts = grp.tabs.map((t) => Number(summary?.counts?.[t] || 0));
                const total = counts.reduce((a, b) => a + b, 0);
                const isActive = activeGroup === grp.id;
                return (
                  <button key={grp.id} type="button" data-testid={`asset-group-${grp.id}`}
                    onClick={() => setTab(grp.defaultTab)}
                    className={`w-full rounded-lg px-3 py-2.5 text-left transition-colors ${isActive ? 'bg-foreground text-background' : 'hover:bg-accent'}`}>
                    <span className="flex items-center justify-between gap-2 text-sm font-medium">
                      {grp.label}
                      <span className={`text-[10px] ${isActive ? 'text-background/60' : 'text-muted-foreground'}`}>{total || '—'}</span>
                    </span>
                    <span className={`mt-0.5 block truncate text-[10px] ${isActive ? 'text-background/60' : 'text-muted-foreground'}`}>{grp.hint}</span>
                    {isActive && grp.tabs.length > 1 && (
                      <span className="mt-1.5 flex flex-wrap gap-1">
                        {grp.tabs.map((t) => (
                          <span key={t} role="button" data-testid={`asset-tab-${t}`}
                            onClick={(e) => { e.stopPropagation(); setTab(t); }}
                            className={`cursor-pointer rounded px-1.5 py-0.5 text-[10px] ${activeTab === t ? 'bg-background text-foreground' : 'bg-background/20 text-background/80 hover:bg-background/30'}`}>
                            {TABS.find((tb) => tb.id === t)?.label || t}
                          </span>
                        ))}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="my-3 h-px bg-border" />
            <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">筛选</p>
            <div className="space-y-1">
              <button type="button" disabled className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-muted-foreground opacity-60" title="开发中">
                <span>收藏</span><span className="text-[10px]">即将上线</span>
              </button>
              <button type="button" disabled className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-muted-foreground opacity-60" title="开发中">
                <span>最近使用</span><span className="text-[10px]">即将上线</span>
              </button>
              <button type="button" disabled className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-muted-foreground opacity-60" title="开发中">
                <span>审核状态</span><span className="text-[10px]">即将上线</span>
              </button>
            </div>
            <div className="my-3 h-px bg-border" />
            <div className="flex flex-wrap gap-1">
              {(['all', 'enterprise', 'project'] as const).map((s) => (
                <button key={s} type="button" data-testid={`scope-${s}`} onClick={() => setScope(s)}
                  className={`rounded-md px-2 py-1 text-[10px] border ${scope === s ? 'bg-foreground text-background border-foreground' : 'border-border text-muted-foreground'}`}>
                  {s === 'all' ? '全部' : s === 'enterprise' ? '企业' : '项目'}
                </button>
              ))}
            </div>
          </aside>

          <main className="min-w-0 rounded-xl border border-border bg-card shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold">{tabMeta?.label}</h2>
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">{items.length} 项</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{tabMeta?.hint}</p>
              </div>
              {activeTab === 'brand' && (
                <button type="button" disabled={importing} onClick={reloadLocalBrand}
                  className="rounded-md border border-border px-3 py-2 text-xs hover:bg-accent disabled:opacity-50">
                  {importing ? '重置中...' : '从本地模板重置'}
                </button>
              )}
            </div>

            <div className="p-4 sm:p-5">
              <ImportCatalogBanner summary={summary} className="mb-4" onImported={() => { loadSummary(); loadItems(); }} />

        {activeTab === 'brand' && items.length === 0 && !loading && (
          <div className="mb-4 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground space-y-2">
            <p>暂无品牌包。可一键同步内置素材，或从本地 design.md / frame.md 新建。</p>
            <p className="text-xs">源模板目录：<code className="text-foreground/80">guide/data/brand-system/default/</code></p>
          </div>
        )}

        {activeTab === 'voice' && (
          <div className="flex gap-2 mb-4">
            {(['tts', 'bgm'] as const).map((kind) => (
              <button key={kind} type="button"
                onClick={() => { setVoiceSubTab(kind); setPreviewItem(null); setForm(emptyForm('voice', kind)); setShowForm(false); }}
                className={`px-3 py-1.5 rounded-md text-sm border ${
                  voiceSubTab === kind ? 'bg-foreground text-background border-foreground' : 'border-border text-muted-foreground'
                }`}>
                {kind === 'tts' ? <><IconMic size={14} className="inline mr-1" />TTS 音色</> : <><IconMusic size={14} className="inline mr-1" />BGM 背景音乐</>}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 mb-4">
          <div className="flex-1 flex items-center gap-2 bg-secondary rounded-md px-3 py-2">
            <IconSearch size={14} className="text-muted-foreground" aria-hidden />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder={`搜索${tabMeta?.label}...`}
              className="flex-1 bg-transparent text-sm outline-none" />
          </div>
          <button type="button" data-testid="ai-produce" className="shrink-0 flex items-center gap-1 px-3 py-2 rounded-md bg-foreground text-background text-sm"
            onClick={() => setDevNotice(true)}>
            AI 生产
          </button>
          {activeTab === 'digital_human' && (
            <Link to="/digital-humans/new" className="flex items-center gap-1 px-3 py-2 rounded-md bg-brand-blue text-white text-sm">
              <IconPlus size={14} /> 新建数字人
            </Link>
          )}
          {activeTab === 'media' && (
            <label className="flex items-center gap-1 px-3 py-2 rounded-md bg-brand-blue text-white text-sm cursor-pointer">
              <IconPlus size={14} /> {uploading ? '上传中...' : '上传素材'}
              <input type="file" className="hidden" accept="image/*,video/*,audio/*" disabled={uploading}
                onChange={e => { const f = e.target.files?.[0]; if (f) handleMediaUpload(f); e.target.value = ''; }} />
            </label>
          )}
          {activeTab === 'voice' && voiceSubTab === 'bgm' && (
            <label className="flex items-center gap-1 px-3 py-2 rounded-md bg-brand-blue text-white text-sm cursor-pointer">
              <IconPlus size={14} /> {uploading ? '上传中...' : '上传 BGM'}
              <input type="file" className="hidden" accept="audio/*" disabled={uploading}
                onChange={e => { const f = e.target.files?.[0]; if (f) handleBgmUpload(f); e.target.value = ''; }} />
            </label>
          )}
          {activeTab === 'brand' && (
            <button type="button" className="flex items-center gap-1 px-3 py-2 rounded-md border border-border text-sm"
              onClick={openBrandCreate}>
              <IconPlus size={14} /> 新建品牌包
            </button>
          )}
          {activeTab === 'look_preset' && previewItem && (
            <button
              type="button"
              data-testid="look-preset-export-card"
              className="flex items-center gap-1 px-3 py-2 rounded-md border border-border text-sm hover:bg-accent"
              onClick={() => exportLookPresetJson({
                name: previewItem.name,
                description: previewItem.description,
                tags: previewItem.tags,
                payload: previewItem.payload,
              })}
            >
              导出 JSON
            </button>
          )}
          {activeTab === 'look_preset' && (
            <>
              <button
                type="button"
                data-testid="look-preset-sync-all"
                disabled={syncingLookPresets}
                className="flex items-center gap-1 px-3 py-2 rounded-md border border-border text-sm hover:bg-accent disabled:opacity-50"
                onClick={syncLookPresets}
              >
                {syncingLookPresets ? '同步中…' : '同步过期预设'}
              </button>
              <button type="button" className="flex items-center gap-1 px-3 py-2 rounded-md border border-border text-sm"
                onClick={() => { setForm(emptyForm(activeTab)); setEditing(null); setShowForm(true); }}>
                <IconPlus size={14} /> 新建预设
              </button>
            </>
          )}
          {activeTab === 'script' && (
            <button type="button" className="flex items-center gap-1 px-3 py-2 rounded-md border border-border text-sm"
              onClick={() => { setForm(emptyForm(activeTab)); setEditing(null); setShowForm(true); }}>
              <IconPlus size={14} /> 新建
            </button>
          )}
          {activeTab === 'voice' && voiceSubTab === 'tts' && (
            <button type="button" className="flex items-center gap-1 px-3 py-2 rounded-md border border-border text-sm"
              onClick={() => { setForm(emptyForm('voice', 'tts')); setEditing(null); setShowForm(true); }}>
              <IconPlus size={14} /> 新建音色
            </button>
          )}
          {activeTab === 'voice' && voiceSubTab === 'bgm' && (
            <button type="button" className="flex items-center gap-1 px-3 py-2 rounded-md border border-border text-sm"
              onClick={() => { setForm(emptyForm('voice', 'bgm')); setEditing(null); setShowForm(true); }}>
              <IconPlus size={14} /> 手动添加
            </button>
          )}
          {activeTab === 'knowledge' && (
            <button type="button" className="flex items-center gap-1 px-3 py-2 rounded-md border border-border text-sm text-muted-foreground"
              onClick={() => setDevNotice(true)}>
              <IconPlus size={14} /> 新建目录（开发中）
            </button>
          )}
        </div>

        {showForm && STORED_TABS.has(activeTab) && activeTab !== 'brand' && renderStoredForm(activeTab)}

        {activeTab === 'knowledge' ? (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {loading ? <p className="col-span-full text-center text-muted-foreground py-12">加载中...</p>
                : items.length === 0 ? <p className="col-span-full text-center text-muted-foreground py-12">暂无知识库</p>
                : items.map(renderItemCard)}
            </div>
            <div className="space-y-4 self-start xl:sticky xl:top-4">
              <AssetPreviewPanel tab="knowledge" item={previewItem} />
              <div className="rounded-xl border border-dashed border-border bg-card p-4 text-center">
                <p className="text-xs font-medium">知识库文档</p>
                <p className="text-[10px] text-muted-foreground mt-1">上传、检索功能开发中</p>
                <button type="button" className="mt-3 px-3 py-1.5 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setDevNotice(true)}>
                  查看说明
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
              {loading ? <p className="col-span-full text-center text-muted-foreground py-12">加载中...</p>
                : items.length === 0 ? (
                  <div className="col-span-full rounded-xl border border-dashed border-border p-6 text-center">
                    <p className="text-sm font-medium">本分组暂无资产</p>
                    <p className="mt-1 text-xs text-muted-foreground">从这里开始生产「{groupDef(activeGroup).label}」所需资源</p>
                    <div className="mt-4 flex flex-wrap justify-center gap-2">
                      <button type="button" className="px-3 py-1.5 rounded-md border border-border text-xs hover:bg-accent"
                        onClick={() => setScope('enterprise')}>从企业资产选择</button>
                      {activeTab === 'media' ? (
                        <label className="px-3 py-1.5 rounded-md bg-brand-blue text-white text-xs cursor-pointer">
                          上传商品/参考素材
                          <input type="file" className="hidden" accept="image/*,video/*,audio/*"
                            onChange={e => { const f = e.target.files?.[0]; if (f) handleMediaUpload(f); e.target.value = ''; }} />
                        </label>
                      ) : (
                        <button type="button" className="px-3 py-1.5 rounded-md border border-border text-xs hover:bg-accent"
                          onClick={() => setTab('media')}>上传商品/参考素材</button>
                      )}
                      <button type="button" className="px-3 py-1.5 rounded-md border border-border text-xs hover:bg-accent"
                        onClick={() => setDevNotice(true)}>从内置可商用资源创建</button>
                      <button type="button" className="px-3 py-1.5 rounded-md border border-border text-xs hover:bg-accent"
                        onClick={() => setDevNotice(true)}>AI 生成商品场景/B-roll</button>
                      <button type="button" className="px-3 py-1.5 rounded-md border border-border text-xs hover:bg-accent"
                        onClick={() => setTab('template')}>应用镜头模板或动效包</button>
                    </div>
                  </div>
                ) : items.map(renderItemCard)}
            </div>
            <div className="min-h-[400px] self-start xl:sticky xl:top-4">
              {previewItem ? (
                <>
                  <AssetPreviewPanel tab={activeTab} item={previewItem} returnTo={returnTo} />
                  {editorRoundtrip && (
                    <button type="button" data-testid="apply-to-current-shot"
                      className="mt-3 w-full rounded-md bg-foreground px-3 py-2 text-xs font-medium text-background hover:opacity-90"
                      onClick={() => {
                        try {
                          const slot = searchParams.get('slot');
                          if (slot && previewItem) localStorage.setItem(`pendingSlotPick:${slot}`, JSON.stringify({ id: previewItem.id, file_url: previewItem.file_url, name: previewItem.name }));
                        } catch { /* ignore */ }
                        navigate(returnTo || '/assets');
                      }}>
                      {searchParams.get('slot') ? '替换当前槽位并返回编辑器' : '加入当前镜头并返回编辑器'}
                    </button>
                  )}
                </>
              ) : (
                <div className="rounded-xl border border-dashed border-border bg-card p-5 text-center">
                  <p className="text-sm font-medium">本项目缺少什么？</p>
                  <p className="mt-1 text-xs text-muted-foreground">选中资产可在此预览。当前建议：</p>
                  <ul className="mt-3 space-y-1 text-left text-xs text-muted-foreground">
                    {groupDef(activeGroup).id === 'product_scene' && <li>· 上传一张商品图 → AI 生成场景图</li>}
                    {groupDef(activeGroup).id === 'brand_role' && <li>· 新建品牌包或选择数字人</li>}
                    {groupDef(activeGroup).id === 'script_audio' && <li>· 创建导购脚本 / 选择 BGM</li>}
                    {groupDef(activeGroup).id === 'template_motion' && <li>· 应用镜头模板或外观预设</li>}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
            </div>
          </main>
        </div>
      </div>

      <BrandAssetEditor
        open={brandEditorOpen}
        mode={brandEditorMode}
        itemId={brandEditorId}
        onClose={() => setBrandEditorOpen(false)}
        onSaved={() => { loadItems(); loadSummary(); }}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="删除资产"
        message={deleteTarget ? `确定删除「${deleteTarget.name}」吗？此操作不可撤销。` : ''}
        confirmLabel="删除"
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmDialog
        open={devNotice}
        title="功能开发中"
        message="知识库文档管理（上传、编辑、检索）正在开发中，当前仅支持维护知识库目录信息。"
        confirmLabel="知道了"
        onConfirm={() => setDevNotice(false)}
        onCancel={() => setDevNotice(false)}
      />
    </div>
  );
}
