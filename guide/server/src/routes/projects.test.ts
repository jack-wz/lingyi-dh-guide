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
let templateId = '';

async function request(method: string, path: string, body?: Record<string, unknown>, headers?: Record<string, string>) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : undefined;
  return { status: res.status, json };
}

async function ensureTemplate(): Promise<string> {
  const { json: created } = await request('POST', '/api/templates', {
    name: 'test-template-for-projects',
  });
  await request('PUT', `/api/templates/${created.id}`, {
    dsl_json: { segments: [], meta: {}, globalConfig: { brand_pack_id: 'bp-1' } },
  });
  return created.id;
}

describe('project workflow API (ENABLE_PROJECT_WORKFLOW)', () => {
  before(async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'projects-api-'));
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

  it('rejects project API when flag is off', async () => {
    delete process.env.ENABLE_PROJECT_WORKFLOW;
    const { status, json } = await request('POST', '/api/projects', { template_id: 'x', name: 'test' });
    assert.equal(status, 400);
    assert.ok(json.error.includes('not enabled'));
  });

  it('creates a project from a template when flag is on', async () => {
    process.env.ENABLE_PROJECT_WORKFLOW = '1';
    templateId = await ensureTemplate();
    const { status, json } = await request('POST', '/api/projects', { template_id: templateId, name: 'My Project' });
    assert.equal(status, 201);
    assert.ok(json.id);
    assert.equal(json.template_id, templateId);
    assert.equal(json.status, 'draft');
    assert.ok(json.template_snapshot_json);
    assert.equal(json.brand_pack_id, 'bp-1');
    assert.ok(json.current_version_id);
  });

  it('lists projects', async () => {
    const { status, json } = await request('GET', '/api/projects');
    assert.equal(status, 200);
    assert.ok(json.items.length >= 1);
    assert.ok(json.total >= 1);
  });

  it('updates project DSL and creates a new version', async () => {
    process.env.ENABLE_PROJECT_WORKFLOW = '1';
    const createRes = await request('POST', '/api/projects', { template_id: templateId, name: 'Version Test' });
    const projectId = createRes.json.id;
    const originalVersionId = createRes.json.current_version_id;

    const newDsl = { segments: [{ id: 's1', narration_text: 'updated' }] };
    const { status, json } = await request('PUT', `/api/projects/${projectId}`, {
      current_dsl_json: newDsl,
    });
    assert.equal(status, 200);
    assert.notEqual(json.current_version_id, originalVersionId);

    const versionsRes = await request('GET', `/api/projects/${projectId}/versions`);
    assert.equal(versionsRes.status, 200);
    assert.ok(versionsRes.json.items.length >= 2);
  });

  it('restores a previous version', async () => {
    process.env.ENABLE_PROJECT_WORKFLOW = '1';
    const createRes = await request('POST', '/api/projects', { template_id: templateId, name: 'Restore Test' });
    const projectId = createRes.json.id;
    const firstVersionId = createRes.json.current_version_id;

    await request('PUT', `/api/projects/${projectId}`, {
      current_dsl_json: { segments: [{ id: 's2' }] },
    });

    const restoreRes = await request('POST', `/api/projects/${projectId}/versions/${firstVersionId}/restore`);
    assert.equal(restoreRes.status, 200);
    assert.notEqual(restoreRes.json.current_version_id, firstVersionId);
  });

  it('same template creates multiple independent projects', async () => {
    process.env.ENABLE_PROJECT_WORKFLOW = '1';
    const p1 = await request('POST', '/api/projects', { template_id: templateId, name: 'P1' });
    const p2 = await request('POST', '/api/projects', { template_id: templateId, name: 'P2' });
    assert.notEqual(p1.json.id, p2.json.id);

    await request('PUT', `/api/projects/${p1.json.id}`, {
      current_dsl_json: { segments: [{ id: 'p1-only' }] },
    });

    const p2Refresh = await request('GET', `/api/projects/${p2.json.id}`);
    assert.equal(p2Refresh.json.current_dsl_json, p2.json.current_dsl_json);
  });
});
