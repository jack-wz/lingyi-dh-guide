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

describe('asset workbench API', () => {
  before(async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'workbench-'));
    process.env.DATA_DIR = dataDir;
    process.env.DISABLE_RENDER_WORKER = '1';

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

  it('lists assets with inferred categories', async () => {
    const { status, json } = await request('GET', '/api/assets/workbench');
    assert.equal(status, 200);
    assert.ok(json.items);
    assert.ok(json.categories);
    assert.ok(json.available_categories);
  });

  it('returns workbench stats', async () => {
    const { status, json } = await request('GET', '/api/assets/workbench/stats');
    assert.equal(status, 200);
    assert.ok(typeof json.total === 'number');
    assert.ok(json.by_type);
    assert.ok(json.recent);
  });

  it('filters by search term', async () => {
    const { status, json } = await request('GET', '/api/assets/workbench?search=product');
    assert.equal(status, 200);
    assert.ok(Array.isArray(json.items));
  });

  it('filters by inferred category (lottie) not raw type LIKE', async () => {
    // Insert a lottie-named asset that infers to category 'lottie' but has type 'file'.
    const create = await request('POST', '/api/assets/', {
      name: 'promo-lottie-badge.json', file_url: '/uploads/promo-lottie-badge.json', type: 'file',
    });
    assert.ok(create.status === 200 || create.status === 201, `create asset status=${create.status}`);
    const byCat = await request('GET', '/api/assets/workbench?category=lottie');
    assert.equal(byCat.status, 200);
    const ids = (byCat.json.items || []).map((a: any) => a.id);
    assert.ok(ids.length > 0, 'expect at least one lottie-inferred asset under category=lottie');
    assert.ok(ids.includes(create.json.id), 'lottie-named file asset must appear under category=lottie');
    // Same asset must NOT appear under category=image (inferred categories are exclusive).
    const byImg = await request('GET', '/api/assets/workbench?category=image');
    const imgIds = (byImg.json.items || []).map((a: any) => a.id);
    assert.ok(!imgIds.includes(create.json.id), 'lottie asset must not appear under category=image');
    // available_groups present.
    assert.ok(Array.isArray(byCat.json.available_groups));
  });

  it('exposes available_groups and supports group filter', async () => {
    const plain = await request('GET', '/api/assets/workbench');
    assert.ok(Array.isArray(plain.json.available_groups));
    const groups = plain.json.available_groups.map((g: any) => g.id);
    assert.ok(groups.includes('brand_role'));
    assert.ok(groups.includes('product_scene'));
    const scoped = await request('GET', '/api/assets/workbench?group=template_motion');
    assert.equal(scoped.status, 200);
    assert.ok(typeof scoped.json.total === 'number');
  });
});
