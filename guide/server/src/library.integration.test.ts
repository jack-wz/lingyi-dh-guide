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

  it('lists seeded look_preset items', async () => {
    const res = await request('GET', '/api/library?category=look_preset');
    assert.equal(res.status, 200);
    const items = (res.json as { items: Array<{ payload: Record<string, unknown> }> }).items;
    assert.ok(items.length >= 3);
    assert.ok(items.some((item) => item.payload?.subtitle_style_id === 'hf-caption-pill'));
    assert.ok(items.some((item) => item.payload?.seed_id === 'look-pop-energetic'));
  });

  it('syncs stale look presets via POST /look-presets/sync', async () => {
    const list = await request('GET', '/api/library?category=look_preset&limit=40');
    const items = (list.json as { items: Array<{ id: string; payload: Record<string, unknown> }> }).items;
    const target = items.find((item) => item.payload?.seed_id === 'look-steady-voice');
    assert.ok(target);

    const stalePut = await request('PUT', `/api/library/${target!.id}`, {
      payload: {
        ...target!.payload,
        registry_version: '2025.01',
      },
    });
    assert.equal(stalePut.status, 200);

    const sync = await request('POST', '/api/library/look-presets/sync');
    assert.equal(sync.status, 200);
    const body = sync.json as { success: boolean; migrated: number; updated_ids: string[] };
    assert.equal(body.success, true);
    assert.ok(body.migrated >= 1);
    assert.ok(body.updated_ids.includes(target!.id));

    const refreshed = await request('GET', `/api/library/${target!.id}`);
    const payload = (refreshed.json as { payload: Record<string, unknown> }).payload;
    assert.equal(payload.registry_version, '2026.06.3');
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

  it('brand PUT deletes payload keys when patch value is null', async () => {
    const list = await request('GET', '/api/library?category=brand&limit=1');
    const items = (list.json as { items: Array<{ id: string; payload: Record<string, unknown> }> }).items;
    assert.ok(items.length >= 1);
    const brand = items[0];

    const tagged = await request('PUT', `/api/library/${brand.id}`, {
      payload: {
        ...brand.payload,
        look_preset_seed_preview_tags: { 'look-grade-cinema': '集成方影院' },
      },
    });
    assert.equal(tagged.status, 200);
    assert.deepEqual(
      (tagged.json as { payload: Record<string, unknown> }).payload.look_preset_seed_preview_tags,
      { 'look-grade-cinema': '集成方影院' },
    );

    const cleared = await request('PUT', `/api/library/${brand.id}`, {
      payload: {
        ...brand.payload,
        look_preset_seed_preview_tags: null,
      },
    });
    assert.equal(cleared.status, 200);
    assert.equal(
      (cleared.json as { payload: Record<string, unknown> }).payload.look_preset_seed_preview_tags,
      undefined,
    );

    const nestedTagged = await request('PUT', `/api/library/${brand.id}`, {
      payload: {
        ...brand.payload,
        tokens: {
          ...((brand.payload.tokens as Record<string, unknown>) || {}),
          typography: { fonts: [{ name: 'TempFont' }] },
        },
      },
    });
    assert.equal(nestedTagged.status, 200);

    const nestedCleared = await request('PUT', `/api/library/${brand.id}`, {
      payload: {
        ...brand.payload,
        tokens: { typography: null },
      },
    });
    assert.equal(nestedCleared.status, 200);
    const tokens = (nestedCleared.json as { payload: { tokens?: Record<string, unknown> } }).payload.tokens;
    assert.equal(tokens?.typography, undefined);
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