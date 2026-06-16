import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { IconMic, IconMusic, IconPlus, IconSearch, IconTrash, IconType, IconFilm, IconImage } from '../components/Icons';
import AssetPreviewPanel from '../components/AssetPreviewPanel';
import { libraryPayloadToBrandPack } from '@shared/brandPack';
import BrandColorSwatches from '../components/BrandColorSwatches';
import BrandAssetEditor from '../components/BrandAssetEditor';
import ConfirmDialog from '../components/ConfirmDialog';
import ImportCatalogBanner from '../components/ImportCatalogBanner';
import type { AssetHubTab, LibraryItem, LibrarySummary } from '../types/library';

const TABS: { id: AssetHubTab; label: string; hint: string; primary?: boolean }[] = [
  { id: 'digital_human', label: '数字人', hint: '训练与管理数字人形象', primary: true },
  { id: 'brand', label: '品牌包', hint: '本地 design.md / frame.md，可视化 + Markdown 编辑：颜色、字体、圆角间距、镜头、色板、文本/字幕/动画/版式/形状/元素库', primary: true },
  { id: 'script', label: '脚本', hint: '旁白与导购话术', primary: true },
  { id: 'template', label: '模板', hint: '视频模板，编辑时仅选择' },
  { id: 'voice', label: '声音', hint: 'TTS 音色、克隆与 BGM 背景音乐' },
  { id: 'media', label: '媒体素材', hint: '图片、视频、贴纸等' },
  { id: 'knowledge', label: '知识库', hint: '目录维护；文档上传与检索开发中' },
];

const STORED_TABS = new Set<AssetHubTab>(['brand', 'voice', 'script', 'knowledge']);
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

function CardThumb({ tab, item, voiceKind }: { tab: AssetHubTab; item: LibraryItem; voiceKind?: VoiceSubTab }) {
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
          <IconFilm size={20} />
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
        {kind === 'bgm' ? <IconMusic size={22} /> : <IconMic size={22} />}
        <span className="text-[9px]">{kind === 'bgm' ? 'BGM' : 'TTS'}</span>
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
        <IconType size={22} />
      </div>
    );
  }
  return (
    <div className="w-full h-full flex items-center justify-center bg-secondary text-muted-foreground">
      <IconImage size={22} />
    </div>
  );
}

