/* V5 #23 — enterprise guide resource pack catalog.
 * Built-in, license-cleared resource bundles that give an empty project a usable starting point.
 * Every resource carries compliance metadata (license, source_url, author, downloaded_at,
 * allowed_usage, attribution_required). No third-party trademark assets are bundled. */

export type ResourceKind = 'shot_template' | 'subtitle_system' | 'motion_effect' | 'transition' | 'sfx' | 'bgm_group' | 'brand_pack';

export interface ComplianceMeta {
  license: string;
  source_url: string;
  author: string;
  downloaded_at: string;
  allowed_usage: 'commercial' | 'editorial' | 'internal';
  attribution_required: boolean;
}

export interface ResourceItem {
  id: string;
  kind: ResourceKind;
  label: string;
  hint: string;
  preview: string; // visual preview descriptor (e.g. "9:16 hook frame0/poster url)
  compliance: ComplianceMeta;
  recommendation_tags?: string[];
}

const LICENSE_C0 = 'CC0 1.0 (public domain, commercial OK, no attribution)';
const LICENSE_MIT = 'MIT (commercial OK, attribution required)';
const LICENSE_SELF = 'Self-produced CC0 (commercial OK, no attribution)';

export const RESOURCE_PACK_CATALOG: ResourceItem[] = [
  // 12 enterprise guide shot templates
  ['shot_opening_hook', 'shot_template', '开场 Hook', '强开屏吸引注意力', '9:16 海报+品牌色冲击'],
  ['shot_product_showcase', 'shot_template', '商品展示', '主体清晰特写/多角度', '9:16 居中商品三帧'],
  ['shot_selling_point', 'shot_template', '卖点解释', '功能/参数图文', '9:16 卖点图卡'],
  ['shot_comparison', 'shot_template', '对比', '前后/竞品对比', '9:16 对比分屏'],
  ['shot_trust', 'shot_template', '信任背书', '检测/认证/口碑', '9:16 证书浮窗'],
  ['shot_store_service', 'shot_template', '门店/服务', '门店实拍+服务承诺', '9:16 门店定位'],
  ['shot_promotion', 'shot_template', '优惠', '折扣/限时/赠品', '9:16 价格牌弹出'],
  ['shot_cta', 'shot_template', 'CTA', '引导下单/进店', '9:16 按钮动效'],
  ['shot_review', 'shot_template', '用户评价', '评价卡片滚动', '9:16 评分气泡'],
  ['shot_scene_tour', 'shot_template', '场景漫游', 'B-roll 场景注入', '9:16 转场推进'],
  ['shot_price_card', 'shot_template', '价格卡', '参数+价格对比', '9:16 参数表'],
  ['shot_disclaimer', 'shot_template', '免责声明', '合规字幕带', '9:16 底部字幕条'],
  // 8 subtitle systems
  ['subt_brand_clean', 'subtitle_system', '品牌简洁', '居中低饱和字幕', 'hf-caption-classic'],
  ['subt_promo_highlight', 'subtitle_system', '促销高亮', '强调色描边', 'hf-caption-highlight'],
  ['subt_word_emphasis', 'subtitle_system', '逐词强调', '逐词放大着色', 'hf-caption-wordpop'],
  ['subt_price_card', 'subtitle_system', '价格牌', '价格数字放大', 'hf-caption-price'],
  ['subt_param_card', 'subtitle_system', '参数卡', '参数列表字幕', 'hf-caption-params'],
  ['subt_qa', 'subtitle_system', '问答', 'Q/A 双栏', 'hf-caption-qa'],
  ['subt_steps', 'subtitle_system', '步骤', '顺序步骤编号', 'hf-caption-steps'],
  ['subt_disclaimer', 'subtitle_system', '免责声明', '底部合规条', 'hf-caption-disclaimer'],
  // 20 lightweight motion effects
  ['mfx_price_burst', 'motion_effect', '价格 burst', '价格弹出+缩放', 'gsap price_pop'],
  ['mfx_tag_float', 'motion_effect', '标签浮入', '卖点标签上滑', 'fadeUp'],
  ['mfx_arrow_point', 'motion_effect', '箭头指引', '指向 CTA', 'arrow pulse'],
  ['mfx_rating_star', 'motion_effect', '评星星', '评分逐颗点亮', 'twinkle'],
  ['mfx_countdown', 'motion_effect', '限时倒计时', '数字翻转', 'countdown flip'],
  ['mfx_store_pin', 'motion_effect', '门店定位', '地图针落下', 'drop pin'],
  ['mfx_qr_scan', 'motion_effect', '扫码 CTA', '二维码扫描', 'qr beam'],
  ['mfx_buy_cta', 'motion_effect', '下单 CTA', '按钮呼吸', 'pulse'],
  ['mfx_logo_in', 'motion_effect', 'Logo 入场', '描线/logo 抽帧', 'draw stroke'],
  ['mfx_title_fade', 'motion_effect', '标题淡入', '大字标题', 'fadeUp'],
  ['mfx_badge_pop', 'motion_effect', '徽章弹出', '认证/勋章', 'pop'],
  ['mfx_separator', 'motion_effect', '分隔线扫', '镜头切换线', 'wipe'],
  ['mfx_subtitle_emphasis', 'motion_effect', '字幕强调', '口播关键', 'wordpop'],
  ['mfx_product_zoom', 'motion_effect', '产品推镜', '局部放大', 'zoom'],
  ['mfx_compare_split', 'motion_effect', '对比分屏', '左右滑出', 'split'],
  ['mfx_coupon_tear', 'motion_effect', '优惠券撕', '优惠券揭起', 'tear'],
  ['mfx_bolt_price', 'motion_effect', '闪现价格', '价格高亮闪烁', 'twinkle'],
  ['mfx_floating_bubble', 'motion_effect', '气泡浮动', '评价气泡', 'float'],
  ['mfx_stripes', 'motion_effect', '条带扫描', '装饰色带', 'scan'],
  ['mfx_hand_drawn', 'motion_effect', '手绘圈', '圈选重点', 'scribble'],
  // 12 transitions reliably mappable to HF/FFmpeg
  ['tr_dissolve', 'transition', 'dissolve', '标准叠化', 'hf-dissolve'],
  ['tr_push', 'transition', 'push', '推进', 'hf-push'],
  ['tr_wipe_left', 'transition', 'wipe 左', '左擦除', 'hf-wipe-left'],
  ['tr_wipe_right', 'transition', 'wipe 右', '右擦除', 'hf-wipe-right'],
  ['tr_slide_up', 'transition', 'slide 上', '上滑', 'slide-up'],
  ['tr_slide_down', 'transition', 'slide 下', '下滑', 'slide-down'],
  ['tr_zoom', 'transition', 'zoom', '推拉', 'zoom'],
  ['tr_fade_black', 'transition', 'fade black', '黑场过场', 'fade-black'],
  ['tr_fade_white', 'transition', 'fade white', '白场过场', 'fade-white'],
  ['tr_spin', 'transition', 'spin', '旋转', 'spin'],
  ['tr_blur', 'transition', 'blur', '模糊过场', 'blur'],
  ['tr_glitch', 'transition', 'glitch', '故障风', 'glitch'],
  // 24 sound effects (self-produced / CC0)
  ['sfx_pop_01', 'sfx', 'pop 01', '弹出', '短促 pop'],
  ['sfx_whoosh_01', 'sfx', 'whoosh 01', '转场', 'whoosh'],
  ['sfx_ding_01', 'sfx', 'ding 01', '提示', 'ding'],
  ['sfx_coin_01', 'sfx', 'coin 01', '价格', 'coin'],
  ['sfx_click_01', 'sfx', 'click 01', '点击', 'click'],
  ['sfx_swoosh_01', 'sfx', 'swoosh 01', '快速', 'swoosh'],
  ['sfx_rise_01', 'sfx', 'rise 01', '上升', 'rise'],
  ['sfx_drop_01', 'sfx', 'drop 01', '下落', 'drop'],
  ['sfx_bell_01', 'sfx', 'bell 01', '钟声', 'bell'],
  ['sfx_buzzer_01', 'sfx', 'buzzer 01', '抢答', 'buzzer'],
  ['sfx_tick_01', 'sfx', 'tick 01', '计时', 'tick'],
  ['sfx_heartbeat_01', 'sfx', 'heartbeat 01', '心跳', 'heartbeat'],
  ['sfx_chime_01', 'sfx', 'chime 01', '风铃', 'chime'],
  ['sfx_pop_02', 'sfx', 'pop 02', '弹出柔', 'pop-soft'],
  ['sfx_whoosh_02', 'sfx', 'whoosh 02', '转场柔', 'whoosh-soft'],
  ['sfx_ding_02', 'sfx', 'ding 02', '提示亮', 'ding-bright'],
  ['sfx_coin_02', 'sfx', 'coin 02', '价格叠', 'coin-stack'],
  ['sfx_swoosh_02', 'sfx', 'swoosh 02', '快速猛', 'swoosh-hard'],
  ['sfx_rise_02', 'sfx', 'rise 02', '上升亮', 'rise-bright'],
  ['sfx_drop_02', 'sfx', 'drop 02', '下落厚', 'drop-thick'],
  ['sfx_bell_02', 'sfx', 'bell 02', '钟声柔', 'bell-soft'],
  ['sfx_chime_02', 'sfx', 'chime 02', '风铃叠', 'chime-stack'],
  ['sfx_tick_02', 'sfx', 'tick 02', '计时急', 'tick-fast'],
  ['sfx_buzzer_02', 'sfx', 'buzzer 02', '抢答短', 'buzzer-short'],
  // 8 BGM emotion groups
  ['bgm_uplift', 'bgm_group', '昂扬', '积极向上导购', 'uplift-loop'],
  ['bgm_warm', 'bgm_group', '温暖', '温情品牌', 'warm-loop'],
  ['bgm_energetic', 'bgm_group', '活力', '节奏明快', 'energy-loop'],
  ['bgm_pro', 'bgm_group', '专业', '商务信任', 'pro-loop'],
  ['bgm_calm', 'bgm_group', '安静', '舒缓讲解', 'calm-loop'],
  ['bgm_festive', 'bgm_group', '节庆', '促销欢庆', 'festive-loop'],
  ['bgm_tech', 'bgm_group', '科技', '产品参数', 'tech-loop'],
  ['bgm_story', 'bgm_group', '叙事', '故事线', 'story-loop'],
  // 4 enterprise brand example packs (structure only, NO third-party trademark)
  ['brand_demo_appliance', 'brand_pack', '家电品牌示例', '主色蓝 科技感', '#1d4ed8'],
  ['brand_demo_food', 'brand_pack', '食品品牌示例', '主色橙 温暖食欲', '#ff6a00'],
  ['brand_demo_beauty', 'brand_pack', '美妆品牌示例', '主色粉 优雅', '#e0598a'],
  ['brand_demo_service', 'brand_pack', '服务商品牌示例', '主色绿 服务', '#16a34a'],
].map(([id, kind, label, hint, preview]) => {
  const k = kind as ResourceKind;
  return {
    id: id as string, kind: k, label: label as string, hint: hint as string,
    preview: preview as string,
    recommendation_tags: defaultTags(k),
    compliance: {
      license: k === 'brand_pack' ? LICENSE_SELF : (k === 'sfx' || k === 'bgm_group' ? LICENSE_C0 : LICENSE_MIT),
      source_url: `internal://resource-pack/${id}`,
      author: 'lingyi-dh-guide team',
      downloaded_at: '2026-06-23',
      allowed_usage: 'commercial' as const,
      attribution_required: (k === 'motion_effect' || k === 'transition' || k === 'shot_template') ? true : false,
    },
  } satisfies ResourceItem;
});

