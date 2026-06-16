import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { buildBrandPackPayload, parseDesignMd, parseFrameMd } from '../../shared/brandPack.js';

const OPENTALKING = process.env.OPENTALKING_ROOT
  || '/Users/wuzhu/Documents/AI 产品/数字人/零一数字人导购平台/项目demo/opentalking';

describe('brand pack parsers', () => {
  it('parses opentalking design.md with fonts', () => {
    const path = join(OPENTALKING, '09_设计系统', 'design.md');
    if (!existsSync(path)) return;
    const design = parseDesignMd(readFileSync(path, 'utf-8'));
    assert.ok(design);
    assert.ok(design!.typography.fonts.length >= 10);
    assert.ok(design!.colors['digital-orange']);
  });

  it('parses opentalking frame.md with shots', () => {
    const path = join(OPENTALKING, '09_设计系统', 'frame.md');
    if (!existsSync(path)) return;
    const frame = parseFrameMd(readFileSync(path, 'utf-8'));
    assert.ok(frame);
    assert.ok(frame!.frames.length >= 4);
    assert.ok(frame!.presets.subtitleStyles.length >= 1);
  });

  it('builds brand pack payload', () => {
    const designPath = join(OPENTALKING, '09_设计系统', 'design.md');
    const framePath = join(OPENTALKING, '09_设计系统', 'frame.md');
    if (!existsSync(designPath)) return;
    const design = parseDesignMd(readFileSync(designPath, 'utf-8'))!;
    const frame = existsSync(framePath) ? parseFrameMd(readFileSync(framePath, 'utf-8')) : null;
    const payload = buildBrandPackPayload(design, frame);
    assert.ok(payload.design_markdown);
    assert.ok(payload.tokens?.typography.fonts.length);
    assert.ok(payload.frames?.length);
  });
});