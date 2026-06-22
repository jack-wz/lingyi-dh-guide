import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let server: Server;
let baseUrl = '';
let closeDb: () => void;

async function request(method: string, path: string, body?: Record<string, unknown>) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : undefined;
  return { status: res.status, json };
}

describe('recipe registry & asset lineage API (ENABLE_REFERENCE_SETS)', () => {
  before(async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'recipes-api-'));
    process.env.DATA_DIR = dataDir;
    process.env.DISABLE_RENDER_WORKER = '1';
    process.env.ENABLE_REFERENCE_SETS = '1';

    const appModule = await import('../app.js');
    const dbModule = await import('../db/database.js');
    closeDb = dbModule.closeDb;

    server = appModule.createApp().listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    closeDb();
  });

  it('rejects when flag is off', async () => {
    delete process.env.ENABLE_REFERENCE_SETS;
    const { status } = await request('POST', '/api/recipes/recipes', { name: 'x', prompt_template: 'x' });
    assert.equal(status, 400);
    process.env.ENABLE_REFERENCE_SETS = '1';
  });

  it('creates and lists recipes', async () => {
    const { status, json } = await request('POST', '/api/recipes/recipes', {
      name: '产品特写',
      shot_type: 'close-up',
      platform: 'douyin',
      prompt_template: '生成{{product}}特写镜头',
    });
    assert.equal(status, 201);
    assert.ok(json.id);

    const { status: listStatus, json: listJson } = await request('GET', '/api/recipes/recipes?shot_type=close-up');
    assert.equal(listStatus, 200);
    assert.ok(listJson.items.length >= 1);
  });

  it('creates and lists reference sets', async () => {
    const { status, json } = await request('POST', '/api/recipes/reference-sets', {
      category: 'product',
      name: '飞鹤产品图集',
      asset_ids: ['asset-1', 'asset-2'],
    });
    assert.equal(status, 201);
    assert.ok(json.id);

    const { status: listStatus, json: listJson } = await request('GET', '/api/recipes/reference-sets?category=product');
    assert.equal(listStatus, 200);
    assert.ok(listJson.items.length >= 1);
  });

  it('creates asset relations and queries lineage', async () => {
    const dbModule = await import('../db/database.js');
    const db = dbModule.getDb();
    db.prepare('INSERT OR REPLACE INTO assets (id, name, type, file_url) VALUES (?, ?, ?, ?)').run('src-1', '源图', 'image', '/x.png');
    db.prepare('INSERT OR REPLACE INTO assets (id, name, type, file_url) VALUES (?, ?, ?, ?)').run('gen-1', '生成图', 'image', '/y.png');

    const { status, json } = await request('POST', '/api/recipes/asset-relations', {
      source_asset_id: 'src-1',
      generated_asset_id: 'gen-1',
      relation_type: 'generated_from',
      recipe_id: 'recipe-1',
    });
    assert.equal(status, 201);

    const lineage = await request('GET', '/api/recipes/asset-lineage/gen-1');
    assert.equal(lineage.status, 200);
    assert.ok(lineage.json.upstream.length >= 1);
    assert.equal(lineage.json.upstream[0].source_asset_id, 'src-1');

    const reverseLineage = await request('GET', '/api/recipes/asset-lineage/src-1');
    assert.ok(reverseLineage.json.downstream.length >= 1);
  });

  it('records generation artifacts', async () => {
    const { status, json } = await request('POST', '/api/recipes/generation-artifacts', {
      segment_id: 'seg-1',
      recipe_id: 'recipe-1',
      provider: 'kie',
      input_fingerprint: 'abc123',
      source_asset_ids: ['src-1'],
      generated_asset_ids: ['gen-1'],
      status: 'completed',
    });
    assert.equal(status, 201);
    assert.ok(json.id);

    const { status: listStatus, json: listJson } = await request('GET', '/api/recipes/generation-artifacts?segment_id=seg-1');
    assert.equal(listStatus, 200);
    assert.ok(listJson.items.length >= 1);
  });

  it('finds affected projects by source asset after artifact creation', async () => {
    await request('POST', '/api/recipes/generation-artifacts', {
      segment_id: 'seg-affected',
      recipe_id: 'recipe-1',
      provider: 'kie',
      input_fingerprint: 'xyz',
      source_asset_ids: ['src-1'],
      generated_asset_ids: ['gen-2'],
      status: 'completed',
    });
    const { status, json } = await request('GET', '/api/recipes/affected-projects/src-1');
    assert.equal(status, 200);
    assert.ok(json.affected.length >= 1);
  });
});
