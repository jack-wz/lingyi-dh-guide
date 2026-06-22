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

export interface LayoutElement {
  type: 'image' | 'text' | 'avatar' | 'logo' | 'shape';
  anchor?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  styleId?: string;
}

export interface LayoutPreset {
  id: string;
  name: string;
  type: string;
  elements: LayoutElement[];
}

export interface AnimationPreset {
  id: string;
  name: string;
  type: string;
  animation: string;
  duration: number;
  easing: string;
}

export interface ShapePreset {
  id: string;
  name: string;
  shape: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  borderRadius?: number;
}

export interface ElementLibraryItem {
  id: string;
  name: string;
  type: string;
  category?: string;
  previewUrl?: string;
  defaultContent?: string;
  defaultStyle?: Record<string, unknown>;
}

export interface ParsedFrameMd {
  frames: FrameShot[];
  presets: {
    colorPalette: Array<{ id: string; name: string; value: string }>;
    textStyles: TextStylePreset[];
    subtitleStyles: SubtitlePreset[];
    layoutPresets: LayoutPreset[];
    animationPresets: AnimationPreset[];
    shapePresets: ShapePreset[];
    elementLibrary: ElementLibraryItem[];
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

function parseLayoutElements(chunk: string): LayoutElement[] {
  const elements: LayoutElement[] = [];
  const elemBlock = chunk.match(/elements:\s*\n([\s\S]*?)(?=\n\s{4}\w|$)/)?.[1] || '';
  const elemChunks = elemBlock.split(/\n\s{6}-\s+type:/).slice(1);
  for (const ec of elemChunks) {
    const type = ec.split('\n')[0].trim() as LayoutElement['type'];
    elements.push({
      type,
      anchor: ec.match(/anchor:\s*(\S+)/)?.[1]?.trim(),
      x: Number(ec.match(/x:\s*([\d.]+)/)?.[1] ?? 50),
      y: Number(ec.match(/y:\s*([\d.]+)/)?.[1] ?? 50),
      width: ec.match(/width:\s*([\d.]+)/) ? Number(ec.match(/width:\s*([\d.]+)/)?.[1]) : undefined,
      height: ec.match(/height:\s*([\d.]+)/) ? Number(ec.match(/height:\s*([\d.]+)/)?.[1]) : undefined,
      styleId: ec.match(/styleId:\s*(\S+)/)?.[1]?.trim(),
    });
  }
  return elements;
}

function parseLayoutPresets(block: string): LayoutPreset[] {
  const presets: LayoutPreset[] = [];
  const chunks = block.split(/\n\s{4}-\s+id:/).slice(1);
  for (const chunk of chunks) {
    const id = chunk.split('\n')[0].trim();
    presets.push({
      id,
      name: chunk.match(/name:\s*(.+)/)?.[1]?.trim() || id,
      type: chunk.match(/type:\s*(\S+)/)?.[1]?.trim() || 'custom',
      elements: parseLayoutElements(chunk),
    });
  }
  return presets;
}

function parseAnimationPresets(block: string): AnimationPreset[] {
  const presets: AnimationPreset[] = [];
  const chunks = block.split(/\n\s{4}-\s+id:/).slice(1);
  for (const chunk of chunks) {
    const id = chunk.split('\n')[0].trim();
    presets.push({
      id,
      name: chunk.match(/name:\s*(.+)/)?.[1]?.trim() || id,
      type: chunk.match(/type:\s*(\S+)/)?.[1]?.trim() || 'enter',
      animation: chunk.match(/animation:\s*(\S+)/)?.[1]?.trim() || 'fadeIn',
      duration: Number(chunk.match(/duration:\s*([\d.]+)/)?.[1] || 0.5),
      easing: chunk.match(/easing:\s*(.+)/)?.[1]?.trim() || 'ease-out',
    });
  }
  return presets;
}

function parseShapePresets(block: string): ShapePreset[] {
  const presets: ShapePreset[] = [];
  const chunks = block.split(/\n\s{4}-\s+id:/).slice(1);
  for (const chunk of chunks) {
    const id = chunk.split('\n')[0].trim();
    presets.push({
      id,
      name: chunk.match(/name:\s*(.+)/)?.[1]?.trim() || id,
      shape: chunk.match(/shape:\s*(\S+)/)?.[1]?.trim() || 'rect',
      fill: chunk.match(/fill:\s*"?(#[^"\n]+)"?/)?.[1],
      stroke: chunk.match(/stroke:\s*"?(#[^"\n]+)"?/)?.[1],
      strokeWidth: chunk.match(/strokeWidth:\s*(\d+)/) ? Number(chunk.match(/strokeWidth:\s*(\d+)/)?.[1]) : undefined,
      borderRadius: chunk.match(/borderRadius:\s*(\d+)/) ? Number(chunk.match(/borderRadius:\s*(\d+)/)?.[1]) : undefined,
    });
  }
  return presets;
}

function parseElementLibrary(block: string): ElementLibraryItem[] {
  const items: ElementLibraryItem[] = [];
  const chunks = block.split(/\n\s{4}-\s+id:/).slice(1);
  for (const chunk of chunks) {
    const id = chunk.split('\n')[0].trim();
    const defaultStyleBlock = chunk.match(/defaultStyle:\s*\n([\s\S]*?)(?=\n\s{4}\w|$)/)?.[1] || '';
    const defaultStyle: Record<string, unknown> = {};
    for (const m of defaultStyleBlock.matchAll(/^\s{6}(\w[\w.]*):\s*(.+)$/gm)) {
      const v = m[2].trim();
      defaultStyle[m[1]] = /^"/.test(v) ? v.replace(/^"|"$/g, '') : (!Number.isNaN(Number(v)) ? Number(v) : v);
    }
    items.push({
      id,
      name: chunk.match(/name:\s*(.+)/)?.[1]?.trim() || id,
      type: chunk.match(/type:\s*(\S+)/)?.[1]?.trim() || 'sticker',
      category: chunk.match(/category:\s*(\S+)/)?.[1]?.trim(),
      previewUrl: chunk.match(/previewUrl:\s*(\S+)/)?.[1]?.trim(),
      defaultContent: chunk.match(/defaultContent:\s*"(.+?)"/)?.[1],
      defaultStyle,
    });
  }
  return items;
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
  const animBlock = presetsBlock.match(/animationPresets:\s*\n([\s\S]*?)(?=\n\s{2}\w|$)/)?.[1] || '';
  const shapeBlock = presetsBlock.match(/shapePresets:\s*\n([\s\S]*?)(?=\n\s{2}\w|$)/)?.[1] || '';
  const elementBlock = presetsBlock.match(/elementLibrary:\s*\n([\s\S]*?)(?=\n\s{2}\w|$)/)?.[1] || '';

  return {
    frames: parseFrameEntries(framesBlock),
    presets: {
      colorPalette: parseColorPalette(colorBlock),
      textStyles: parseTextStyles(textBlock),
      subtitleStyles: parseSubtitleStyles(subBlock),
      layoutPresets: parseLayoutPresets(layoutBlock),
      animationPresets: parseAnimationPresets(animBlock),
      shapePresets: parseShapePresets(shapeBlock),
      elementLibrary: parseElementLibrary(elementBlock),
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