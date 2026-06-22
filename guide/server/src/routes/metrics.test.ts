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

async function request(method: string, path: string) {
  const res = await fetch(`${baseUrl}${path}`, { method });
  const text = await res.text();
  const json = text ? JSON.parse(text) : undefined;
  return { status: res.status, json };
}

describe('metrics & regression check API', () => {
  before(async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'metrics-'));
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

  it('GET /api/metrics/metrics returns platform metrics', async () => {
    const { status, json } = await request('GET', '/api/metrics/metrics');
    assert.equal(status, 200);
    assert.ok(json.counts);
    assert.ok(json.rates);
    assert.ok(json.breakdowns);
    assert.ok(json.feature_flags);
    assert.ok(json.v4_capabilities);
    assert.ok(typeof json.counts.templates === 'number');
    assert.ok(typeof json.rates.render_success_rate === 'number');
  });

  it('GET /api/metrics/regression-check returns all V4 checks', async () => {
    const { status, json } = await request('GET', '/api/metrics/regression-check');
    assert.equal(status, 200);
    assert.ok(json.checks);
    assert.equal(json.total, 13);
    assert.equal(json.passed, 13);
    assert.equal(json.failed, 0);
    assert.ok(json.checks.every((c: any) => c.status === 'pass'));
  });
});
