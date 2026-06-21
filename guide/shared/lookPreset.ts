import type { HfGlobalOverlayItem } from './hfGlobalOverlayRenderer.js';
import { DEFAULT_HF_GLOBAL_OVERLAYS } from './hfGlobalOverlayRenderer.js';
import { dslUsesHyperframesGlobalOverlays } from './hfGlobalOverlayRenderer.js';
import { dslUsesHyperframesTransitions, isHyperframesTransitionType } from './hfTransitionRenderer.js';
import type { DSL } from './types/editor.js';
import { dslUsesHyperframesSubtitles, isHyperframesSubtitleStyle } from './subtitleStyles.js';

export interface LookPresetPayload {
  seed_id?: string;
  subtitle_style_id?: string;
  transition_type?: string;
  transition_duration?: number;
  hf_overlays?: HfGlobalOverlayItem[];
  pipeline_required?: string;
  tags?: string[];
  preview_thumb_url?: string;
  registry_version?: string;
}

export interface ApplyLookPresetOptions {
  applySubtitleToAllSegments?: boolean;
  applyTransitionToAllSegments?: boolean;
  applyGlobalOverlays?: boolean;
  currentSegIndex?: number;
}

export const LOOK_PRESET_REGISTRY_VERSION = '2026.06.3';

export const LOOK_PRESET_SEEDS: Array<{
  seed_id: string;
  name: string;
  description: string;
  tags: string[];
  payload: LookPresetPayload;
}> = [
  {
    seed_id: 'look-steady-voice',
    name: '口播稳重',
    description: '高亮强调字幕 + 溶解转场，适合企业讲解与产品说明',
    tags: ['口播', '稳重', '企业'],
    payload: {
      seed_id: 'look-steady-voice',
      subtitle_style_id: 'hf-caption-highlight',
      transition_type: 'hf-dissolve',
      transition_duration: 0.6,
      hf_overlays: [{ type: 'hf-vignette', enabled: true, intensity: 0.55, vignette_size: 48 }],
      pipeline_required: 'template_editor',
      registry_version: LOOK_PRESET_REGISTRY_VERSION,
    },
  },
  {
    seed_id: 'look-promo-fast',
    name: '大促快节奏',
    description: '渐变扫光字幕 + 上推转场 + 漏光质感，适合活动促销',
    tags: ['大促', '快节奏', '竖屏'],
    payload: {
      seed_id: 'look-promo-fast',
      subtitle_style_id: 'hf-caption-gradient',
      transition_type: 'hf-push-up',
      transition_duration: 0.5,
      hf_overlays: [
        { type: 'hf-light-leak', enabled: true, leak_intensity: 0.5 },
        { type: 'hf-grain', enabled: true, opacity: 0.12 },
      ],
      pipeline_required: 'template_editor',
      registry_version: LOOK_PRESET_REGISTRY_VERSION,
    },
  },
  {
    seed_id: 'look-maternal-soft',
    name: '母婴柔和',
    description: '胶囊卡拉 OK + 淡溶解 + 轻颗粒，适合母婴导购信任感',
    tags: ['母婴', '柔和', '导购'],
    payload: {
      seed_id: 'look-maternal-soft',
      subtitle_style_id: 'hf-caption-pill',
      transition_type: 'hf-dissolve',
      transition_duration: 0.7,
      hf_overlays: [{ type: 'hf-grain', enabled: true, opacity: 0.1 }],
      pipeline_required: 'template_editor',
      registry_version: LOOK_PRESET_REGISTRY_VERSION,
    },
  },
  {
    seed_id: 'look-circle-beauty',
    name: '圆形美妆',
    description: '杂志强调字幕 + 圆形揭示转场 + 暗角漏光，适合美妆高端叙事',
    tags: ['美妆', '圆形', '高端'],
    payload: {
      seed_id: 'look-circle-beauty',
      subtitle_style_id: 'hf-caption-editorial',
      transition_type: 'hf-circle-reveal',
      transition_duration: 0.58,
      hf_overlays: [
        { type: 'hf-vignette', enabled: true, intensity: 0.62, vignette_size: 40 },
        { type: 'hf-light-leak', enabled: true, leak_intensity: 0.38 },
      ],
      pipeline_required: 'template_editor',
      registry_version: LOOK_PRESET_REGISTRY_VERSION,
    },
  },
  {
    seed_id: 'look-editorial-premium',
    name: '杂志高端',
    description: '杂志强调字幕 + 缩放转场 + 暗角，适合美妆高端叙事',
    tags: ['美妆', '高端', '杂志'],
    payload: {
      seed_id: 'look-editorial-premium',
      subtitle_style_id: 'hf-caption-editorial',
      transition_type: 'hf-zoom',
      transition_duration: 0.55,
      hf_overlays: [{ type: 'hf-vignette', enabled: true, intensity: 0.65, vignette_size: 42 }],
      pipeline_required: 'template_editor',
      registry_version: LOOK_PRESET_REGISTRY_VERSION,
    },
  },
  {
    seed_id: 'look-neon-night',
    name: '霓虹夜场',
    description: '霓虹发光字幕 + 右推转场 + 动态模糊脉冲，适合潮流单品',
    tags: ['潮流', '霓虹', '夜场'],
    payload: {
      seed_id: 'look-neon-night',
      subtitle_style_id: 'hf-caption-neon',
      transition_type: 'hf-push-right',
      transition_duration: 0.45,
      hf_overlays: [{ type: 'hf-motion-blur', enabled: true, blur_intensity: 0.3, direction: 'horizontal' }],
      pipeline_required: 'template_editor',
      registry_version: LOOK_PRESET_REGISTRY_VERSION,
    },
  },
  {
    seed_id: 'look-wipe-retail',
    name: '零售擦除',
    description: '高亮字幕 + 右擦除转场，适合货架切换与卖点递进',
    tags: ['零售', '导购', '擦除'],
    payload: {
      seed_id: 'look-wipe-retail',
      subtitle_style_id: 'hf-caption-highlight',
      transition_type: 'hf-wipe-right',
      transition_duration: 0.5,
      hf_overlays: [{ type: 'hf-grain', enabled: true, opacity: 0.1 }],
      pipeline_required: 'template_editor',
      registry_version: LOOK_PRESET_REGISTRY_VERSION,
    },
  },
  {
    seed_id: 'look-soft-lifestyle',
    name: '生活质感',
    description: '胶囊卡拉 OK + 溶解转场 + 暗角，适合生活方式与家居场景',
    tags: ['生活', '家居', '柔和'],
    payload: {
      seed_id: 'look-soft-lifestyle',
      subtitle_style_id: 'hf-caption-pill',
      transition_type: 'hf-dissolve',
      transition_duration: 0.65,
      hf_overlays: [
        { type: 'hf-vignette', enabled: true, intensity: 0.5, vignette_size: 46 },
        { type: 'hf-grain', enabled: true, opacity: 0.08 },
      ],
      pipeline_required: 'template_editor',
      registry_version: LOOK_PRESET_REGISTRY_VERSION,
    },
  },
  {
    seed_id: 'look-push-tech',
    name: '科技左推',
    description: '渐变字幕 + 左推转场 + 动感模糊，适合科技单品与功能讲解',
    tags: ['科技', '左推', '渐变'],
    payload: {
      seed_id: 'look-push-tech',
      subtitle_style_id: 'hf-caption-gradient',
      transition_type: 'hf-push-left',
      transition_duration: 0.48,
      hf_overlays: [{ type: 'hf-motion-blur', enabled: true, blur_intensity: 0.25, direction: 'horizontal' }],
      pipeline_required: 'template_editor',
      registry_version: LOOK_PRESET_REGISTRY_VERSION,
    },
  },
  {
    seed_id: 'look-wipe-brand',
    name: '品牌左擦',
    description: '高亮字幕 + 左擦除转场 + 暗角，适合品牌色主导的导购叙事',
    tags: ['品牌', '擦除', '导购'],
    payload: {
      seed_id: 'look-wipe-brand',
      subtitle_style_id: 'hf-caption-highlight',
      transition_type: 'hf-wipe-left',
      transition_duration: 0.52,
      hf_overlays: [{ type: 'hf-vignette', enabled: true, intensity: 0.58, vignette_size: 44 }],
      pipeline_required: 'template_editor',
      registry_version: LOOK_PRESET_REGISTRY_VERSION,
    },
  },
  {
    seed_id: 'look-stagger-guide',
    name: '错落导购',
    description: '错落滑入字幕 + 溶解转场 + 轻暗角，适合信任感导购口播',
    tags: ['导购', '错落', '口播'],
    payload: {
      seed_id: 'look-stagger-guide',
      subtitle_style_id: 'hf-caption-stagger',
      transition_type: 'hf-dissolve',
      transition_duration: 0.62,
      hf_overlays: [{ type: 'hf-vignette', enabled: true, intensity: 0.48, vignette_size: 45 }],
      pipeline_required: 'template_editor',
      registry_version: LOOK_PRESET_REGISTRY_VERSION,
    },
  },
  {
    seed_id: 'look-pop-energetic',
    name: '弹跳活力',
    description: '弹跳逐字字幕 + 上推转场 + 漏光颗粒，适合快节奏卖点口播',
    tags: ['活力', '弹跳', '大促'],
    payload: {
      seed_id: 'look-pop-energetic',
      subtitle_style_id: 'hf-caption-pop',
      transition_type: 'hf-push-up',
      transition_duration: 0.46,
      hf_overlays: [
        { type: 'hf-light-leak', enabled: true, leak_intensity: 0.42 },
        { type: 'hf-grain', enabled: true, opacity: 0.1 },
      ],
      pipeline_required: 'template_editor',
      registry_version: LOOK_PRESET_REGISTRY_VERSION,
    },
  },
  {
    seed_id: 'look-grade-cinema',
    name: '影院调色',
    description: '杂志强调字幕 + 溶解转场 + 暖色调色，适合高端叙事与品牌质感',
    tags: ['调色', '影院', '高端'],
    payload: {
      seed_id: 'look-grade-cinema',
      subtitle_style_id: 'hf-caption-editorial',
      transition_type: 'hf-dissolve',
      transition_duration: 0.6,
      hf_overlays: [
        { type: 'hf-color-grade', enabled: true, grade_warmth: 0.62, grade_strength: 0.3, grade_saturation: 1.1 },
        { type: 'hf-vignette', enabled: true, intensity: 0.52, vignette_size: 44 },
      ],
      pipeline_required: 'template_editor',
      registry_version: LOOK_PRESET_REGISTRY_VERSION,
    },
  },
];

