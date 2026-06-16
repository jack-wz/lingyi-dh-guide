export interface SubtitleStyle {
  id: string;
  name: string;
  description: string;
  preview: {
    text: string;
    color: string;
    bg: string;
    outline?: string;
    fontSize: number;
    fontWeight: number;
    borderRadius?: number;
  };
}

export const SUBTITLE_STYLES: SubtitleStyle[] = [
  {
    id: 'default',
    name: '白字黑边',
    description: '经典字幕样式，白色文字黑色描边，百搭',
    preview: { text: '欢迎选购我们的产品', color: '#ffffff', bg: 'transparent', outline: 'rgba(0,0,0,0.8)', fontSize: 14, fontWeight: 600 },
  },
  {
    id: 'bottom-center',
    name: '底部半透底',
    description: '底部半透明黑色底栏，阅读舒适',
    preview: { text: '限时优惠 立即抢购', color: '#ffffff', bg: 'rgba(0,0,0,0.55)', fontSize: 13, fontWeight: 500, borderRadius: 6 },
  },
  {
    id: 'yellow-highlight',
    name: '醒目黄字',
    description: '黄色文字+深色底，促销场景首选',
    preview: { text: '今日特价 仅需99元', color: '#FFD700', bg: 'rgba(0,0,0,0.8)', fontSize: 14, fontWeight: 700, borderRadius: 4 },
  },
  {
    id: 'bold-white-stroke',
    name: '描边大字',
    description: '白色大号文字+粗描边，强视觉冲击',
    preview: { text: '爆款推荐', color: '#ffffff', bg: 'transparent', outline: 'rgba(0,0,0,1)', fontSize: 18, fontWeight: 800 },
  },
  {
    id: 'subtitle-card',
    name: '卡片式',
    description: '圆角卡片包裹，现代感强',
    preview: { text: '新品首发 限量发售', color: '#ffffff', bg: 'rgba(0,0,0,0.6)', fontSize: 13, fontWeight: 500, borderRadius: 12 },
  },
  {
    id: 'brand-blue',
    name: '品牌蓝',
    description: '蓝色调字幕，适合科技/企业场景',
    preview: { text: '智能科技 改变生活', color: '#E0F2FE', bg: 'rgba(37,99,235,0.7)', fontSize: 13, fontWeight: 500, borderRadius: 8 },
  },
  {
    id: 'gradient-glow',
    name: '渐变发光',
    description: '渐变文字+光晕效果，高端大气',
    preview: { text: '奢华品质 尊享体验', color: '#FDE68A', bg: 'transparent', outline: 'rgba(251,191,36,0.5)', fontSize: 14, fontWeight: 700 },
  },
  {
    id: 'minimal',
    name: '极简单行',
    description: '无背景无描边，纯文字极简风格',
    preview: { text: '自然之美', color: 'rgba(255,255,255,0.9)', bg: 'transparent', fontSize: 12, fontWeight: 400 },
  },
];
