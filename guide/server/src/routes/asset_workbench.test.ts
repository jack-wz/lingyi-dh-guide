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
});
