import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCompositionDsl } from '../../shared/compositionResolver.js';

test('resolveCompositionDsl merges variables and object overlays', () => {
  const { segments } = resolveCompositionDsl(
    {
      meta: {},
      globalConfig: { asset_map: { logo: 'http://cdn/logo.png' } },
      variables: [{ name: 'brand', default_value: '飞鹤' }],
      segments: [
        {
          id: 's1',
          type: 'narration',
          narration_text: '欢迎了解{brand}',
          duration_sec: 6,
          scene_image_url: '',
          scene_description: '',
          subtitle: { enabled: true, style_id: 'default', position: 'bottom', animation: 'fadeIn' },
          transition: { type: 'none', duration: 0.5 },
          digital_human: { enabled: true, position: { x: 50, y: 72 }, scale: 100 },
          overlays: [{ id: 'ov1', asset_key: 'logo', asset_url: '', position: { x: 8, y: 8 }, scale: 100, seg_start_time: 0, duration: 6, animation: 'none' }],
          objects: [{ id: 'txt1', type: 'text', text: '标题', position: { x: 50, y: 20 }, scale: 100, visible: true }],
        },
      ],
    },
    {},
  );

  assert.equal(segments[0].narration_text, '欢迎了解飞鹤');
  assert.equal(segments[0].overlays.length, 2);
  assert.ok(segments[0].overlays.some((ov) => ov.text === '标题'));
  assert.ok(segments[0].overlays.some((ov) => ov.asset_url === 'http://cdn/logo.png'));
});