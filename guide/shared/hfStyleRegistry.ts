/** HyperFrames registry metadata — maps guide style ids to installed HF assets. */

export type HfStyleSlot = 'subtitle' | 'overlay' | 'transition';

export interface HfStyleBinding {
  /** Guide subtitle style id */
  styleId: string;
  /** HF registry component/block name */
  hfName: string;
  slot: HfStyleSlot;
  /** Fallback CSS style id when HF asset missing or render fails */
  fallbackStyleId: string;
  /** Safe for 1080×1920 vertical canvas without extra scaling */
  verticalSafe: boolean;
  /** Needs GSAP runtime in host composition */
  requiresGsap: boolean;
  /** Brand token keys mapped into component CSS */
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
  return Boolean(getHfStyleBinding(styleId));
}

export function anySegmentUsesHyperframesCaptions(
  segments: Array<{ subtitle?: { enabled?: boolean; style_id?: string }; narration_text?: string }>,
): boolean {
  return segments.some((seg) => {
    if (!seg.subtitle?.enabled || !String(seg.narration_text || '').trim()) return false;
    return subtitleUsesHyperframes(String(seg.subtitle.style_id || ''));
  });
}