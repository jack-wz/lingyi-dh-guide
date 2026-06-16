import {
  getSubtitlePreviewStyle as getSharedSubtitlePreviewStyle,
  normalizeSubtitleStyleId,
} from '@shared/subtitleStyles';

export type { SubtitleStylePreview } from '@shared/subtitleStyles';
export { normalizeSubtitleStyleId };

export interface SubtitlePreviewStyle {
  color: string;
  background: string;
  outline?: string;
  fontSize: number;
  fontWeight: number;
  borderRadius: number;
}

export function getSubtitlePreviewStyle(styleId: string): SubtitlePreviewStyle {
  const style = getSharedSubtitlePreviewStyle(styleId);
  return {
    color: style.color,
    background: style.bg === 'transparent' ? 'transparent' : style.bg,
    outline: style.outline,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    borderRadius: style.borderRadius,
  };
}