export interface AnimationPreset {
  id: string;
  name: string;
  category: string;
  description: string;
  previewCSS: string;
  duration: string;
}

export const ANIM_CATEGORIES = [
  { id: 'transition', label: '转场' },
  { id: 'text', label: '文字' },
  { id: 'element', label: '元素' },
];

export const ANIMATION_PRESETS: AnimationPreset[] = [
  { id: 'fade', name: '淡入淡出', category: 'transition', description: '经典过渡，适用所有场景', previewCSS: 'opacity', duration: '0.5s' },
  { id: 'wipeleft', name: '左擦除', category: 'transition', description: '从右向左擦除切换', previewCSS: 'translateX', duration: '0.5s' },
  { id: 'wiperight', name: '右擦除', category: 'transition', description: '从左向右擦除切换', previewCSS: 'translateX', duration: '0.5s' },
  { id: 'slideup', name: '上滑', category: 'transition', description: '从下向上滑入', previewCSS: 'translateY', duration: '0.5s' },
  { id: 'zoomin', name: '缩放进入', category: 'transition', description: '从小到大缩放出现', previewCSS: 'scale', duration: '0.5s' },
  { id: 'circlecrop', name: '圆形裁剪', category: 'transition', description: '圆形区域展开切换', previewCSS: 'clipPath', duration: '0.8s' },
  { id: 'fadeIn', name: '淡入', category: 'text', description: '文字从透明渐显', previewCSS: 'opacity', duration: '0.5s' },
  { id: 'typewriter', name: '打字机', category: 'text', description: '逐字显示，节奏感强', previewCSS: 'width', duration: '2s' },
  { id: 'slideUp', name: '上滑入', category: 'text', description: '文字从下方滑入', previewCSS: 'translateY', duration: '0.4s' },
  { id: 'scaleIn', name: '缩放出现', category: 'element', description: '元素从小变大出现', previewCSS: 'scale', duration: '0.3s' },
  { id: 'bounce', name: '弹跳', category: 'element', description: '弹跳出现，活泼感', previewCSS: 'translateY', duration: '0.6s' },
  { id: 'glow', name: '光晕脉冲', category: 'element', description: '光晕呼吸效果，吸引注意', previewCSS: 'boxShadow', duration: '1.5s' },
];