export function findLookPresetSeed(seedId: string) {
  const target = String(seedId || '').trim();
  if (!target) return undefined;
  return LOOK_PRESET_SEEDS.find((seed) => seed.seed_id === target);
}

export function isLookPresetRegistryStale(registryVersion: string | undefined | null): boolean {
  const version = String(registryVersion || '').trim();
  return !version || version !== LOOK_PRESET_REGISTRY_VERSION;
}

export type LookPresetMigrationReason = 'registry_version' | 'seed_sync';

export function migrateLookPresetPayload(payload: LookPresetPayload): {
  payload: LookPresetPayload;
  migrated: boolean;
  reason?: LookPresetMigrationReason;
} {
  const seed = payload.seed_id ? findLookPresetSeed(payload.seed_id) : undefined;
  if (seed) {
    const stale = isLookPresetRegistryStale(payload.registry_version);
    const seedDrift = stale
      || payload.subtitle_style_id !== seed.payload.subtitle_style_id
      || payload.transition_type !== seed.payload.transition_type;
    if (seedDrift) {
      return {
        payload: {
          ...seed.payload,
          seed_id: seed.seed_id,
          tags: payload.tags ?? seed.tags,
          preview_thumb_url: payload.preview_thumb_url,
          registry_version: LOOK_PRESET_REGISTRY_VERSION,
        },
        migrated: true,
        reason: stale ? 'registry_version' : 'seed_sync',
      };
    }
  }

  if (isLookPresetRegistryStale(payload.registry_version)) {
    return {
      payload: { ...payload, registry_version: LOOK_PRESET_REGISTRY_VERSION },
      migrated: true,
      reason: 'registry_version',
    };
  }

  return { payload, migrated: false };
}

