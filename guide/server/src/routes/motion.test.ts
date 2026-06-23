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

const PLAN = {
  durationMs: 1500, fps: 30,
  elements: [{ selector: '#badge', animation: 'scale_pop', from: 0, to: 300 }],
  slots: [{ id: 'accent_color', type: 'color', default: '#ff6a00' }],
  nm: 'test-lottie',
};

describe('motion (text-to-lottie) skill API', () => {
  before(async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'motion-'));
    process.env.DATA_DIR = dataDir;
    process.env.DISABLE_RENDER_WORKER = '1';
    const appModule = await import('../app.js');
    const dbModule = await import('../db/database.js');
    closeDb = dbModule.closeDb;
    server = appModule.createApp().listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    closeDb();
  });

  it('compiles a lottie asset with lineage metadata', async () => {
    const { status, json } = await request('POST', '/api/motion/lottie/compile', {
      svg: '<svg><rect/></svg>',
      plan: PLAN, slots: { accent_color: '#00aaff' }, scope: { scope: 'project', project_id: 'p1' },
    });
    assert.equal(status, 201, JSON.stringify(json));
    assert.ok(json.lottie_asset_id);
    assert.ok(json.lottie.v);
    assert.equal(json.delivery_mode, 'video_overlay');
    assert.equal(json.lineage.project_id, 'p1');
    assert.equal(json.lineage.parent_asset_ids.length, 1);
    assert.deepEqual(json.poster_frames.length, 3);
  });

  it('rejects unsafe SVG', async () => {
    const { status, json } = await request('POST', '/api/motion/lottie/compile', { svg: '<svg><script>x</script></svg>', plan: PLAN });
    assert.equal(status, 422);
    assert.ok(json.blockers.some((b: string) => b.includes('script')));
  });

  it('rejects invalid plan', async () => {
    const { status } = await request('POST', '/api/motion/lottie/compile', { svg: '<svg/>', plan: { durationMs: -1, fps: 30, elements: [], slots: [] } });
    assert.equal(status, 422);
  });

  it('re-applies slot overrides', async () => {
    const { status, json } = await request('POST', '/api/motion/lottie/slots', { plan: PLAN, slots: { accent_color: '#112233' } });
    assert.equal(status, 200);
    assert.equal(json.slot_values.accent_color, '#112233');
    assert.equal(json.delivery_mode, 'video_overlay');
  });
});