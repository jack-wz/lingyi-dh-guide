/** Parse opentalking-style design.md front matter into brand tokens. */

export interface DesignFont {
  name: string;
  family: string;
  style?: string;
  class?: string;
  url?: string;
}

export interface DesignBgm {
  name: string;
  url: string;
}

export interface ParsedDesignMd {
  name: string;
  description: string;
  colors: Record<string, string>;
  typography: {
    heading?: { fontFamily: string; fontWeight?: number };
    body?: { fontFamily: string; fontWeight?: number };
    fonts: DesignFont[];
    bgms: DesignBgm[];
  };
  rounded: Record<string, number>;
  spacing: Record<string, number>;
  raw: string;
}

function parseFrontMatter(raw: string): string {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return match ? match[1] : raw;
}

function parseQuotedColors(block: string): Record<string, string> {
  const colors: Record<string, string> = {};
  for (const m of block.matchAll(/^\s{2}(\w[\w-]*):\s*"(#[^"]+)"/gm)) {
    colors[m[1]] = m[2];
  }
  return colors;
}

function parseFontsBlock(block: string): DesignFont[] {
  const fonts: DesignFont[] = [];
  const entries = block.split(/\n\s{4}-\s+name:/).slice(1);
  for (const chunk of entries) {
    const name = chunk.split('\n')[0].trim();
    const family = chunk.match(/family:\s*(\S+)/)?.[1]?.trim() || name;
    const style = chunk.match(/style:\s*(.+)/)?.[1]?.trim();
    const cls = chunk.match(/class:\s*(.+)/)?.[1]?.trim();
    fonts.push({ name, family, style, class: cls });
  }
  return fonts;
}

function parseBgmsBlock(block: string): DesignBgm[] {
  const bgms: DesignBgm[] = [];
  const names = [...block.matchAll(/-\s*name:\s*(.+)/g)].map((m) => m[1].trim());
  const urls = [...block.matchAll(/url:\s*(\S+)/g)].map((m) => m[1].trim());
  names.forEach((n, i) => bgms.push({ name: n, url: urls[i] || '' }));
  return bgms;
}

function parseNumberMap(block: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of block.matchAll(/^\s{2}(\w[\w.]*):\s*(\d+)/gm)) {
    out[m[1]] = Number(m[2]);
  }
  return out;
}

export function parseDesignMd(raw: string): ParsedDesignMd | null {
  if (!raw.trim()) return null;
  const fm = parseFrontMatter(raw);
  const name = fm.match(/^name:\s*(.+)$/m)?.[1]?.trim() || '未命名品牌';
  const description = fm.match(/^description:\s*(.+)$/m)?.[1]?.trim() || '';

  const colorsBlock = fm.match(/colors:\s*\n([\s\S]*?)(?=\ntypography:|\nrounded:|\nspacing:|\n\w|\n#|$)/)?.[1] || '';
  const typoBlock = fm.match(/typography:\s*\n([\s\S]*?)(?=\nrounded:|\nspacing:|\n---|\n#|$)/)?.[1] || '';
  const fontsBlock = typoBlock.match(/fonts:\s*\n([\s\S]*?)(?=\n\s{2}bgms:|\n\w|$)/)?.[1] || '';
  const bgmsBlock = typoBlock.match(/bgms:\s*\n([\s\S]*?)(?=\n\w|$)/)?.[1] || '';

  const headingFamily = typoBlock.match(/heading:\s*\n\s+fontFamily:\s*"?([^"\n]+)"?/)?.[1]?.trim();
  const headingWeight = Number(typoBlock.match(/heading:[\s\S]*?fontWeight:\s*(\d+)/)?.[1] || 700);
  const bodyFamily = typoBlock.match(/body:\s*\n\s+fontFamily:\s*"?([^"\n]+)"?/)?.[1]?.trim();
  const bodyWeight = Number(typoBlock.match(/body:[\s\S]*?fontWeight:\s*(\d+)/)?.[1] || 400);

  const roundedBlock = fm.match(/rounded:\s*\n([\s\S]*?)(?=\nspacing:|\n\w|$)/)?.[1] || '';
  const spacingBlock = fm.match(/spacing:\s*\n([\s\S]*?)(?=\n\w|$)/)?.[1] || '';

  const colors = parseQuotedColors(colorsBlock);
  return {
    name,
    description,
    colors,
    typography: {
      heading: headingFamily ? { fontFamily: headingFamily, fontWeight: headingWeight } : undefined,
      body: bodyFamily ? { fontFamily: bodyFamily, fontWeight: bodyWeight } : undefined,
      fonts: parseFontsBlock(fontsBlock),
      bgms: parseBgmsBlock(bgmsBlock),
    },
    rounded: parseNumberMap(roundedBlock),
    spacing: parseNumberMap(spacingBlock),
    raw,
  };
}

export function designToFlatBrand(design: ParsedDesignMd) {
  return {
    brand_color: design.colors['digital-orange'] || design.colors['trust-blue'] || '#2563eb',
    background_color: design.colors['soft-pink'] || '#f6f8fb',
    accent_color: design.colors['trust-blue'] || '#2563eb',
    text_color: design.colors['light-text'] || '#ffffff',
    subtitle_style: 'bold-yellow',
    subtitle_position: 'bottom',
    logo_label: design.name.slice(0, 4) || '品牌',
  };
}