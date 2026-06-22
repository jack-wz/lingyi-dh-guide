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
  process.env.ENABLE_REVIEW_WORKFLOW = '1';
  const { json: tpl } = await request('POST', '/api/templates', { name: 'review-test' });
  await request('PUT', `/api/templates/${tpl.id}`, {
    dsl_json: { segments: [{ id: 's1', narration_text: 'test' }], meta: {}, globalConfig: {} },
  });
  const { json: proj } = await request('POST', '/api/projects', { template_id: tpl.id, name: 'Review Test' });
  return proj.id;
}

describe('review, version & save-as-template API (ENABLE_REVIEW_WORKFLOW)', () => {
  before(async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'review-api-'));
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
    delete process.env.ENABLE_REVIEW_WORKFLOW;
    const { status } = await request('POST', '/api/review/projects/x/review', { status: 'approved' });
    assert.equal(status, 400);
  });

  it('submits a review and updates project status', async () => {
    const projectId = await setupProject();
    const { status, json } = await request('POST', `/api/review/projects/${projectId}/review`, {
      status: 'approved',
      review_notes: 'looks good',
    });
    assert.equal(status, 200);
    assert.equal(json.status, 'approved');
    assert.equal(json.project_status, 'completed');

    const project = await request('GET', `/api/projects/${projectId}`);
    assert.equal(project.json.status, 'completed');
  });

  it('saves project as template', async () => {
    const projectId = await setupProject();
    const { status, json } = await request('POST', `/api/review/projects/${projectId}/save-as-template`, {
      template_name: 'Saved Template',
    });
    assert.equal(status, 201);
    assert.ok(json.id);
    assert.equal(json.source_project_id, projectId);

    const template = await request('GET', `/api/templates/${json.id}`);
    assert.equal(template.status, 200);
  });

  it('diffs two project versions', async () => {
    const projectId = await setupProject();
    const initial = await request('GET', `/api/projects/${projectId}`);
    const firstVersionId = initial.json.current_version_id;

    await request('PUT', `/api/projects/${projectId}`, {
      current_dsl_json: { segments: [{ id: 's1', narration_text: 'modified' }, { id: 's2', narration_text: 'new' }] },
    });

    const { status, json } = await request('GET', `/api/review/projects/${projectId}/versions/${firstVersionId}/diff`);
    assert.equal(status, 200);
    assert.ok(json.diff.length > 0);
    assert.ok(json.diff.some((d: any) => d.type === 'modified'));
  });
});
