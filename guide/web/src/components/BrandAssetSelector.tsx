import { Link } from 'react-router-dom';
import { libraryPayloadToBrandPack } from '@shared/brandPack';
import { useBrandLibrary } from '../hooks/useBrandLibrary';
import type { LibraryItem } from '../types/library';

interface Props {
  selectedId?: string;
  onSelect: (item: LibraryItem) => void;
  variant?: 'toolbar' | 'panel';
  editorId?: string;
  className?: string;
}

function brandSwatchColor(item: LibraryItem) {
  return String(item.payload?.brand_color || '#1d4ed8');
}

export default function BrandAssetSelector({
  selectedId,
  onSelect,
  variant = 'panel',
  editorId,
  className = '',
}: Props) {
  const { brands, loading } = useBrandLibrary();
  const selected = brands.find((b) => b.id === selectedId);

  const handleChange = (id: string) => {
    if (!id) return;
    const item = brands.find((b) => b.id === id);
    if (item) onSelect(item);
  };

  const brandHubHref = editorId
    ? `/assets?tab=brand&from=${encodeURIComponent(`/editor/${editorId}`)}`
    : '/assets?tab=brand';

  if (variant === 'toolbar') {
    return (
      <div className={`flex items-center gap-1 ${className}`}>
        <span
          className="w-3 h-3 rounded-full shrink-0 border border-border"
          style={{ background: selected ? brandSwatchColor(selected) : '#94a3b8' }}
          title={selected?.name || '未选品牌'}
        />
        <select
          value={selectedId || ''}
          onChange={(e) => handleChange(e.target.value)}
          disabled={loading || brands.length === 0}
          className="h-9 max-w-[132px] rounded-md border border-border bg-background px-2 text-[12px] truncate"
          title="品牌资产（来自资产库，切换后立即应用）"
          aria-label="品牌资产"
        >
          <option value="">{loading ? '加载品牌…' : '选择品牌'}</option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        <Link
          to={brandHubHref}
          className="h-9 px-1.5 rounded-md text-[10px] text-brand-blue hover:bg-brand-blue/10 flex items-center shrink-0"
          title="在资产库管理品牌包"
        >
          管理
        </Link>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <label className="block text-xs text-muted-foreground">品牌资产</label>
        <Link to={brandHubHref} className="text-[10px] text-brand-blue hover:underline shrink-0">
          管理
        </Link>
      </div>
      <select
        value={selectedId || ''}
        onChange={(e) => handleChange(e.target.value)}
        disabled={loading || brands.length === 0}
        className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm"
      >
        <option value="">{loading ? '加载中…' : '选择品牌包'}</option>
        {brands.map((b) => {
          const pack = libraryPayloadToBrandPack(b);
          return (
            <option key={b.id} value={b.id}>
              {b.name} · {pack.fontCount}字体 · {pack.frameCount}镜头
            </option>
          );
        })}
      </select>
      {selected && (() => {
        const pack = libraryPayloadToBrandPack(selected);
        return (
          <div className="mt-2 flex items-center gap-2">
            {pack.useLogo && pack.logoUrl ? (
              <img src={pack.logoUrl} alt="" className="w-8 h-8 object-contain shrink-0 rounded border border-border bg-background p-0.5" />
            ) : (
              <span className="w-5 h-5 rounded border border-border shrink-0" style={{ background: brandSwatchColor(selected) }} />
            )}
            <span className="text-[10px] text-muted-foreground truncate flex-1">
              {selected.description || pack.logoLabel}
              {pack.subBrands.length ? ` · ${pack.subBrands.filter((s) => s.enabled).length} 子品牌` : ''}
            </span>
          </div>
        );
      })()}
      {!loading && brands.length === 0 && (
        <p className="mt-2 text-[10px] text-muted-foreground">
          暂无品牌包，请先在
          {' '}
          <Link to="/assets?tab=brand" className="text-brand-blue hover:underline">资产库</Link>
          {' '}
          从本地模板重置或新建。
        </p>
      )}
    </div>
  );
}