export function parseLookPresetPayload(raw: unknown): LookPresetPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const payload = raw as Record<string, unknown>;
  const subtitle = String(payload.subtitle_style_id || '').trim();
  const transition = String(payload.transition_type || '').trim();
  const overlays = Array.isArray(payload.hf_overlays) ? payload.hf_overlays as HfGlobalOverlayItem[] : undefined;
  if (!subtitle && !transition && !overlays?.some((item) => item?.enabled)) return null;
  return {
    seed_id: String(payload.seed_id || '').trim() || undefined,
    subtitle_style_id: subtitle || undefined,
    transition_type: transition || undefined,
    transition_duration: typeof payload.transition_duration === 'number' ? payload.transition_duration : undefined,
    hf_overlays: overlays,
    pipeline_required: String(payload.pipeline_required || '').trim() || undefined,
    tags: Array.isArray(payload.tags) ? payload.tags.map(String) : undefined,
    preview_thumb_url: String(payload.preview_thumb_url || '').trim() || undefined,
    registry_version: String(payload.registry_version || '').trim() || undefined,
  };
}

function mergeHfOverlays(incoming?: HfGlobalOverlayItem[]): HfGlobalOverlayItem[] {
  if (!incoming?.length) return DEFAULT_HF_GLOBAL_OVERLAYS.map((item) => ({ ...item }));
  return DEFAULT_HF_GLOBAL_OVERLAYS.map((defaults) => {
    const found = incoming.find((item) => item.type === defaults.type);
    return { ...defaults, ...found, enabled: Boolean(found?.enabled) };
  });
}

