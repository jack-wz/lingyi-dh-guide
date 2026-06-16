export interface SubBrandConfig {
  id: string;
  name: string;
  enabled: boolean;
  logoUrl?: string;
  logoLabel?: string;
  elementId?: string;
}

export interface BrandLogoSettings {
  enabled: boolean;
  logoUrl?: string;
  logoLabel: string;
  elementId?: string;
  activeSubBrandId?: string | null;
  subBrands: SubBrandConfig[];
}

export interface DesignSystem {
  name: string;
  description: string;
  colors: Record<string, string>;
  typography: Record<string, unknown>;
  rounded: Record<string, number | string>;
  spacing: Record<string, number | string>;
  /** Logo + 子品牌配置，序列化进 design.md */
  brandLogo?: BrandLogoSettings;
}

export interface FrameTemplate {
  id: string;
  name: string;
  shotType: string;
  duration: number;
  description?: string;
  variables?: string[];
  defaultData?: Record<string, unknown>;
  hyperframesTemplate?: string;
}

export interface ColorPreset {
  id: string;
  name: string;
  value: string;
}

export interface TextStylePreset {
  id: string;
  name: string;
  role?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  color?: string;
  lineHeight?: number | string;
  letterSpacing?: string;
  textAlign?: string;
  backgroundColor?: string;
  padding?: string;
  borderRadius?: number | string;
}

export interface AnimationPreset {
  id: string;
  name: string;
  type: string;
  animation: string;
  duration: number;
  easing: string;
}

export interface SubtitleStylePreset {
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

export interface LayoutPresetElement {
  type: string;
  anchor?: string;
  x?: number;
  y?: number;
  width?: number | string;
  height?: number | string;
  styleId?: string;
}

export interface LayoutPreset {
  id: string;
  name: string;
  type: string;
  elements?: LayoutPresetElement[];
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
  shape?: string;
}

export interface BrandPresets {
  colorPalette: ColorPreset[];
  textStyles: TextStylePreset[];
  animationPresets: AnimationPreset[];
  subtitleStyles: SubtitleStylePreset[];
  layoutPresets: LayoutPreset[];
  shapePresets: ShapePreset[];
  elementLibrary: ElementLibraryItem[];
}

export interface BrandAssetDoc {
  design: DesignSystem;
  frames: FrameTemplate[];
  presets: BrandPresets;
  design_markdown: string;
  frame_markdown: string;
}

export const EMPTY_PRESETS: BrandPresets = {
  colorPalette: [],
  textStyles: [],
  animationPresets: [],
  subtitleStyles: [],
  layoutPresets: [],
  shapePresets: [],
  elementLibrary: [],
};