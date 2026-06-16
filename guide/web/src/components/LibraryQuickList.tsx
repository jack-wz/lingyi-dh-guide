import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { IconChevronRight } from './Icons';
import type { LibraryItem } from '../types/library';

export default function LibraryQuickList({
  loading,
  emptyHint,
  hubHref,
  items,
  renderIcon,
  renderPreview,
  onPick,
  pickLabel,
  maxItems = 8,
}: {
  loading: boolean;
  emptyHint: string;
  hubHref: string;
  items: LibraryItem[];
  renderIcon: (item: LibraryItem) => ReactNode;
  renderPreview?: (item: LibraryItem) => string;
  onPick: (item: LibraryItem) => void;
  pickLabel: string;
  maxItems?: number;
}) {
  if (loading) {
    return <p className="py-3 text-center text-[11px] text-muted-foreground">加载中…</p>;
  }
  if (items.length === 0) {
    return (
      <div className="py-3 text-center text-[11px] text-muted-foreground space-y-1.5">
        <p>{emptyHint}</p>
        <Link to={hubHref} className="text-brand-blue hover:underline inline-flex items-center gap-0.5">
          打开资产库
          <IconChevronRight size={11} />
        </Link>
      </div>
    );
  }
  const visible = items.slice(0, maxItems);
  return (
    <div className="space-y-1.5 max-h-40 overflow-y-auto">
      {visible.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onPick(item)}
          className="w-full text-left rounded-md border border-border hover:border-foreground/30 hover:bg-accent/40 p-2 flex gap-2 items-center"
        >
          <div className="w-9 h-9 rounded bg-secondary border border-border overflow-hidden shrink-0 flex items-center justify-center">
            {renderIcon(item)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-medium truncate">{item.name}</div>
            {renderPreview && (
              <p className="text-[9px] text-muted-foreground line-clamp-1">{renderPreview(item)}</p>
            )}
          </div>
          <span className="text-[9px] text-brand-blue shrink-0">{pickLabel}</span>
        </button>
      ))}
      {items.length > maxItems && (
        <Link to={hubHref} className="block text-center text-[10px] text-brand-blue hover:underline py-1">
          查看更多 ({items.length})
        </Link>
      )}
    </div>
  );
}