export interface SceneImage {
  id: string;
  name: string;
  category: string;
  url: string;
  description: string;
  tags: string[];
}

export const SCENE_CATEGORIES = [
  { id: 'ecommerce', label: '电商', icon: 'ShoppingBag' },
  { id: 'store', label: '门店', icon: 'Store' },
  { id: 'brand', label: '品牌', icon: 'Star' },
  { id: 'lifestyle', label: '生活', icon: 'Heart' },
  { id: 'tech', label: '科技', icon: 'Cpu' },
  { id: 'food', label: '美食', icon: 'Utensils' },
];

export const SCENE_IMAGES: SceneImage[] = [
  { id: 's1', name: '简约白背景', category: 'ecommerce', url: '', description: '纯白产品展示背景，适合电商主图', tags: ['白色', '简约', '产品'] },
  { id: 's2', name: '暖色直播间', category: 'ecommerce', url: '', description: '暖色灯光直播间场景，适合带货', tags: ['直播', '暖色', '带货'] },
  { id: 's3', name: '时尚街头', category: 'lifestyle', url: '', description: '城市街头背景，适合潮牌/运动品', tags: ['街头', '时尚', '城市'] },
  { id: 's4', name: '家居客厅', category: 'lifestyle', url: '', description: '温馨家居场景，适合家电/家具', tags: ['家居', '温馨', '客厅'] },
  { id: 's5', name: '办公室', category: 'brand', url: '', description: '现代办公环境，适合企业宣传', tags: ['办公', '商务', '企业'] },
  { id: 's6', name: '户外自然', category: 'lifestyle', url: '', description: '自然风光背景，适合运动/户外品牌', tags: ['户外', '自然', '运动'] },
  { id: 's7', name: '科技感背景', category: 'tech', url: '', description: '深色科技风格，适合数码产品', tags: ['科技', '深色', '数码'] },
  { id: 's8', name: '美食厨房', category: 'food', url: '', description: '厨房场景，适合食品/厨具', tags: ['厨房', '美食', '烹饪'] },
  { id: 's9', name: '门店外观', category: 'store', url: '', description: '线下门店外观，适合活动宣传', tags: ['门店', '外观', '活动'] },
  { id: 's10', name: '门店内景', category: 'store', url: '', description: '门店内部货架陈列', tags: ['门店', '内景', '货架'] },
  { id: 's11', name: '节日氛围', category: 'ecommerce', url: '', description: '节日促销背景（红金配色）', tags: ['节日', '促销', '喜庆'] },
  { id: 's12', name: '渐变抽象', category: 'brand', url: '', description: '彩色渐变抽象背景，适合品牌宣传', tags: ['渐变', '抽象', '品牌'] },
];
