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

describe('hf integrator smoke (CI gate)', () => {
  before(async () => {
    process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hf-integrator-smoke-'));
    process.env.DISABLE_RENDER_WORKER = '1';
    process.env.ENABLE_HF_TEMPLATE_PIPELINE = '1';

    const appModule = await import('./app.js');
    const dbModule = await import('./db/database.js');
    closeDb = dbModule.closeDb;

    server = appModule.createApp().listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    closeDb();
    delete process.env.DATA_DIR;
    delete process.env.DISABLE_RENDER_WORKER;
    delete process.env.ENABLE_HF_TEMPLATE_PIPELINE;
  });

  it('exposes hyperframes_template in diagnostics without blockers', async () => {
    const health = await request('GET', '/api/health');
    assert.equal(health.status, 200);
    assert.equal((health.json as { status: string }).status, 'ok');

    const guideHealth = await request('GET', '/api/guide/health');
    assert.equal(guideHealth.status, 200);
    assert.equal((guideHealth.json as { status: string }).status, 'ok');

    const diag = await request('GET', '/api/config/diagnostics');
    assert.equal(diag.status, 200);
    const pipelines = (diag.json as { pipelines: Record<string, { blockers: string[] }> }).pipelines;
    assert.ok(pipelines.hyperframes_template);
    assert.deepEqual(pipelines.hyperframes_template.blockers, []);
  });

  it('accepts hyperframes_template render jobs (smoke-integrator-hf gate)', async () => {
    const createdTemplate = await request('POST', '/api/templates', {
      name: 'HF integrator smoke',
      type: 'test',
      description: 'CI gate for hyperframes_template pipeline',
    });
    assert.equal(createdTemplate.status, 201);
    const templateId = (createdTemplate.json as { id: string }).id;

    const seeded = await request('PUT', `/api/templates/${templateId}`, {
      dsl_json: {
        globalConfig: {
          brand_color: '#4f46e5',
          transition_enabled: true,
        },
        segments: [
          {
            narration_text: '导购口播词轴对齐测试',
            duration_sec: 5,
            subtitle: { enabled: true, style_id: 'hf-caption-pill' },
            transition: { type: 'fade', duration: 0.6 },
          },
        ],
      },
    });
    assert.equal(seeded.status, 200);

    const render = await request('POST', '/api/renders', {
      template_id: templateId,
      pipeline_key: 'hyperframes_template',
      input_mode: 'template',
    });
    assert.equal(render.status, 201, JSON.stringify(render.json));
    assert.equal((render.json as { pipeline_key: string }).pipeline_key, 'hyperframes_template');
    assert.equal((render.json as { status: string }).status, 'queued');
    assert.ok((render.json as { id: string }).id);
  });
});