import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { IconMic, IconMusic, IconSearch, IconX } from './Icons';
import { libraryPayloadToBrandPack } from '@shared/brandPack';
import BrandColorSwatches from './BrandColorSwatches';
import type { LibraryItem } from '../types/library';
import { fetchLibraryItems } from '../utils/libraryApi';

export type PickerCategory = 'digital_human' | 'brand' | 'script' | 'media' | 'voice' | 'template';

interface Props {
  open: boolean;
  category: PickerCategory;
  title: string;
  onClose: () => void;
  onSelect: (item: LibraryItem) => void;
  selectedId?: string;
  voiceSubType?: 'tts' | 'bgm';
  returnTo?: string;
}

const CATEGORY_API: Record<PickerCategory, string> = {
  digital_human: 'digital_human',
  brand: 'brand',
  script: 'script',
  media: 'media',
  voice: 'voice',
  template: 'template',
};

function PickerThumb({ category, item }: { category: PickerCategory; item: LibraryItem }) {
  if (item.file_url && (category === 'digital_human' || category === 'media' || category === 'template')) {
    return <img src={item.file_url} alt="" className="w-14 h-14 rounded object-cover bg-secondary shrink-0" />;
  }
  if (category === 'brand') {
    const color = String(item.payload?.brand_color || '#1d4ed8');
    return <div className="w-14 h-14 rounded shrink-0 border border-border" style={{ background: color }} />;
  }
  if (category === 'voice') {
    const isBgm = String(item.payload?.kind) === 'bgm' || Boolean(item.file_url && !item.payload?.voice_id);
    return (
      <div className="w-14 h-14 rounded bg-secondary shrink-0 flex items-center justify-center text-muted-foreground">
        {isBgm ? <IconMusic size={18} /> : <IconMic size={18} />}
      </div>
    );
  }
  if (category === 'script') {
    return (
      <div className="w-14 h-14 rounded bg-secondary shrink-0 p-1 text-[7px] text-muted-foreground overflow-hidden leading-tight">
        {String(item.payload?.content || '').slice(0, 40)}
      </div>
    );
  }
  return (
    <div className="w-14 h-14 rounded bg-secondary shrink-0 flex items-center justify-center text-[10px] text-muted-foreground">
      {item.category.slice(0, 4)}
    </div>
  );
}

export default function AssetPickerModal({ open, category, title, onClose, onSelect, selectedId, voiceSubType, returnTo }: Props) {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [hoverId, setHoverId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    fetchLibraryItems({
      category: CATEGORY_API[category] as 'script' | 'media' | 'voice' | 'digital_human' | 'brand',
      limit: 120,
      q: search,
      subType: category === 'voice' && voiceSubType ? voiceSubType : undefined,
      signal: controller.signal,
    })
      .then(setItems)
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setItems([]);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [open, category, search, voiceSubType]);

  if (!open) return null;

  const hoverItem = items.find(i => i.id === hoverId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-xl w-full max-w-4xl max-h-[80vh] flex flex-col shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-base font-medium">{title}</h2>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-secondary">
            <IconX size={18} />
          </button>
        </div>

        <div className="px-4 py-2 border-b border-border">
          <div className="flex items-center gap-2 bg-secondary rounded-md px-2 py-1.5">
            <IconSearch size={14} className="text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="搜索资产..."
              className="flex-1 bg-transparent text-sm outline-none"
            />
          </div>
        </div>

        <div className="flex flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto p-4">
            {loading ? (
              <p className="text-center text-muted-foreground py-8">加载中...</p>
            ) : items.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">暂无资产，请先在资产库中创建</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {items.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onMouseEnter={() => setHoverId(item.id)}
                    onClick={() => { onSelect(item); onClose(); }}
                    className={`text-left rounded-lg border p-3 transition-colors hover:border-brand-blue/50 hover:bg-brand-blue/5 ${
                      selectedId === item.id ? 'border-brand-blue bg-brand-blue/10' : 'border-border'
                    }`}
                  >
                    <div className="flex gap-3">
                      <PickerThumb category={category} item={item} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{item.name}</div>
                        <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                          {item.description || (category === 'script' ? String(item.payload?.content || '').slice(0, 60) : '')}
                        </div>
                        {category === 'voice' && (
                          <span className="text-[10px] mt-1 inline-block px-1.5 py-0.5 rounded bg-secondary">
                            {String(item.payload?.kind) === 'bgm' ? 'BGM' : 'TTS'}
                          </span>
                        )}
                        {category === 'brand' && (() => {
                          const pack = libraryPayloadToBrandPack(item);
                          return (
                            <div className="mt-1.5 space-y-1">
                              <BrandColorSwatches item={item} />
                              <span className="text-[10px] text-muted-foreground">
                                {pack.fontCount} 字体 · {pack.frameCount} 镜头 · {pack.presetCount} 预设
                              </span>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {hoverItem && (
            <div className="hidden md:block w-56 border-l border-border p-3 bg-secondary/20 shrink-0">
              <p className="text-xs font-medium mb-2 truncate">{hoverItem.name}</p>
              {hoverItem.file_url && (category === 'digital_human' || category === 'media') ? (
                <img src={hoverItem.file_url} alt="" className="w-full rounded-md object-cover aspect-square" />
              ) : category === 'script' ? (
                <p className="text-[10px] text-muted-foreground whitespace-pre-wrap line-clamp-8">
                  {String(hoverItem.payload?.content || '')}
                </p>
              ) : category === 'voice' && hoverItem.file_url ? (
                <audio controls className="w-full" src={hoverItem.file_url} preload="none" />
              ) : category === 'brand' ? (
                <div className="space-y-2">
                  <BrandColorSwatches item={hoverItem} size="md" />
                  <p className="text-[10px] text-muted-foreground">
                    {(() => {
                      const pack = libraryPayloadToBrandPack(hoverItem);
                      return `${pack.fontCount} 字体 · ${pack.frameCount} 镜头 · ${pack.presetCount} 预设`;
                    })()}
                  </p>
                </div>
              ) : (
                <p className="text-[10px] text-muted-foreground">{hoverItem.description || '—'}</p>
              )}
            </div>
          )}
        </div>

        <div className="px-4 py-2 border-t border-border shrink-0 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>数据来自资产库</span>
          <Link
            to={returnTo
              ? `/assets?tab=${CATEGORY_API[category]}&from=${encodeURIComponent(returnTo)}`
              : `/assets?tab=${CATEGORY_API[category]}`}
            className="text-brand-blue hover:underline"
            onClick={onClose}
          >
            在资产库管理
          </Link>
        </div>
      </div>
    </div>
  );
}