export default function AssetHubPage() {
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
  const [deleteTarget, setDeleteTarget] = useState<{ kind: 'library' | 'media'; id: string; name: string } | null>(null);

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
    loadItems();
    loadSummary();
    setEditing(null);
    setForm(emptyForm(activeTab, voiceSubTab));
    setShowForm(false);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    if (deleteTarget.kind === 'library') {
      await fetch(`/api/library/${deleteTarget.id}`, { method: 'DELETE' });
      if (editing?.id === deleteTarget.id) setEditing(null);
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
    const up = await fetch('/api/assets/upload', { method: 'POST', body: fd });
    if (!up.ok) throw new Error('上传失败');
    return up.json() as Promise<{ url: string }>;
  };

  const handleMediaUpload = async (file: File) => {
    setUploading(true);
    try {
      const asset = await uploadFile(file);
      await fetch('/api/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: file.name,
          type: file.type.startsWith('video') ? 'video' : file.type.startsWith('image') ? 'image' : 'other',
          file_url: asset.url,
          metadata: { size: file.size, mime: file.type },
        }),
      });
      loadItems();
      loadSummary();
    } finally {
      setUploading(false);
    }
  };

  const handleBgmUpload = async (file: File) => {
    setUploading(true);
    try {
      const asset = await uploadFile(file);
      await fetch('/api/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: file.name,
          type: 'bgm',
          file_url: asset.url,
          metadata: { size: file.size, mime: file.type },
        }),
      });
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
      <div className="border border-border rounded-lg p-4 bg-card space-y-3 mb-4">
        <div className="text-sm font-medium">{editing ? '编辑' : '新建'}{category === 'voice' ? (voiceSubTab === 'bgm' ? 'BGM' : '音色') : tabMeta?.label}</div>
        <input
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          placeholder="名称"
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

        <div className="flex gap-2">
          <button type="button" className="px-3 py-1.5 rounded-md bg-brand-blue text-white text-sm"
            onClick={() => saveStoredItem(category, {
              name: form.name,
              description: form.description,
              file_url: form.file_url,
              payload: category === 'voice'
                ? { ...(form.payload as object), kind: voiceSubTab }
                : form.payload,
            }, editing?.id)}>
            保存
          </button>
          <button type="button" className="px-3 py-1.5 rounded-md border border-border text-sm"
            onClick={() => { setEditing(null); setForm(emptyForm(activeTab, voiceSubTab)); setShowForm(false); }}>
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
        className={`border rounded-xl overflow-hidden bg-card transition-all duration-150 cursor-pointer ${
          selected
            ? 'border-brand-blue border-l-[3px] border-l-brand-blue ring-1 ring-brand-blue/20 scale-[1.01]'
            : 'border-border hover:border-brand-blue/40'
        }`}
      >
        <div className="aspect-[4/3] bg-secondary border-b border-border overflow-hidden">
          <CardThumb tab={activeTab} item={item} voiceKind={voiceSubTab} />
        </div>
        <div className="p-3">
          <div className="text-sm font-medium truncate">{item.name}</div>
          <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5 min-h-[2rem]">{item.description || '—'}</div>
          {activeTab === 'brand' && (() => {
            const pack = libraryPayloadToBrandPack(item);
            return (
              <div className="mt-2 space-y-1.5">
                <BrandColorSwatches item={item} />
                <p className="text-[10px] text-muted-foreground">
                  {pack.fontCount} 字体 · {pack.frameCount} 镜头 · {pack.presetCount} 预设
                </p>
              </div>
            );
          })()}
          {item.status && activeTab === 'digital_human' && (
            <span className="text-[10px] mt-1 inline-block px-1.5 py-0.5 rounded bg-secondary">{item.status}</span>
          )}
          <div className="flex gap-2 mt-2 flex-wrap" onClick={e => e.stopPropagation()}>
            {activeTab === 'digital_human' && (
              <Link to={`/digital-humans/${item.id}`} className="text-xs text-brand-blue hover:underline">管理</Link>
            )}
            {activeTab === 'template' && (
              <Link to={`/editor/${item.id}`} className="text-xs text-brand-blue hover:underline">编辑</Link>
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
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold">资产库</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              品牌包使用项目内 guide/data/brand-system/；脚本/音色/BGM 使用内置本地种子数据，可在各 Tab 新建或编辑
            </p>
            {importMsg && <p className="text-xs text-brand-blue mt-1">{importMsg}</p>}
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
          <div className="mb-4 rounded-lg border border-brand-blue/25 bg-brand-blue/5 px-4 py-2.5 flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">从编辑器跳转而来，在此管理素材后可返回继续编辑。</span>
            <Link to={returnTo} className="text-brand-blue hover:underline shrink-0 font-medium">
              返回编辑器
            </Link>
          </div>
        )}

        <ImportCatalogBanner
          summary={summary}
          className="mb-4"
          onImported={() => { loadSummary(); loadItems(); }}
        />

        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="flex flex-wrap gap-2">
            {TABS.filter((t) => t.primary).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setTab(tab.id)}
                className={`px-3 py-1.5 rounded-full text-sm border font-medium transition-colors duration-150 ${
                  activeTab === tab.id
                    ? 'bg-brand-blue text-white border-brand-blue'
                    : 'border-brand-blue/50 text-foreground hover:bg-brand-blue/8'
                }`}
              >
                {tab.label}
                {summary?.counts?.[tab.id] != null && <span className="ml-1 opacity-80">({summary.counts[tab.id]})</span>}
              </button>
            ))}
          </div>
          <div className="hidden sm:block w-px h-6 bg-border mx-0.5" aria-hidden />
          <div className="flex flex-wrap gap-1.5">
            {TABS.filter((t) => !t.primary).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setTab(tab.id)}
                className={`px-2.5 py-1 rounded-full text-xs border transition-colors duration-150 ${
                  activeTab === tab.id
                    ? 'bg-accent text-accent-foreground border-border'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-accent/60'
                }`}
              >
                {tab.label}
                {summary?.counts?.[tab.id] != null && <span className="ml-1 opacity-60">({summary.counts[tab.id]})</span>}
              </button>
            ))}
          </div>
        </div>

        {activeTab === 'brand' && items.length === 0 && !loading && (
          <div className="mb-4 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            暂无品牌包。点击「从本地模板重置」或「新建品牌包」，源文件位于 guide/data/brand-system/default/。
          </div>
        )}

        <p className="text-xs text-muted-foreground mb-4">{tabMeta?.hint}</p>

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
            <IconSearch size={14} className="text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder={`搜索${tabMeta?.label}...`}
              className="flex-1 bg-transparent text-sm outline-none" />
          </div>
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
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {loading ? <p className="col-span-full text-center text-muted-foreground py-12">加载中...</p>
                : items.length === 0 ? <p className="col-span-full text-center text-muted-foreground py-12">暂无知识库</p>
                : items.map(renderItemCard)}
            </div>
            <div className="lg:col-span-1 space-y-4 sticky top-4 self-start">
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
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {loading ? <p className="col-span-full text-center text-muted-foreground py-12">加载中...</p>
                : items.length === 0 ? <p className="col-span-full text-center text-muted-foreground py-12">暂无数据</p>
                : items.map(renderItemCard)}
            </div>
            <div className="lg:col-span-1 min-h-[400px] sticky top-4 self-start">
              <AssetPreviewPanel tab={activeTab} item={previewItem} />
            </div>
          </div>
        )}
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

      {devNotice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setDevNotice(false)}>
          <div className="bg-card border border-border rounded-xl p-6 max-w-sm w-full shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold mb-2">功能开发中</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              知识库文档管理（上传、编辑、检索）正在开发中，当前仅支持维护知识库目录信息。
            </p>
            <button type="button" className="mt-4 w-full py-2 rounded-md bg-brand-blue text-white text-sm" onClick={() => setDevNotice(false)}>
              知道了
            </button>
          </div>
        </div>
      )}
    </div>
  );
}