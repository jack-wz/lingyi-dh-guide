import type { LibraryItem } from '../types/library';

export function brandPalette(item: LibraryItem): string[] {
  const p = item.payload || {};
  const colors = [
    String(p.brand_color || '#1d4ed8'),
    String(p.background_color || '#f6f8fb'),
    String(p.text_color || '#ffffff'),
  ];
  return [...new Set(colors)];
}

export default function BrandColorSwatches({ item, size = 'sm' }: { item: LibraryItem; size?: 'sm' | 'md' }) {
  const box = size === 'md' ? 'w-5 h-5' : 'w-4 h-4';
  return (
    <div className="flex gap-1">
      {brandPalette(item).map((color) => (
        <span
          key={color}
          className={`${box} rounded border border-border shrink-0`}
          style={{ background: color }}
          title={color}
        />
      ))}
    </div>
  );
}