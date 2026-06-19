import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateHyperframesHTML } from './hyperframesComposer.js';
import { resolveHfRenderFontStack } from './hfFontFamily.js';

describe('hfFontFamily', () => {
  it('uses brand @font-face family when declared', () => {
    const face = "@font-face{font-family:'DeyiHei';src:url('/uploads/fonts/brand.ttf') format('truetype');}";
    assert.equal(resolveHfRenderFontStack('DeyiHei', face), "'DeyiHei', sans-serif");
  });

  it('falls back to Poppins for undeclared system fonts', () => {
    assert.equal(resolveHfRenderFontStack('PingFang SC', ''), "'Poppins', sans-serif");
  });

  it('composer embeds brand font-face and avoids var(--font-sans) on body', () => {
    const html = generateHyperframesHTML({
      meta: { name: 'Brand Font', type: 'smoke' },
      globalConfig: {
        canvas_width: 1080,
        canvas_height: 1920,
        fps: 30,
        bgm_url: '',
        bgm_volume: 0.3,
        brand_pack: {
          brand_color: '#ff5600',
          tokens: {
            typography: {
              fonts: [{ family: 'DeyiHei', url: '/uploads/fonts/brand-DeyiHei.ttf' }],
            },
          },
        },
      },
      segments: [
        {
          id: 's1',
          type: 'narration',
          narration_text: '品牌字体测试',
          duration_sec: 3,
          scene_image_url: '',
          scene_description: '',
          subtitle: {
            enabled: true,
            style_id: 'hf-caption-pill',
            position: 'bottom',
            animation: 'fadeIn',
          },
          transition: { type: 'none', duration: 0.5 },
          digital_human: { enabled: false, position: { x: 50, y: 80 }, scale: 100 },
          overlays: [],
        },
      ],
    });
    assert.match(html, /@font-face/);
    assert.match(html, /DeyiHei/);
    assert.doesNotMatch(html, /font-family:\s*var\(--font-sans/);
    assert.match(html, /font-family:\s*'DeyiHei', sans-serif/);
  });
});