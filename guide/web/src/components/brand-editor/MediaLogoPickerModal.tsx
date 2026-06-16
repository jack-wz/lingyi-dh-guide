import { useCallback, useEffect, useRef, useState } from 'react';
import { IconSearch, IconX } from '../Icons';

export interface MediaAssetItem {
  id: string;
  name: string;
  type: string;
  file_url: string;
}

interface Props {
  open: boolean;
  title?: string;
  onClose: () => void;
  onSelect: (asset: { url: string; name: string; id?: string }) => void;
}

function isImageUrl(url: string) {
  return /\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i.test(url) || url.startsWith('/uploads/');
}

export default function MediaLogoPickerModal({ open, title = '选择 Logo 图片', onClose, onSelect }: Props) {
  const [items, setItems] = useState<MediaAssetItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ category: 'media', limit: '120' });
      if (search.trim()) params.set('q', search.trim());
      const res = await fetch(`/api/library?${params}`);
      if (!res.ok) throw new Error('加载媒体库失败');
      const data = await res.json() as { items?: Array<{ id: string; name: string; file_url: string }> };
      const libraryItems = (data.items || [])
        .filter((a) => a.file_url && isImageUrl(a.file_url))
        .map((a) => ({ id: a.id, name: a.name, type: 'media', file_url: a.file_url }));
      if (libraryItems.length > 0) {
        setItems(libraryItems);
        return;
      }
      const legacyParams = new URLSearchParams({ type: 'logo,image,sticker', limit: '120' });
      if (search.trim()) legacyParams.set('q', search.trim());
      const legacyRes = await fetch(`/api/assets?${legacyParams}`);
      if (!legacyRes.ok) throw new Error('加载媒体库失败');
      const legacyData = await legacyRes.json() as { items?: MediaAssetItem[] };
      setItems((legacyData.items || []).filter((a) => a.file_url && isImageUrl(a.file_url)));
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const up = await fetch('/api/uploads', { method: 'POST', body: fd });
      if (!up.ok) throw new Error('上传失败');
      const uploaded = await up.json() as { url: string };
      const assetType = file.name.toLowerCase().includes('logo') ? 'logo' : 'image';
      const reg = await fetch('/api/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: file.name,
          type: assetType,
          file_url: uploaded.url,
          metadata: { size: file.size, mime: file.type, source: 'brand-editor' },
        }),
      });
      const created = reg.ok
        ? await reg.json() as MediaAssetItem
        : { id: '', name: file.name, type: assetType, file_url: uploaded.url };
      onSelect({ url: created.file_url || uploaded.url, name: created.name || file.name, id: created.id });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '上传失败');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-xl w-full max-w-lg max-h-[80vh] flex flex-col shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="shrink-0 flex items-center gap-2 px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold flex-1">{title}</h3>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-accent">
            <IconX size={16} />
          </button>
        </header>

        <div className="shrink-0 px-4 py-2 space-y-2 border-b border-border">
          <div className="flex items-center gap-2 rounded-md border border-border bg-background px-2">
            <IconSearch size={14} className="text-muted-foreground shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索媒体素材..."
              className="flex-1 h-8 text-xs bg-transparent outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              className="h-8 px-3 rounded-md bg-brand-blue text-white text-xs disabled:opacity-50"
            >
              {uploading ? '上传中...' : '上传新 Logo'}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleUpload(file);
              }}
            />
            <span className="text-[10px] text-muted-foreground">从媒体库选择或上传后自动入库</span>
          </div>
          {error ? <p className="text-[10px] text-destructive">{error}</p> : null}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-3">
          {loading ? (
            <p className="text-xs text-muted-foreground text-center py-8">加载中...</p>
          ) : items.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">暂无图片素材，请上传或前往资产库「媒体素材」添加</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onSelect({ url: item.file_url, name: item.name, id: item.id });
                    onClose();
                  }}
                  className="rounded-lg border border-border overflow-hidden hover:border-brand-blue hover:ring-1 hover:ring-brand-blue/40 text-left transition"
                >
                  <div className="aspect-square bg-secondary/40 flex items-center justify-center p-2">
                    <img src={item.file_url} alt="" className="max-w-full max-h-full object-contain" />
                  </div>
                  <div className="px-2 py-1.5">
                    <div className="text-[10px] font-medium truncate">{item.name}</div>
                    <div className="text-[9px] text-muted-foreground">{item.type}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}