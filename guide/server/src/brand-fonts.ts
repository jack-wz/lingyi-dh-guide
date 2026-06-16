import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'fs';
import { basename, join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getDataDir } from './db/database.js';
import { parseDesignMarkdown } from '../../shared/brandYaml.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUNDLED_FONTS_DIR = join(__dirname, '../../data/brand-system/fonts');
const FONT_EXT = /\.(ttf|otf|woff2?)$/i;

export interface BrandFontCatalogItem {
  family: string;
  name: string;
  style?: string;
  class?: string;
  file: string;
  url: string;
}

export interface BrandFontEntry {
  name: string;
  family: string;
  style?: string;
  class?: string;
  url?: string;
}

function copyDirRecursive(src: string, dest: string) {
  if (!existsSync(src)) return;
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) copyDirRecursive(srcPath, destPath);
    else if (!existsSync(destPath)) copyFileSync(srcPath, destPath);
  }
}

export function getBundledBrandFontsDir(): string {
  return BUNDLED_FONTS_DIR;
}

export function getUserBrandFontsDir(dataDir?: string): string {
  const base = dataDir || getDataDir();
  const userDir = join(base, 'brand-system', 'fonts');
  if (existsSync(BUNDLED_FONTS_DIR)) {
    copyDirRecursive(BUNDLED_FONTS_DIR, userDir);
  }
  return userDir;
}

export function findBrandFontFile(fontsRoot: string, family: string): string | null {
  const dir = join(fontsRoot, family);
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => FONT_EXT.test(f));
  if (!files.length) return null;
  const preferred = files.find((f) => /regular|normal|medium|bold/i.test(f)) || files[0];
  return join(dir, preferred);
}

export function brandFontPublicUrl(family: string, filePath: string): string {
  return `/brand-fonts/${family}/${basename(filePath)}`;
}

export function enrichBrandPackFontsLocal(
  fonts: BrandFontEntry[],
  dataDir?: string,
): BrandFontEntry[] {
  const fontsRoot = getUserBrandFontsDir(dataDir);
  const nameMap = loadFontNameMap(fontsRoot);
  return fonts.map((font) => {
    if (font.url?.startsWith('/brand-fonts/')) return font;
    const src = findBrandFontFile(fontsRoot, font.family);
    if (!src) return font;
    return {
      ...font,
      name: font.name || nameMap[font.family]?.name || font.family,
      style: font.style || nameMap[font.family]?.style,
      class: font.class || nameMap[font.family]?.class,
      url: brandFontPublicUrl(font.family, src),
    };
  });
}

function loadFontNameMap(fontsRoot: string): Record<string, { name: string; style?: string; class?: string }> {
  const infoPath = join(fontsRoot, 'font_info.json');
  if (!existsSync(infoPath)) return {};
  try {
    const raw = JSON.parse(readFileSync(infoPath, 'utf-8')) as Array<{
      font_name: string;
      style?: string;
      class?: string;
    }>;
    const map: Record<string, { name: string; style?: string; class?: string }> = {};
    for (const item of raw) {
      const family = item.font_name;
      const file = findBrandFontFile(fontsRoot, family);
      map[family] = {
        name: family,
        style: item.style,
        class: item.class,
      };
      if (file) {
        const display = basename(file, basename(file).replace(/\.[^.]+$/, ''));
        map[family].name = display.replace(/\.(ttf|otf)$/i, '') || family;
      }
    }
    return map;
  } catch {
    return {};
  }
}

export function scanBrandFontCatalog(dataDir?: string): BrandFontCatalogItem[] {
  const fontsRoot = getUserBrandFontsDir(dataDir);
  const designNames = loadDesignFontNames();
  const infoMap = loadFontNameMap(fontsRoot);
  const families = new Set<string>([
    ...Object.keys(infoMap),
    ...readdirSync(fontsRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name),
  ]);

  const items: BrandFontCatalogItem[] = [];
  for (const family of families) {
    const file = findBrandFontFile(fontsRoot, family);
    if (!file) continue;
    const designMeta = designNames[family];
    items.push({
      family,
      name: designMeta?.name || infoMap[family]?.name || family,
      style: designMeta?.style || infoMap[family]?.style,
      class: designMeta?.class || infoMap[family]?.class,
      file: basename(file),
      url: brandFontPublicUrl(family, file),
    });
  }
  return items.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
}

function loadDesignFontNames(): Record<string, { name: string; style?: string; class?: string }> {
  try {
    const designPath = join(dirname(BUNDLED_FONTS_DIR), 'default', 'design.md');
    if (!existsSync(designPath)) return {};
    const design = parseDesignMarkdown(readFileSync(designPath, 'utf-8'));
    const fonts = (design.typography as { fonts?: BrandFontEntry[] }).fonts || [];
    const map: Record<string, { name: string; style?: string; class?: string }> = {};
    for (const f of fonts) map[f.family] = { name: f.name, style: f.style, class: f.class };
    return map;
  } catch {
    return {};
  }
}

export function getBrandFontsStaticDir(dataDir?: string): string {
  return getUserBrandFontsDir(dataDir);
}