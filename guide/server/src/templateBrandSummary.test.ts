import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractBrandPackIdFromDslJson, enrichTemplateRowsWithBrandSummary } from './templateBrandSummary.js';

describe('templateBrandSummary', () => {
  it('reads brand_pack_id from meta or globalConfig', () => {
    const metaOnly = JSON.stringify({ meta: { brand_pack_id: 'brand-a' }, globalConfig: {} });
    const gcOnly = JSON.stringify({ meta: {}, globalConfig: { brand_pack_id: 'brand-b' } });
    assert.equal(extractBrandPackIdFromDslJson(metaOnly), 'brand-a');
    assert.equal(extractBrandPackIdFromDslJson(gcOnly), 'brand-b');
  });

  it('enriches list rows with library brand names', async () => {
    process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'brand-summary-'));
    const { getDb } = await import('./db/database.js');
    const db = getDb();
    db.prepare(
      `INSERT INTO library_items (id, category, name, description, tags, file_url, parent_id, payload_json)
       VALUES (?, 'brand', ?, '', '', '', '', '{}')`,
    ).run('brand-1', '零一品牌包');

    const rows = enrichTemplateRowsWithBrandSummary(
      [{
        id: 'tpl-1',
        name: 'Demo',
        dsl_json: JSON.stringify({ meta: { brand_pack_id: 'brand-1' }, globalConfig: {} }),
      }],
      db,
    );

    assert.equal(rows[0].brand_pack_id, 'brand-1');
    assert.equal(rows[0].brand_pack_name, '零一品牌包');
  });
});