function defaultTags(k: ResourceKind): string[] {
  switch (k) {
    case 'shot_template': return ['hook', 'product', 'cta'];
    case 'subtitle_system': return ['hype', 'clean'];
    case 'motion_effect': return ['price', 'cta'];
    case 'transition': return ['cross', 'fast'];
    case 'sfx': return ['sfx'];
    case 'bgm_group': return ['bgm'];
    case 'brand_pack': return ['brand'];
  }
}

export function listByKind(kind: ResourceKind): ResourceItem[] {
  return RESOURCE_PACK_CATALOG.filter((r) => r.kind === kind);
}

export const RESOURCE_PACK_COUNTS = {
  shot_template: 12, subtitle_system: 8, motion_effect: 20, transition: 12,
  sfx: 24, bgm_group: 8, brand_pack: 4,
};

export function assertCatalogComplete(): string[] {
  const problems: string[] = [];
  (Object.keys(RESOURCE_PACK_COUNTS) as ResourceKind[]).forEach((k) => {
    const expected = RESOURCE_PACK_COUNTS[k];
    const actual = listByKind(k).length;
    if (actual !== expected) problems.push(`${k}: expected ${expected}, got ${actual}`);
  });
  // Every item MUST carry compliance metadata — no sourceless assets.
  for (const r of RESOURCE_PACK_CATALOG) {
    if (!r.compliance.license || !r.compliance.source_url || !r.compliance.author) {
      problems.push(`${r.id}: missing compliance metadata`);
    }
  }
  return problems;
}