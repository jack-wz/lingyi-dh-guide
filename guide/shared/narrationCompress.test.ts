import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { compressChineseNarration, compressSegmentNarrations } from './narrationCompress.js';

describe('Chinese narration compression', () => {
  it('removes filler words', () => {
    const result = compressChineseNarration('嗯，也就是说，这个产品很好');
    assert.ok(result.compressed.length < result.original.length);
    assert.ok(result.changes.includes('removed filler words and repetitions'));
  });

  it('removes repeated phrases', () => {
    const result = compressChineseNarration('这个产品很好这个产品很好');
    assert.ok(result.compressed.length < result.original.length);
  });

  it('preserves price and CTA', () => {
    const result = compressChineseNarration('嗯，满299减50，立即购买');
    assert.ok(result.compressed.includes('299'));
    assert.ok(result.compressed.includes('50'));
    assert.ok(result.compressed.includes('立即购买'));
  });

  it('preserves brand names', () => {
    const result = compressChineseNarration('嗯，飞鹤奶粉很好');
    assert.ok(result.compressed.includes('飞鹤'));
  });

  it('collapses whitespace', () => {
    const result = compressChineseNarration('你好   世界  ');
    assert.ok(!result.compressed.includes('  '));
  });

  it('handles empty text', () => {
    const result = compressChineseNarration('');
    assert.equal(result.compressed, '');
    assert.equal(result.reduction_pct, 0);
  });

  it('reports reduction percentage', () => {
    const result = compressChineseNarration('嗯，也就是说，然后那个这个产品很好');
    assert.ok(result.reduction_pct > 0);
  });

  it('compressSegmentNarrations processes all segments', () => {
    const results = compressSegmentNarrations([
      { narration_text: '嗯，这个很好' },
      { narration_text: '' },
      { narration_text: '满100减20，立即购买' },
    ]);
    assert.equal(results.length, 3);
    assert.equal(results[0].result.compressed.length < results[0].result.original.length, true);
    assert.equal(results[1].result.compressed, '');
  });
});