export function applyLookPresetToDsl(
  dsl: DSL,
  payload: LookPresetPayload,
  options: ApplyLookPresetOptions = {},
): DSL {
  const {
    applySubtitleToAllSegments = true,
    applyTransitionToAllSegments = true,
    applyGlobalOverlays = true,
    currentSegIndex = 0,
  } = options;

  const next: DSL = {
    ...dsl,
    globalConfig: { ...dsl.globalConfig },
    segments: dsl.segments.map((segment) => ({ ...segment, subtitle: { ...segment.subtitle }, transition: { ...segment.transition } })),
    meta: { ...dsl.meta },
  };

  if (applyGlobalOverlays && payload.hf_overlays) {
    next.globalConfig.hf_overlays = mergeHfOverlays(payload.hf_overlays);
  }

  const transitionType = payload.transition_type;
  const transitionDuration = payload.transition_duration;
  if (transitionType && isHyperframesTransitionType(transitionType)) {
    next.globalConfig.transition_enabled = true;
    const duration = Math.max(0.4, transitionDuration ?? 0.6);
    next.segments = next.segments.map((segment, index) => {
      if (!applyTransitionToAllSegments && index !== currentSegIndex) return segment;
      return {
        ...segment,
        transition: {
          ...segment.transition,
          type: transitionType,
          duration,
        },
      };
    });
  }

  const subtitleStyleId = payload.subtitle_style_id;
  if (subtitleStyleId && isHyperframesSubtitleStyle(subtitleStyleId)) {
    next.segments = next.segments.map((segment, index) => {
      if (!applySubtitleToAllSegments && index !== currentSegIndex) return segment;
      if (!segment.subtitle.enabled && !String(segment.narration_text || '').trim()) return segment;
      return {
        ...segment,
        subtitle: {
          ...segment.subtitle,
          enabled: segment.subtitle.enabled || Boolean(String(segment.narration_text || '').trim()),
          style_id: subtitleStyleId,
        },
      };
    });
    if (!applySubtitleToAllSegments) {
      const seg = next.segments[currentSegIndex];
      if (seg) {
        next.segments[currentSegIndex] = {
          ...seg,
          subtitle: { ...seg.subtitle, enabled: true, style_id: subtitleStyleId },
        };
      }
    }
  }

  const requiredPipeline = payload.pipeline_required === 'hyperframes_template'
    ? 'template_editor'
    : payload.pipeline_required;
  if (requiredPipeline === 'template_editor') {
    next.meta = {
      ...next.meta,
      pipeline_key: 'template_editor',
      look_preset_id: payload.seed_id,
    };
  }

  return next;
}

export function dslUsesAnyHyperframesFeatures(dsl: {
  globalConfig?: { hf_overlays?: Array<{ type: string; enabled?: boolean }> };
  segments?: Array<{
    subtitle?: { enabled?: boolean; style_id?: string };
    narration_text?: string;
    transition?: { type?: string };
  }>;
}): boolean {
  return dslUsesHyperframesSubtitles(dsl)
    || dslUsesHyperframesTransitions(dsl)
    || dslUsesHyperframesGlobalOverlays(dsl);
}

export function summarizeHyperframesFeatures(dsl: Parameters<typeof dslUsesAnyHyperframesFeatures>[0]): {
  subtitleCount: number;
  transitionCount: number;
  overlayCount: number;
  total: number;
} {
  const segments = dsl.segments || [];
  const subtitleCount = segments.filter((seg) => (
    seg.subtitle?.enabled
    && String(seg.narration_text || '').trim()
    && isHyperframesSubtitleStyle(String(seg.subtitle.style_id || ''))
  )).length;
  const transitionCount = segments.filter((seg, index) => (
    index < segments.length - 1
    && isHyperframesTransitionType(String(seg.transition?.type || ''))
  )).length;
  const overlayCount = (dsl.globalConfig?.hf_overlays || []).filter((item) => item.enabled).length;
  return {
    subtitleCount,
    transitionCount,
    overlayCount,
    total: subtitleCount + transitionCount + overlayCount,
  };
}