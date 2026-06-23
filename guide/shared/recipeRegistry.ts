/* V5 #23 — AI production Recipe registry + gap detection + brief/proposal helpers.
 * Recipes are server-maintained contracts (inputs/outputs/cost/writeback) — we do NOT
 * expose 100+ models. AI results MUST write back to the asset library with asset ids. */

import type { DSL, Segment } from './types/editor.js';

export interface Recipe {
  id: string;
  label: string;
  inputs: string[];
  outputs: string[];
  cost_estimate: { credits: number; seconds: number };
  required_asset_writeback: boolean; // result MUST land in asset library w/ id + lineage
}

export const RECIPE_REGISTRY: Recipe[] = [
  { id: 'product_image_to_scene', label: '商品图→场景图', inputs: ['product_image', 'scene_brief'], outputs: ['scene_image'], cost_estimate: { credits: 2, seconds: 12 }, required_asset_writeback: true },
  { id: 'product_to_broll_prompt', label: '商品→B-roll 提示', inputs: ['product_image', 'brand_keywords'], outputs: ['broll_prompt'], cost_estimate: { credits: 1, seconds: 3 }, required_asset_writeback: false },
  { id: 'svg_to_lottie', label: 'SVG→Lottie 动效', inputs: ['svg', 'motion_plan', 'brand_color'], outputs: ['lottie', 'poster_frames'], cost_estimate: { credits: 1, seconds: 5 }, required_asset_writeback: true },
  { id: 'title_to_gsap_motion', label: '标题→GSAP 动效', inputs: ['title', 'motion_spec'], outputs: ['gsap_code', 'delivery_mode'], cost_estimate: { credits: 1, seconds: 4 }, required_asset_writeback: true },
  { id: 'script_compress_cn', label: '口播压缩', inputs: ['narration_text'], outputs: ['compressed_narration'], cost_estimate: { credits: 0, seconds: 1 }, required_asset_writeback: false },
  { id: 'shot_variant_regenerate', label: '镜头变体重生', inputs: ['segment', 'shot_intent'], outputs: ['variant', 'poster_url', 'webm_url'], cost_estimate: { credits: 2, seconds: 15 }, required_asset_writeback: true },
];

export function getRecipe(id: string): Recipe | undefined {
  return RECIPE_REGISTRY.find((r) => r.id === id);
}

export interface AssetGap {
  recipe: string;
  fill: string;
  count: number;
}

/* Gap detection — scans DSL segments BEFORE generation and returns user-language fill list.
 * e.g. "将 AI 补 3 张场景图、1 个 CTA 动效、压缩 2 段口播". */
export function detectAssetGaps(dsl: DSL): { gaps: AssetGap[]; oneLine: string } {
  let sceneGap = 0, dhGap = 0, motionGap = 0, narrationGap = 0, voiceGap = 0, subtitleGap = 0;
  for (const seg of dsl.segments as Segment[]) {
    if (!seg.scene_image_url) sceneGap++;
    if (seg.digital_human?.enabled && !seg.avatar_id) dhGap++;
    const hasMotionObj = (seg.objects || []).some((o) => o.metadata?.source === 'motion');
    const hasCtaObj = (seg.objects || []).some((o) => o.interaction?.kind === 'cta_button');
    if (hasCtaObj && !hasMotionObj) motionGap++;
    if (seg.narration_text && seg.narration_text.length > 60) narrationGap++;
    if (!seg.voice_id) voiceGap++;
    if (!seg.subtitle?.style_id) subtitleGap++;
  }
  const gaps: AssetGap[] = [];
  if (sceneGap) gaps.push({ recipe: 'product_image_to_scene', fill: '场景图', count: sceneGap });
  if (dhGap) gaps.push({ recipe: 'shot_variant_regenerate', fill: '数字人', count: dhGap });
  if (motionGap) gaps.push({ recipe: 'title_to_gsap_motion', fill: 'CTA 动效', count: motionGap });
  if (voiceGap) gaps.push({ recipe: 'product_to_broll_prompt', fill: '口播配音', count: voiceGap });
  if (narrationGap) gaps.push({ recipe: 'script_compress_cn', fill: '口播压缩', count: narrationGap });
  if (subtitleGap) gaps.push({ recipe: 'svg_to_lottie', fill: '字幕样式', count: subtitleGap });

  const oneLine = gaps.length
    ? `将 AI 补 ${gaps.map((g) => `${g.count} ${g.fill}`).join('、')}`
    : '暂无缺槽，可直接生成';
  return { gaps, oneLine };
}

export interface ProductBrief {
  topic: string;
  category: string;
  sellingPoints: string[];
  emotion: string;
  shotCount: number;
  estDurationSec: number;
  missingAssets: string[];
  recommendedPacks: string[];
}

/* Product Brief / Proposal — "先提案再生成". Deterministic scaffold (the LLM enrich later):
 * from input (topic/script/brand) derive a structured brief the user adopts before DSL/Shot. */
export function buildProductBrief(input: {
  topic?: string;
  script?: string;
  brandCategory?: string;
  brand_category?: string;
  segmentCount?: number;
  segment_count?: number;
}): ProductBrief {
  const topic = (input.topic || input.script || '').trim();
  const segCount = input.segmentCount ?? input.segment_count;
  const segN = Math.max(4, Math.min(12, (Number.isFinite(Number(segCount)) ? Number(segCount) : (topic ? Math.ceil(topic.length / 30) : 4))));
  const estDurationSec = segN * 5;

  const detects: string[] = [];
  if (topic) {
    if (/价格|优惠|折扣|秒杀|券/.test(topic)) detects.push('促销');
    if (/参数|评测|对比|功能/.test(topic)) detects.push('参数');
    if (/门店|服务|发货|售后/.test(topic)) detects.push('服务');
  }
  const brandCategory = input.brandCategory || input.brand_category;
  const category = brandCategory || (detects.includes('参数') ? '科技/家电' : detects.includes('服务') ? '服务' : '综合');

  const sellingPoints = detects.length ? detects : ['卖点1', '卖点2', '卖点3'];
  const emotion = detects.includes('促销') ? '促销紧迫感' : '信任+种草';
  const missingAssets = ['商品主图×1', '场景图×' + Math.max(1, Math.ceil(segN / 2)), '口播脚本×1', 'CTA 动效×1'];
  const recommendedPacks = ['shot_opening_hook', 'shot_product_showcase', 'shot_selling_point', 'shot_cta', 'subt_promo_highlight', 'mfx_price_burst'];

  return { topic, category, sellingPoints, emotion, shotCount: segN, estDurationSec, missingAssets, recommendedPacks };
}

/* Writeback rule — AI generators MUST return asset ids, never temp URLs. Caller enforces. */
export function assertWritebackCompliant(result: { asset_id?: string; file_url?: string }, recipeId: string): { ok: boolean; reason?: string } {
  const recipe = getRecipe(recipeId);
  if (!recipe) return { ok: false, reason: `unknown recipe ${recipeId}` };
  if (!recipe.required_asset_writeback) return { ok: true };
  if (!result.asset_id) return { ok: false, reason: `recipe ${recipeId} requires asset_id writeback; got temp url ${result.file_url || '<none>'}` };
  return { ok: true };
}