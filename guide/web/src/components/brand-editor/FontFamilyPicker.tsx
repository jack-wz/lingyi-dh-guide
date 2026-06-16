import { useMemo } from 'react';
import {
  fontFamilyCss,
  matchCatalogFamily,
  resolveFontUrl,
  useBrandFontFaces,
  type BrandFontFace,
  type FontCatalogItem,
} from '../../utils/brandFonts';
import FontPickerMenu, { type FontPickerOption } from './FontPickerMenu';

const SYSTEM_FONTS = [
  { family: 'PingFang SC', name: '苹方 (系统)' },
  { family: 'Microsoft YaHei', name: '微软雅黑 (系统)' },
  { family: 'sans-serif', name: '无衬线 (系统)' },
];

interface Props {
  label?: string;
  value?: string;
  onChange: (fontFamily: string) => void;
  catalog: FontCatalogItem[];
  packFonts?: BrandFontFace[];
  previewText?: string;
}

export default function FontFamilyPicker({
  label = '字体',
  value = '',
  onChange,
  catalog,
  packFonts = [],
  previewText = '永字八米',
}: Props) {
  const resolvedFamily = matchCatalogFamily(value, catalog, packFonts);

  const mergedFaces = useMemo(() => {
    const map = new Map<string, BrandFontFace>();
    for (const f of packFonts) {
      if (f.family) map.set(f.family, f);
    }
    for (const c of catalog) {
      if (!map.has(c.family)) map.set(c.family, { family: c.family, url: c.url });
    }
    return [...map.values()];
  }, [packFonts, catalog]);

  useBrandFontFaces(mergedFaces);

  const options = useMemo(() => {
    const seen = new Set<string>();
    const rows: FontPickerOption[] = [];
    const push = (row: FontPickerOption) => {
      if (!row.family || seen.has(row.family)) return;
      seen.add(row.family);
      rows.push(row);
    };

    for (const f of packFonts) {
      push({ family: f.family, name: f.name || f.family, url: f.url, group: '品牌包字体' });
    }
    for (const c of catalog) {
      push({ family: c.family, name: c.name, url: c.url, group: '字体库' });
    }
    for (const s of SYSTEM_FONTS) {
      push({ ...s, group: '系统' });
    }
    if (resolvedFamily && !seen.has(resolvedFamily)) {
      rows.unshift({ family: resolvedFamily, name: `${resolvedFamily} (当前)`, group: '当前' });
    }
    return rows;
  }, [packFonts, catalog, resolvedFamily]);

  const handleSelect = (family: string) => {
    if (!family) return;
    onChange(fontFamilyCss(family));
  };

  const previewUrl = resolvedFamily ? resolveFontUrl(resolvedFamily, packFonts, catalog) : undefined;

  return (
    <div className="space-y-1">
      <FontPickerMenu
        label={label}
        value={resolvedFamily}
        options={options}
        onChange={handleSelect}
        previewText={previewText}
      />
      {resolvedFamily && !previewUrl && !SYSTEM_FONTS.some((s) => s.family === resolvedFamily) ? (
        <div className="text-[9px] text-amber-600">未找到本地字体文件，请从字体库重新选择</div>
      ) : null}
    </div>
  );
}