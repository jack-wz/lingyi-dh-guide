import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSceneVideoPrompt,
  parseNlEdit,
  polishScript,
  recommendShots,
  suggestFrameFromDesign,
} from '../../shared/aiHelpers.js';

test('polishScript normalizes punctuation and tone', () => {
  const raw = '你好  今天给大家推荐这款产品，，';
  const out = polishScript(raw);
  assert.match(out, /您好/);
  assert.ok(!out.includes('，，'));
});

test('recommendShots ranks product scenes', () => {
  const recs = recommendShots('展示产品卖点特写', [
    { id: 'p1', name: '产品特写', shotType: 'product_showcase', description: '突出卖点' },
    { id: 'a1', name: '口播开场', shotType: 'avatar_talking' },
  ]);
  assert.ok(recs.length >= 1);
  assert.equal(recs[0].id, 'p1');
});

test('parseNlEdit extracts duration patch', () => {
  const patches = parseNlEdit('把时长改成 8 秒', 1);
  assert.ok(patches);
  assert.equal(patches![0].path, 'segments[1].duration_sec');
  assert.equal(patches![0].value, 8);
});

test('buildSceneVideoPrompt uses structured sections', () => {
  const prompt = buildSceneVideoPrompt('门店导购介绍新品', { cameraShot: '特写' });
  assert.match(prompt, /【镜头】特写/);
  assert.match(prompt, /【主体】门店导购介绍新品/);
});

test('suggestFrameFromDesign emits frame skeleton', () => {
  const md = suggestFrameFromDesign('colors: { brand: #ff0000 } 产品展示');
  assert.match(md, /hf_shots/);
  assert.match(md, /product_hero/);
});