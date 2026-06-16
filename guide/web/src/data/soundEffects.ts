export interface SoundEffect {
  id: string;
  name: string;
  category: string;
  duration: string;
  description: string;
  url: string;
}

export const SOUND_CATEGORIES = [
  { id: 'bgm', label: '背景音乐' },
  { id: 'transition', label: '转场音效' },
  { id: 'emphasis', label: '强调音效' },
  { id: 'ambient', label: '环境音' },
];

export const SOUND_EFFECTS: SoundEffect[] = [
  { id: 'bgm1', name: '轻松商务', category: 'bgm', duration: '60s', description: '轻快的企业宣传背景音乐', url: '' },
  { id: 'bgm2', name: '时尚电子', category: 'bgm', duration: '45s', description: '电子节拍，适合潮牌/科技', url: '' },
  { id: 'bgm3', name: '温馨钢琴', category: 'bgm', duration: '90s', description: '钢琴旋律，适合生活/家居', url: '' },
  { id: 'bgm4', name: '活力节拍', category: 'bgm', duration: '30s', description: '快节奏，适合促销/运动', url: '' },
  { id: 'bgm5', name: '中国风', category: 'bgm', duration: '60s', description: '中式乐器，适合国潮/茶饮', url: '' },
  { id: 'bgm6', name: '科技感', category: 'bgm', duration: '40s', description: '合成器音色，适合数码/AI', url: '' },
  { id: 'sfx1', name: 'Whoosh', category: 'transition', duration: '0.5s', description: '快速划过音效，配合转场', url: '' },
  { id: 'sfx2', name: 'Pop', category: 'emphasis', duration: '0.3s', description: '弹出音效，配合元素出现', url: '' },
  { id: 'sfx3', name: 'Chime', category: 'emphasis', duration: '1s', description: '清脆铃声，适合价格/优惠', url: '' },
  { id: 'sfx4', name: 'Click', category: 'emphasis', duration: '0.2s', description: '点击音效，适合按钮/切换', url: '' },
];
