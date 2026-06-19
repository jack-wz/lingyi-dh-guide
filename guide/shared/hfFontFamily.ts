/** HF render-safe font stacks — avoids lint errors for undeclared system fonts. */

import { parseFontFamilyName } from './subtitleStyles.js';

/** Families HyperFrames can auto-resolve during render (see @hyperframes/core fonts/aliases). */
const HF_AUTO_RESOLVED_FONTS = new Set([
  'poppins',
  'arial',
  'helvetica',
  'helvetica neue',
  'inter',
  'roboto',
  'open sans',
  'lato',
  'montserrat',
  'outfit',
  'oswald',
  'bebas neue',
  'futura',
  'segoe ui',
]);

export const HF_DEFAULT_RENDER_FONT = 'Poppins';

function quoteFontFamily(name: string): string {
  const safe = String(name || HF_DEFAULT_RENDER_FONT).replace(/'/g, "\\'");
  return `'${safe}'`;
}

function fontFaceDeclaresFamily(fontFaceCss: string, family: string): boolean {
  if (!fontFaceCss || !family) return false;
  const quoted = quoteFontFamily(family);
  return fontFaceCss.includes(`font-family:${quoted}`)
    || fontFaceCss.includes(`font-family: ${quoted}`);
}

/**
 * Build a font-family stack for HF captions / stage text.
 * Uses brand @font-face when present; otherwise HF auto-resolved web-safe families.
 */
export function resolveHfRenderFontStack(primaryFont: string, fontFaceCss = ''): string {
  const primary = parseFontFamilyName(primaryFont) || HF_DEFAULT_RENDER_FONT;
  const quoted = quoteFontFamily(primary);
  if (fontFaceDeclaresFamily(fontFaceCss, primary)) {
    return `${quoted}, sans-serif`;
  }
  if (HF_AUTO_RESOLVED_FONTS.has(primary.toLowerCase())) {
    return `${quoted}, sans-serif`;
  }
  return `'${HF_DEFAULT_RENDER_FONT}', sans-serif`;
}