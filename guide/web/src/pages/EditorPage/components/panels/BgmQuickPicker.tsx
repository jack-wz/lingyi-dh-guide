import { useEffect, useState } from 'react';
import type { LibraryItem } from '../../../../types/library';
import { usePageVisibleRefresh } from '../../../../hooks/usePageVisibleRefresh';
import { fetchLibraryItems, libraryBgmItems } from '../../../../utils/libraryApi';

export default function BgmQuickPicker({ onApply }: { onApply: (item: LibraryItem) => void }) {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const refreshTick = usePageVisibleRefresh();

  useEffect(() => {
    fetchLibraryItems({ category: 'voice', limit: 40 })
      .then((all) => setItems(libraryBgmItems(all).slice(0, 6)))
      .catch(() => setItems([]));
  }, [refreshTick]);

  if (items.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onApply(item)}
          className="px-2 py-1 rounded border border-border text-[9px] truncate max-w-[130px] hover:bg-accent"
          title={item.name}
        >
          {item.name}
        </button>
      ))}
    </div>
  );
}
