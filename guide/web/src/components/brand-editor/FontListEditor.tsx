import { useMemo } from 'react';
import { TextField } from './primitives';
import FontFamilyPicker from './FontFamilyPicker';
import FontPickerMenu, { type FontPickerOption } from './FontPickerMenu';
import { fontFamilyCss, injectBrandFontFace, useBrandFontFaces, useFontCatalog } from '../../utils/brandFonts';

export interface BrandFontRow {
  name: string;
  family: string;
  style?: string;
  class?: string;
  url?: string;
}

interface Props {
  fonts: BrandFontRow[];
  onChange: (fonts: BrandFontRow[]) => void;
}

export default function FontListEditor({ fonts, onChange }: Props) {
  const { catalog, loading, error, reload } = useFontCatalog();

  useBrandFontFaces(fonts);

  const catalogByFamily = useMemo(
    () => new Map(catalog.map((c) => [c.family, c])),
    [catalog],
  );

  const addOptions = useMemo<FontPickerOption[]>(() => {
    return catalog.map((c) => ({
      family: c.family,
      name: `${c.name} (${c.family})`,
      url: c.url,
      group: '字体库',
      disabled: fonts.some((f) => f.family === c.family),
    }));
  }, [catalog, fonts]);

  const addFromCatalog = (family: string) => {
    const item = catalogByFamily.get(family);
    if (!item) return;
    if (fonts.some((f) => f.family === item.family)) return;
    injectBrandFontFace(item.family, item.url);
    onChange([...fonts, {
      name: item.name,
      family: item.family,
      style: item.style,
      class: item.class,
      url: item.url,
    }]);
  };

  const patch = (idx: number, p: Partial<BrandFontRow>) => {
    onChange(fonts.map((f, i) => (i === idx ? { ...f, ...p } : f)));
  };

  const swapFamily = (idx: number, family: string) => {
    const item = catalogByFamily.get(family);
    if (!item) {
      patch(idx, { family });
      return;
    }
    injectBrandFontFace(item.family, item.url);
    patch(idx, {
      family: item.family,
      name: item.name,
      style: item.style,
      class: item.class,
      url: item.url,
    });
  };

  const remove = (idx: number) => onChange(fonts.filter((_, i) => i !== idx));

  const availableCount = addOptions.filter((o) => !o.disabled).length;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-secondary/20 p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-medium text-muted-foreground">从项目字体库添加</span>
          {error ? (
            <button type="button" onClick={() => void reload()} className="text-[10px] text-brand-blue hover:underline">
              重新加载
            </button>
          ) : null}
        </div>
        <FontPickerMenu
          value=""
          placeholder={loading ? '加载字体库...' : availableCount ? '点击选择字体（选中即添加）' : '字体已全部添加'}
          options={addOptions}
          onChange={addFromCatalog}
          showPreview={false}
        />
        {error ? <p className="text-[10px] text-destructive">{error}</p> : null}
        {!loading && !error && catalog.length === 0 ? (
          <p className="text-[10px] text-amber-600">字体库为空，请确认 API 服务已启动且 guide/data/brand-system/fonts 存在。</p>
        ) : null}
        {!loading && availableCount === 0 && catalog.length > 0 ? (
          <p className="text-[10px] text-muted-foreground">字体库 {catalog.length} 项均已加入品牌包，可在下方列表切换字体。</p>
        ) : null}
      </div>

      {fonts.map((f, idx) => (
        <div key={`${f.family}-${idx}`} className="rounded-lg border border-border p-3 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 space-y-2">
              <div className="text-[10px] text-muted-foreground">{f.style || '字体'}{f.class ? ` · ${f.class}` : ''}</div>
              <div className="flex items-end gap-3 flex-wrap">
                {[18, 28, 40].map((size) => (
                  <span
                    key={size}
                    style={{ fontFamily: fontFamilyCss(f.family), fontSize: size, lineHeight: 1.1 }}
                    className="text-foreground"
                  >
                    永
                  </span>
                ))}
                <span
                  className="text-foreground ml-2"
                  style={{ fontFamily: fontFamilyCss(f.family), fontSize: 22, lineHeight: 1.2 }}
                >
                  永字八米
                </span>
              </div>
              {f.url ? (
                <div className="text-[9px] font-mono text-muted-foreground truncate">{f.url}</div>
              ) : (
                <div className="text-[9px] text-amber-600">未找到本地字体文件，请从字体库重新选择</div>
              )}
            </div>
            <button type="button" onClick={() => remove(idx)} className="text-[11px] text-destructive shrink-0">删除</button>
          </div>
          <FontFamilyPicker
            label="切换字体"
            value={f.family}
            onChange={(familyCss) => swapFamily(idx, familyCss.replace(/^['"]|['"]$/g, '').split(',')[0].trim())}
            catalog={catalog}
            packFonts={fonts}
            previewText="永字八米"
          />
          <div className="grid grid-cols-2 gap-2">
            <TextField label="显示名" value={f.name} onChange={(v) => patch(idx, { name: v })} />
            <TextField label="风格标签" value={f.style || ''} onChange={(v) => patch(idx, { style: v })} />
            <TextField label="分类" value={f.class || ''} onChange={(v) => patch(idx, { class: v })} />
          </div>
        </div>
      ))}

      {fonts.length === 0 && (
        <p className="text-xs text-muted-foreground">字体文件位于 guide/data/brand-system/fonts/，从上方列表选择即可添加并实时预览。</p>
      )}
    </div>
  );
}