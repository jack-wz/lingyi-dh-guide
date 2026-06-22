export interface FrameWhitelistEntry {
  frame_template_id: string;
  name?: string;
}

export interface BrandPackFrames {
  frames?: FrameWhitelistEntry[];
}

export interface SegmentWithFrame {
  frame_template_id?: string;
  camera_shot?: string;
}

export function getBrandFrameWhitelist(brandPack: BrandPackFrames | undefined): Set<string> {
  if (!brandPack?.frames) return new Set();
  return new Set(
    brandPack.frames
      .map((f) => f.frame_template_id)
      .filter(Boolean) as string[]
  );
}

export function validateSegmentFrames(
  segments: SegmentWithFrame[],
  brandPack: BrandPackFrames | undefined,
): { valid: boolean; violations: Array<{ index: number; frame: string; reason: string }> } {
  const whitelist = getBrandFrameWhitelist(brandPack);
  if (whitelist.size === 0) return { valid: true, violations: [] };

  const violations: Array<{ index: number; frame: string; reason: string }> = [];
  segments.forEach((seg, i) => {
    const frame = seg.frame_template_id || seg.camera_shot || '';
    if (frame && !whitelist.has(frame)) {
      violations.push({
        index: i,
        frame,
        reason: `frame "${frame}" not in brand whitelist [${[...whitelist].join(', ')}]`,
      });
    }
  });

  return { valid: violations.length === 0, violations };
}

export function validateDslFrames(dsl: {
  segments?: SegmentWithFrame[];
  globalConfig?: { brand_pack?: BrandPackFrames };
}): { valid: boolean; violations: Array<{ index: number; frame: string; reason: string }> } {
  return validateSegmentFrames(dsl.segments || [], dsl.globalConfig?.brand_pack);
}
