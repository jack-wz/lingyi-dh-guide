/** HyperFrames registry metadata — maps guide style ids to installed HF assets. */

import { isHyperframesSubtitleStyle } from './subtitleStyles.js';

export type HfStyleSlot = 'subtitle' | 'overlay' | 'transition';

export interface HfStyleBinding {
  styleId: string;
  hfName: string;
  slot: HfStyleSlot;
  fallbackStyleId: string;
  verticalSafe: boolean;
  requiresGsap: boolean;
  brandTokenKeys?: string[];
}

export const HF_STYLE_BINDINGS: HfStyleBinding[] = [
  {
    styleId: 'hf-caption-highlight',
    hfName: 'caption-highlight',
    slot: 'subtitle',
    fallbackStyleId: 'bold-yellow',
    verticalSafe: true,
    requiresGsap: true,
    brandTokenKeys: ['brand_color', 'accent_color'],
  },
  {
    styleId: 'hf-caption-pill',
    hfName: 'caption-pill-karaoke',
    slot: 'subtitle',
    fallbackStyleId: 'subtitle-card',
    verticalSafe: true,
    requiresGsap: true,
    brandTokenKeys: ['brand_color', 'accent_color'],
  },
  {
    styleId: 'hf-caption-neon',
    hfName: 'caption-neon-glow',
    slot: 'subtitle',
    fallbackStyleId: 'gradient-glow',
    verticalSafe: true,
    requiresGsap: true,
    brandTokenKeys: ['brand_color', 'accent_color'],
  },
  {
    styleId: 'hf-caption-editorial',
    hfName: 'caption-editorial-emphasis',
    slot: 'subtitle',
    fallbackStyleId: 'brand-elegant',
    verticalSafe: true,
    requiresGsap: true,
    brandTokenKeys: ['brand_color'],
  },
  {
    styleId: 'hf-caption-gradient',
    hfName: 'caption-gradient-fill',
    slot: 'subtitle',
    fallbackStyleId: 'gradient-glow',
    verticalSafe: true,
    requiresGsap: true,
    brandTokenKeys: ['brand_color', 'accent_color'],
  },
  {
    styleId: 'hf-grain',
    hfName: 'grain-overlay',
    slot: 'overlay',
    fallbackStyleId: 'default',
    verticalSafe: true,
    requiresGsap: false,
  },
  {
    styleId: 'hf-vignette',
    hfName: 'vignette',
    slot: 'overlay',
    fallbackStyleId: 'default',
    verticalSafe: true,
    requiresGsap: false,
  },
];

const bindingByStyleId = new Map(HF_STYLE_BINDINGS.map((b) => [b.styleId, b]));
const bindingByHfName = new Map(HF_STYLE_BINDINGS.map((b) => [b.hfName, b]));

export function getHfStyleBinding(styleId: string): HfStyleBinding | undefined {
  return bindingByStyleId.get(styleId);
}

export function getHfStyleBindingByName(hfName: string): HfStyleBinding | undefined {
  return bindingByHfName.get(hfName);
}

export function subtitleUsesHyperframes(styleId: string): boolean {
  return isHyperframesSubtitleStyle(styleId);
}

export function anySegmentUsesHyperframesCaptions(
  segments: Array<{ subtitle?: { enabled?: boolean; style_id?: string }; narration_text?: string }>,
): boolean {
  return segments.some((seg) => {
    if (!seg.subtitle?.enabled || !String(seg.narration_text || '').trim()) return false;
    return subtitleUsesHyperframes(String(seg.subtitle.style_id || ''));
  });
}