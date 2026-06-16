/** Parse opentalking-style frame.md front matter into shots and presets. */

export interface FrameShot {
  id: string;
  name: string;
  shotType: string;
  duration: number;
  description?: string;
  variables?: string[];
  defaultData?: Record<string, unknown>;
  hyperframesTemplate?: string;
}

export interface SubtitlePreset {
  id: string;
  name: string;
  position?: string;
  fontSize?: number;
  color?: string;
  backgroundColor?: string;
  padding?: string;
  borderRadius?: number;
  fontFamily?: string;
}

export interface TextStylePreset {
  id: string;
  name: string;
  role?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  color?: string;
  backgroundColor?: string;
  lineHeight?: number;
  textAlign?: string;
}

export interface ParsedFrameMd {
  frames: FrameShot[];
  presets: {
    colorPalette: Array<{ id: string; name: string; value: string }>;
    textStyles: TextStylePreset[];
    subtitleStyles: SubtitlePreset[];
    layoutPresets: Array<{ id: string; name: string; type: string }>;
  };
  raw: string;
}

function parseFrontMatter(raw: string): string {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return match ? match[1] : raw;
}

function parseFrameEntries(block: string): FrameShot[] {
  const frames: FrameShot[] = [];
  const chunks = block.split(/\n\s{2}-\s+id:/).slice(1);
  for (const chunk of chunks) {
    const id = chunk.split('\n')[0].trim();
    const name = chunk.match(/name:\s*(.+)/)?.[1]?.trim() || id;
    const shotType = chunk.match(/shotType:\s*(\S+)/)?.[1]?.trim() || 'avatar_talking';
    const duration = Number(chunk.match(/duration:\s*(\d+)/)?.[1] || 5);
    const description = chunk.match(/description:\s*(.+)/)?.[1]?.trim();
    const hyperframesTemplate = chunk.match(/hyperframesTemplate:\s*(\S+)/)?.[1]?.trim();
    const vars = [...chunk.matchAll(/-\s+(\w+)/g)]
      .map((m) => m[1])
      .filter((v) => !['id', 'name', 'shotType', 'duration', 'description', 'variables', 'defaultData', 'hyperframesTemplate'].includes(v)
        && chunk.indexOf('variables:') >= 0);
    frames.push({
      id,
      name,
      shotType,
      duration,
      description,
      variables: vars.length ? vars : undefined,
      hyperframesTemplate,
    });
  }
  return frames;
}

function parseSubtitleStyles(block: string): SubtitlePreset[] {
  const styles: SubtitlePreset[] = [];
  const chunks = block.split(/\n\s{4}-\s+id:/).slice(1);
  for (const chunk of chunks) {
    const id = chunk.split('\n')[0].trim();
    styles.push({
      id,
      name: chunk.match(/name:\s*(.+)/)?.[1]?.trim() || id,
      position: chunk.match(/position:\s*(\S+)/)?.[1]?.trim(),
      fontSize: Number(chunk.match(/fontSize:\s*(\d+)/)?.[1] || 32),
      color: chunk.match(/color:\s*"(#[^"]+)"/)?.[1],
      backgroundColor: chunk.match(/backgroundColor:\s*"?([^"\n]+)"?/)?.[1]?.trim(),
      padding: chunk.match(/padding:\s*"(.+?)"/)?.[1],
      borderRadius: Number(chunk.match(/borderRadius:\s*(\d+)/)?.[1] || 8),
    });
  }
  return styles;
}

function parseTextStyles(block: string): TextStylePreset[] {
  const styles: TextStylePreset[] = [];
  const chunks = block.split(/\n\s{4}-\s+id:/).slice(1);
  for (const chunk of chunks) {
    const id = chunk.split('\n')[0].trim();
    styles.push({
      id,
      name: chunk.match(/name:\s*(.+)/)?.[1]?.trim() || id,
      role: chunk.match(/role:\s*(\S+)/)?.[1]?.trim(),
      fontFamily: chunk.match(/fontFamily:\s*"?([^"\n]+)"?/)?.[1]?.trim(),
      fontSize: Number(chunk.match(/fontSize:\s*(\d+)/)?.[1] || 32),
      fontWeight: Number(chunk.match(/fontWeight:\s*(\d+)/)?.[1] || 500),
      color: chunk.match(/color:\s*"(#[^"]+)"/)?.[1],
      backgroundColor: chunk.match(/backgroundColor:\s*"?([^"\n]+)"?/)?.[1]?.trim(),
      lineHeight: Number(chunk.match(/lineHeight:\s*([\d.]+)/)?.[1] || 1.4),
      textAlign: chunk.match(/textAlign:\s*(\S+)/)?.[1]?.trim(),
    });
  }
  return styles;
}

function parseColorPalette(block: string) {
  const palette: Array<{ id: string; name: string; value: string }> = [];
  const chunks = block.split(/\n\s{4}-\s+id:/).slice(1);
  for (const chunk of chunks) {
    const id = chunk.split('\n')[0].trim();
    palette.push({
      id,
      name: chunk.match(/name:\s*(.+)/)?.[1]?.trim() || id,
      value: chunk.match(/value:\s*"(#[^"]+)"/)?.[1] || '#000000',
    });
  }
  return palette;
}

export function parseFrameMd(raw: string): ParsedFrameMd | null {
  if (!raw.trim()) return null;
  const fm = parseFrontMatter(raw);

  const framesBlock = fm.match(/frames:\s*\n([\s\S]*?)(?=\npresets:|\n\w|$)/)?.[1] || '';
  const presetsBlock = fm.match(/presets:\s*\n([\s\S]*?)$/)?.[1] || '';

  const colorBlock = presetsBlock.match(/colorPalette:\s*\n([\s\S]*?)(?=\n\s{2}\w|$)/)?.[1] || '';
  const textBlock = presetsBlock.match(/textStyles:\s*\n([\s\S]*?)(?=\n\s{2}\w|$)/)?.[1] || '';
  const subBlock = presetsBlock.match(/subtitleStyles:\s*\n([\s\S]*?)(?=\n\s{2}\w|$)/)?.[1] || '';
  const layoutBlock = presetsBlock.match(/layoutPresets:\s*\n([\s\S]*?)(?=\n\s{2}\w|$)/)?.[1] || '';

  const layoutPresets: Array<{ id: string; name: string; type: string }> = [];
  const layoutChunks = layoutBlock.split(/\n\s{4}-\s+id:/).slice(1);
  for (const chunk of layoutChunks) {
    const id = chunk.split('\n')[0].trim();
    layoutPresets.push({
      id,
      name: chunk.match(/name:\s*(.+)/)?.[1]?.trim() || id,
      type: chunk.match(/type:\s*(\S+)/)?.[1]?.trim() || 'custom',
    });
  }

  return {
    frames: parseFrameEntries(framesBlock),
    presets: {
      colorPalette: parseColorPalette(colorBlock),
      textStyles: parseTextStyles(textBlock),
      subtitleStyles: parseSubtitleStyles(subBlock),
      layoutPresets,
    },
    raw,
  };
}

/** Map frame subtitle preset id to editor subtitle style_id where possible. */
export function subtitlePresetToStyleId(presetId: string): string {
  const map: Record<string, string> = {
    sub_yellow: 'bold-yellow',
    sub_bottom: 'default',
    sub_card: 'subtitle-card',
    sub_elegant: 'brand-elegant',
    sub_blue: 'brand-blue',
  };
  return map[presetId] || 'default';
}