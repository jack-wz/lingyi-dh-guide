export type { SubtitleStylePreview } from '@shared/subtitleStyles';
export { SUBTITLE_STYLES } from '@shared/subtitleStyles';

export type SubtitleStyle = (typeof import('@shared/subtitleStyles').SUBTITLE_STYLES)[number];