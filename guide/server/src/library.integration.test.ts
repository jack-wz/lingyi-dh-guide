import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

type JsonValue = Record<string, unknown> | unknown[];

let server: Server;
let baseUrl = '';
let closeDb: () => void;

async function request(method: string, path: string, body?: JsonValue) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : undefined;
  return { status: res.status, json };
}

describe('library API', () => {
  before(async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'library-api-'));
    process.env.DATA_DIR = dataDir;
    process.env.DISABLE_RENDER_WORKER = '1';

    const appModule = await import('./app.js');
    const dbModule = await import('./db/database.js');
    closeDb = dbModule.closeDb;

    server = appModule.createApp().listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    closeDb();
  });

  it('returns summary counts', async () => {
    const res = await request('GET', '/api/library/summary');
    assert.equal(res.status, 200);
    assert.ok((res.json as { counts: Record<string, number> }).counts);
    assert.ok((res.json as { categories: string[] }).categories.includes('brand'));
  });

  it('lists voice items with bgm sub_type', async () => {
    const res = await request('GET', '/api/library?category=voice&sub_type=bgm');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray((res.json as { items: unknown[] }).items));
  });

  it('lists seeded brand items', async () => {
    const res = await request('GET', '/api/library?category=brand');
    assert.equal(res.status, 200);
    const items = (res.json as { items: unknown[] }).items;
    assert.ok(Array.isArray(items));
    assert.ok(items.length >= 1);
  });

  it('imports external catalog from OpenStoryline and opentalking', async () => {
    const res = await request('POST', '/api/library/import-catalog', {});
    assert.equal(res.status, 200);
    assert.equal((res.json as { success: boolean }).success, true);
    const scripts = await request('GET', '/api/library?category=script&limit=200');
    assert.ok((scripts.json as { items: unknown[] }).items.length >= 1);
    const brands = await request('GET', '/api/library?category=brand&limit=20');
    const brandItems = (brands.json as { items: Array<{ payload: Record<string, unknown> }> }).items;
    const opentalkingBrand = brandItems.find((b) => b.payload?.external_id === 'opentalking:brand:design_default');
    if (opentalkingBrand) {
      const fonts = (opentalkingBrand.payload.tokens as { typography?: { fonts?: unknown[] } })?.typography?.fonts;
      assert.ok(Array.isArray(fonts) && fonts.length >= 10, 'brand pack should include typography.fonts');
      const frames = opentalkingBrand.payload.frames as unknown[];
      assert.ok(Array.isArray(frames) && frames.length >= 4, 'brand pack should include frame.md shots');
      const fontsWithUrl = (fonts || []).filter((f: { url?: string }) => Boolean(f.url));
      assert.ok(fontsWithUrl.length >= 5, 'brand pack fonts should copy OpenStoryline TTF urls');
    }
  });

  it('creates updates and deletes a script item', async () => {
    const created = await request('POST', '/api/library', {
      category: 'script',
      name: '测试脚本',
      description: 'unit test',
      payload: { content: 'hello world' },
    });
    assert.equal(created.status, 201);
    const id = (created.json as { id: string }).id;
    assert.ok(id);

    const updated = await request('PUT', `/api/library/${id}`, { name: '测试脚本更新' });
    assert.equal(updated.status, 200);
    assert.equal((updated.json as { name: string }).name, '测试脚本更新');

    const removed = await request('DELETE', `/api/library/${id}`);
    assert.equal(removed.status, 200);
  });
});