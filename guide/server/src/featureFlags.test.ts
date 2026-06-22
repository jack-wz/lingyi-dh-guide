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

describe('feature flags API', () => {
  before(async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'feature-flags-'));
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
    await new Promise<void>((resolve) => server.close(() => resolve()));
    closeDb();
  });

  it('GET /api/config/feature-flags returns all flags default off', async () => {
    const { status, json } = await request('GET', '/api/config/feature-flags');
    assert.equal(status, 200);
    assert.equal(json.ENABLE_PROJECT_WORKFLOW, false);
    assert.equal(json.ENABLE_PROPOSAL_GATE, false);
    assert.equal(json.ENABLE_REFERENCE_SETS, false);
    assert.equal(json.ENABLE_SEGMENT_REGEN, false);
    assert.equal(json.ENABLE_LOTTIE_OVERLAY, false);
    assert.equal(json.ENABLE_STAGE4_BUSINESS_QA, false);
    assert.equal(json.ENABLE_REVIEW_WORKFLOW, false);
  });
});
