export type EditorMode = 'visual' | 'markdown';

export type VisualSection =
  | 'basic'
  | 'colors'
  | 'tokens'
  | 'fonts'
  | 'frames'
  | 'palette'
  | 'textStyles'
  | 'subtitleStyles'
  | 'animations'
  | 'layouts'
  | 'shapes'
  | 'elements';

export const SECTIONS: Array<{ id: VisualSection; label: string; group: string }> = [
  { id: 'basic', label: '基本信息', group: '通用' },
  { id: 'colors', label: '颜色', group: '设计系统' },
  { id: 'tokens', label: '圆角与间距', group: '设计系统' },
  { id: 'fonts', label: '字体', group: '设计系统' },
  { id: 'frames', label: '镜头模板', group: 'Frame' },
  { id: 'palette', label: '色板', group: '预设' },
  { id: 'textStyles', label: '文本样式', group: '预设' },
  { id: 'subtitleStyles', label: '字幕样式', group: '预设' },
  { id: 'animations', label: '动画', group: '预设' },
  { id: 'layouts', label: '版式', group: '预设' },
  { id: 'shapes', label: '形状', group: '预设' },
  { id: 'elements', label: '元素库', group: '预设' },
];