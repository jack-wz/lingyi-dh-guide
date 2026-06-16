import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { extname, join } from 'path';

/** Map design.md font family → OpenStoryline fonts/ subdirectory name. */
export const OPENSTORYLINE_FONT_DIRS: Record<string, string> = {
  BiaoXiaoZhiBiaoTiHei: 'BiaoXiaoZhiBiaoTiHei',
  DeyiHei: 'DeyiHei',
  LeetfontMengHeiTi: 'LeetfontMengHeiTi',
  MaoKenShiJinHei: 'MaoKenShiJinHei',
  PangMenZhengDaoBiaoTiTi: 'PangMenZhengDaoBiaoTiTi',
  SourceHanSansSC: 'SourceHanSansSC',
  CP_Revenge: 'CP_Revenge',
  ChenYuLuoYanTi: 'ChenYuLuoYanTi',
  HanChanShouZhuoTi: 'HanChanShouZhuoTi',
  JiangXiZuoKaiTi: 'JiangXiZuoKaiTi',
  PingFangXingChenTi: 'PingFangXingChenTi',
  QianTuXueHuaTi: 'QianTuXueHuaTi',
  ShiWeiB2JiaTangSongTi: 'ShiWeiB2JiaTangSongTi',
  YouSheBiaoTiHei: 'YouSheBiaoTiHei',
  ZiZhiQuXiMaiTi: 'ZiZhiQuXiMaiTi',
};

const FONT_EXT = /\.(ttf|otf|woff2)$/i;

export function findOpenStorylineFontFile(openStorylineRoot: string, family: string): string | null {
  const dirName = OPENSTORYLINE_FONT_DIRS[family] || family;
  const dir = join(openStorylineRoot, 'fonts', dirName);
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f: string) => FONT_EXT.test(f));
  if (!files.length) return null;
  const preferred = files.find((f: string) => /regular|normal|medium/i.test(f)) || files[0];
  return join(dir, preferred);
}

export function copyBrandFontToUploads(
  srcPath: string,
  family: string,
  uploadsDir: string,
): string {
  const fontsDir = join(uploadsDir, 'fonts');
  if (!existsSync(fontsDir)) mkdirSync(fontsDir, { recursive: true });
  const ext = extname(srcPath) || '.ttf';
  const safeFamily = family.replace(/[^a-zA-Z0-9_-]/g, '');
  const destName = `brand-${safeFamily}${ext}`;
  const destPath = join(fontsDir, destName);
  if (!existsSync(destPath)) copyFileSync(srcPath, destPath);
  return `/uploads/fonts/${destName}`;
}

/** @deprecated Prefer server `enrichBrandPackFontsLocal` with project-bundled fonts. */
export function enrichBrandPackFonts(
  fonts: Array<{ name: string; family: string; style?: string; class?: string; url?: string }>,
  fontsRoot: string,
  uploadsDir?: string,
): typeof fonts {
  if (!existsSync(fontsRoot)) return fonts;
  return fonts.map((font) => {
    if (font.url?.startsWith('/brand-fonts/')) return font;
    const dir = join(fontsRoot, OPENSTORYLINE_FONT_DIRS[font.family] || font.family);
    if (!existsSync(dir)) return font;
    const files = readdirSync(dir).filter((f: string) => FONT_EXT.test(f));
    if (!files.length) return font;
    const preferred = files.find((f: string) => /regular|normal|medium/i.test(f)) || files[0];
    const src = join(dir, preferred);
    if (uploadsDir) {
      const url = copyBrandFontToUploads(src, font.family, uploadsDir);
      return { ...font, url };
    }
    return { ...font, url: `/brand-fonts/${font.family}/${preferred}` };
  });
}