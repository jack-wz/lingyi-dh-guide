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

async function setupProject(): Promise<string> {
  process.env.ENABLE_PROJECT_WORKFLOW = '1';
  process.env.ENABLE_SEGMENT_REGEN = '1';
  const { json: tpl } = await request('POST', '/api/templates', { name: 'regen-test' });
  await request('PUT', `/api/templates/${tpl.id}`, {
    dsl_json: {
      segments: [
        { id: 's1', narration_text: 'seg1', scene_image_url: '/img1.png' },
        { id: 's2', narration_text: 'seg2', scene_image_url: '' },
      ],
      meta: {}, globalConfig: {},
    },
  });
  const { json: proj } = await request('POST', '/api/projects', { template_id: tpl.id, name: 'Regen Test' });
  return proj.id;
}

describe('segment regen & reuse API (ENABLE_SEGMENT_REGEN)', () => {
  before(async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'regen-api-'));
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

  it('rejects when flag is off', async () => {
    delete process.env.ENABLE_SEGMENT_REGEN;
    const { status } = await request('POST', '/api/segment-regen/projects/x/segments/0/regen');
    assert.equal(status, 400);
  });

  it('queues segment regen', async () => {
    const projectId = await setupProject();
    const { status, json } = await request('POST', `/api/segment-regen/projects/${projectId}/segments/1/regen`, {
      recipe_id: 'recipe-1',
      provider: 'kie',
      source_asset_ids: ['asset-1'],
    });
    assert.equal(status, 201);
    assert.ok(json.id);
    assert.equal(json.status, 'pending');
    assert.equal(json.segment_index, 1);
  });

  it('lists segment artifacts', async () => {
    const projectId = await setupProject();
    await request('POST', `/api/segment-regen/projects/${projectId}/segments/0/regen`, { provider: 'kie' });
    const { status, json } = await request('GET', `/api/segment-regen/projects/${projectId}/segments/0/artifacts`);
    assert.equal(status, 200);
    assert.ok(json.items.length >= 1);
  });

  it('reuses intermediate artifacts from another segment', async () => {
    const projectId = await setupProject();
    const { status, json } = await request('POST', `/api/segment-regen/projects/${projectId}/segments/1/reuse`, {
      source_segment_index: 0,
    });
    assert.equal(status, 200);
    assert.ok(json.success);
    assert.equal(json.reused_from, 0);
    assert.equal(json.into, 1);

    const project = await request('GET', `/api/projects/${projectId}`);
    const dsl = JSON.parse(project.json.current_dsl_json);
    assert.equal(dsl.segments[1].scene_image_url, '/img1.png');
  });

  it('rejects invalid segment index', async () => {
    const projectId = await setupProject();
    const { status } = await request('POST', `/api/segment-regen/projects/${projectId}/segments/99/regen`);
    assert.equal(status, 400);
  });
});
