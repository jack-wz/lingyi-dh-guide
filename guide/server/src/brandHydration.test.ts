import assert from 'node:assert/strict';
import test from 'node:test';
import { hydrateBrandPackInDsl } from '../../shared/hydrateBrandPack.js';

test('hydrateBrandPackInDsl merges fonts from library row', () => {
  const dsl = {
    globalConfig: {
      brand_pack_id: 'brand-1',
      brand_color: '#111111',
    },
    segments: [{ subtitle: { style_id: '' } }],
  };
  const hydrated = hydrateBrandPackInDsl(dsl, {
    id: 'brand-1',
    payload: {
      brand_color: '#ff5600',
      background_color: '#fff0e8',
      subtitle_style: 'brand-elegant',
      tokens: {
        typography: {
          fonts: [{ family: 'BiaoXiaoZhiBiaoTiHei', url: '/uploads/fonts/brand-BiaoXiaoZhiBiaoTiHei.ttf' }],
        },
      },
    },
  });

  assert.equal(hydrated.globalConfig?.default_font_family, 'BiaoXiaoZhiBiaoTiHei');
  const fonts = (hydrated.globalConfig?.brand_pack as { tokens?: { typography?: { fonts?: unknown[] } } })?.tokens?.typography?.fonts;
  assert.ok(Array.isArray(fonts) && fonts.length === 1);
  assert.equal(hydrated.segments[0].subtitle.style_id, 'brand-elegant');
});

test('hydrateBrandPackInDsl ignores mismatched pack id', () => {
  const dsl = { globalConfig: { brand_pack_id: 'a' } };
  const hydrated = hydrateBrandPackInDsl(dsl, { id: 'b', payload: { brand_color: '#000' } });
  assert.equal((hydrated.globalConfig as { brand_pack?: unknown }).brand_pack, undefined);
});