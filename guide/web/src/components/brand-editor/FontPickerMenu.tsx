import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { fontFamilyCss, injectBrandFontFace } from '../../utils/brandFonts';

export interface FontPickerOption {
  family: string;
  name: string;
  group?: string;
  url?: string;
  disabled?: boolean;
}

interface Props {
  label?: string;
  value?: string;
  placeholder?: string;
  options: FontPickerOption[];
  onChange: (family: string) => void;
  previewText?: string;
  showPreview?: boolean;
}

export default function FontPickerMenu({
  label,
  value = '',
  placeholder = '选择字体...',
  options,
  onChange,
  previewText = '永字八米',
  showPreview = true,
}: Props) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<{ top: number; left: number; width: number } | null>(null);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.family === value && !o.disabled);
  const grouped = ['品牌包字体', '字体库', '系统', '当前', undefined].map((group) => ({
    group,
    items: options.filter((o) => (group ? o.group === group : !o.group)),
  })).filter((g) => g.items.length > 0);

  const updatePosition = () => {
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setMenuStyle({
      top: rect.bottom + 4,
      left: rect.left,
      width: Math.max(rect.width, 220),
    });
  };

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    const onResize = () => updatePosition();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (anchorRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pick = (opt: FontPickerOption) => {
    if (opt.disabled) return;
    if (opt.url) injectBrandFontFace(opt.family, opt.url);
    onChange(opt.family);
    setOpen(false);
  };

  const previewFamily = value ? fontFamilyCss(value) : 'inherit';

  return (
    <div className="space-y-2">
      {label ? <div className="text-[11px] text-muted-foreground">{label}</div> : null}
      <button
        ref={anchorRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-1 flex w-full h-8 items-center justify-between gap-2 rounded-md border border-border bg-background px-2 text-xs text-left hover:border-brand-blue/60"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate">{selected?.name || value || placeholder}</span>
        <span className="text-muted-foreground shrink-0">{open ? '▴' : '▾'}</span>
      </button>

      {open && menuStyle && createPortal(
        <div
          ref={menuRef}
          role="listbox"
          className="fixed z-[300] max-h-56 overflow-y-auto rounded-md border border-border bg-card shadow-xl py-1"
          style={{ top: menuStyle.top, left: menuStyle.left, width: menuStyle.width }}
        >
          {grouped.map(({ group, items }) => (
            <div key={group || 'default'}>
              {group ? (
                <div className="px-2 py-1 text-[9px] font-medium text-muted-foreground uppercase tracking-wide">
                  {group}
                </div>
              ) : null}
              {items.map((opt) => (
                <button
                  key={`${group || 'g'}-${opt.family}`}
                  type="button"
                  role="option"
                  aria-selected={opt.family === value}
                  disabled={opt.disabled}
                  onClick={() => pick(opt)}
                  className={`flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-accent/70 disabled:opacity-40 disabled:cursor-not-allowed ${
                    opt.family === value ? 'bg-brand-blue/10 text-brand-blue' : ''
                  }`}
                >
                  <span className="truncate">{opt.name}</span>
                  <span
                    className="shrink-0 text-sm text-foreground"
                    style={{ fontFamily: fontFamilyCss(opt.family) }}
                  >
                    永
                  </span>
                </button>
              ))}
            </div>
          ))}
          {options.length === 0 ? (
            <div className="px-3 py-2 text-[11px] text-muted-foreground">字体库加载中或为空</div>
          ) : null}
        </div>,
        document.body,
      )}

      {showPreview ? (
        <div className="rounded-lg border border-border bg-secondary/30 px-3 py-2">
          <div className="text-[10px] text-muted-foreground mb-1">字体预览</div>
          <div className="text-foreground" style={{ fontFamily: previewFamily, fontSize: 22, lineHeight: 1.3 }}>
            {previewText}
          </div>
        </div>
      ) : null}
    </div>
  );
}