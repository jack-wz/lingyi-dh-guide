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

describe('editor preview API (pre-gen expectation)', () => {
  before(async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'editor-preview-'));
    process.env.DATA_DIR = dataDir;
    process.env.DISABLE_RENDER_WORKER = '1';
    process.env.ENABLE_PROJECT_WORKFLOW = '1';

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

  it('returns pre-gen expectation preview', async () => {
    const { json: tpl } = await request('POST', '/api/templates', { name: 'preview-test' });
    await request('PUT', `/api/templates/${tpl.id}`, {
      dsl_json: {
        segments: [
          { id: 's1', narration_text: '嗯，这个产品很好', duration_sec: 5, scene_image_url: '' },
          { id: 's2', narration_text: '满299减50', duration_sec: 6, scene_image_url: '/img.png' },
        ],
        meta: {}, globalConfig: { brand_pack: { frames: [] } },
      },
    });
    const { json: proj } = await request('POST', '/api/projects', { template_id: tpl.id, name: 'Preview Test' });

    const { status, json } = await request('GET', `/api/editor-preview/projects/${proj.id}/preview`);
    assert.equal(status, 200);
    assert.equal(json.shot_count, 2);
    assert.ok(json.estimated_duration > 0);
    assert.ok(json.missing.scene_images >= 1);
    assert.ok(Array.isArray(json.risks));
    assert.ok(typeof json.ready === 'boolean');
    assert.ok(Array.isArray(json.compression_preview));
  });

  it('returns 404 for non-existent project', async () => {
    const { status } = await request('GET', '/api/editor-preview/projects/nonexistent/preview');
    assert.equal(status, 404);
  });
});
