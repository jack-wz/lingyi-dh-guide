import { useEffect, useState } from 'react';

export interface BrandFontFace {
  family: string;
  name?: string;
  url?: string;
}

export interface FontCatalogItem {
  family: string;
  name: string;
  style?: string;
  class?: string;
  url: string;
}

const injected = new Set<string>();

export function fontSrcFormat(url: string): string {
  if (/\.woff2($|\?)/i.test(url)) return 'woff2';
  if (/\.otf($|\?)/i.test(url)) return 'opentype';
  if (/\.woff($|\?)/i.test(url)) return 'woff';
  return 'truetype';
}

export function injectBrandFontFace(family: string, url: string) {
  if (!url || !family) return;
  const key = `${family}::${url}`;
  const id = `brand-font-${family.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  let el = document.getElementById(id) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = id;
    document.head.appendChild(el);
  }
  const fmt = fontSrcFormat(url);
  const css = `@font-face{font-family:'${family}';src:url('${url}') format('${fmt}');font-display:swap;}`;
  if (el.textContent !== css) el.textContent = css;
  injected.add(key);
}

export function useBrandFontFaces(fonts: BrandFontFace[]) {
  useEffect(() => {
    for (const f of fonts) {
      if (f.url) injectBrandFontFace(f.family, f.url);
    }
  }, [fonts]);
}

let catalogCache: FontCatalogItem[] | null = null;
let catalogPromise: Promise<FontCatalogItem[]> | null = null;

export function resetFontCatalogCache() {
  catalogCache = null;
  catalogPromise = null;
}

export function fetchFontCatalog(force = false): Promise<FontCatalogItem[]> {
  if (force) resetFontCatalogCache();
  if (catalogCache) return Promise.resolve(catalogCache);
  if (!catalogPromise) {
    catalogPromise = fetch('/api/library/brand/fonts')
      .then((r) => {
        if (!r.ok) throw new Error(`字体库加载失败 (${r.status})`);
        return r.json();
      })
      .then((data) => {
        catalogCache = (data.fonts || []) as FontCatalogItem[];
        return catalogCache;
      })
      .catch((err) => {
        catalogPromise = null;
        throw err instanceof Error ? err : new Error('字体库加载失败');
      });
  }
  return catalogPromise;
}

export function useFontCatalog() {
  const [catalog, setCatalog] = useState<FontCatalogItem[]>(catalogCache || []);
  const [loading, setLoading] = useState(!catalogCache);
  const [error, setError] = useState('');

  const load = (force = false) => {
    setLoading(true);
    setError('');
    void fetchFontCatalog(force)
      .then((items) => {
        setCatalog(items);
        setLoading(false);
      })
      .catch((err) => {
        setCatalog([]);
        setLoading(false);
        setError(err instanceof Error ? err.message : '字体库加载失败');
      });
  };

  useEffect(() => {
    if (catalogCache) return;
    load(false);
  }, []);

  return { catalog, loading, error, reload: () => load(true) };
}

/** Map CSS font-family / display name → catalog family key */
export function matchCatalogFamily(
  fontFamily: string | undefined,
  catalog: FontCatalogItem[],
  packFonts: BrandFontFace[] = [],
): string {
  const primary = primaryFontFamily(fontFamily);
  if (!primary) return '';
  const pools = [
    ...packFonts.map((f) => ({ family: f.family, name: f.name || f.family })),
    ...catalog.map((c) => ({ family: c.family, name: c.name })),
  ];
  const exact = pools.find((p) => p.family === primary);
  if (exact) return exact.family;
  const byName = pools.find((p) => p.name === primary || p.name.includes(primary) || primary.includes(p.name));
  if (byName) return byName.family;
  return primary;
}

/** CSS font-family with quotes for custom families */
export function fontFamilyCss(family: string): string {
  const trimmed = family.trim();
  if (!trimmed) return 'inherit';
  if (trimmed.includes(',')) return trimmed;
  return `'${trimmed.replace(/^['"]|['"]$/g, '')}'`;
}

/** Extract primary family token from a CSS font-family string */
export function primaryFontFamily(fontFamily?: string): string {
  if (!fontFamily) return '';
  return fontFamily.split(',')[0].trim().replace(/^['"]|['"]$/g, '');
}

export function resolveFontUrl(
  family: string,
  packFonts: BrandFontFace[],
  catalog: FontCatalogItem[],
): string | undefined {
  const hit = packFonts.find((f) => f.family === family);
  if (hit?.url) return hit.url;
  return catalog.find((c) => c.family === family)?.url;
}