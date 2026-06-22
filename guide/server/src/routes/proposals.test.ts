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
let projectId = '';

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

const validBrief = {
  product_name: '飞鹤奶粉',
  audience: '25-35岁宝妈',
  goal: '促进购买转化',
  selling_points: ['高钙', '易吸收', '品牌信赖'],
  offer: '满299减50',
  cta: '立即购买',
  platform: 'douyin',
  target_duration_sec: 30,
  aspect_ratio: '9:16',
  tone: '专业温暖',
  language: 'zh',
  required_disclaimers: ['婴幼儿配方乳粉产品广告'],
  banned_words: ['最好', '第一'],
};

async function setupProject(): Promise<string> {
  process.env.ENABLE_PROJECT_WORKFLOW = '1';
  process.env.ENABLE_PROPOSAL_GATE = '1';
  const { json: tpl } = await request('POST', '/api/templates', { name: 'proposal-test' });
  templateId = tpl.id;
  await request('PUT', `/api/templates/${templateId}`, {
    dsl_json: {
      segments: [
        { id: 's1', narration_text: '了解飞鹤奶粉', duration_sec: 5, scene_image_url: '' },
        { id: 's2', narration_text: '高钙易吸收', duration_sec: 6, scene_image_url: 'http://x.com/a.png' },
      ],
      meta: {},
      globalConfig: { brand_pack: { frames: [{ frame_template_id: 'close-up' }] } },
    },
  });
  const { json: proj } = await request('POST', '/api/projects', { template_id: templateId, name: 'Proposal Test' });
  return proj.id;
}

describe('proposal & preflight API (ENABLE_PROPOSAL_GATE)', () => {
  before(async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'proposals-api-'));
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

  it('rejects proposal API when flag is off', async () => {
    delete process.env.ENABLE_PROPOSAL_GATE;
    const { status } = await request('POST', '/api/projects/x/propose', { brief: validBrief });
    assert.equal(status, 400);
  });

  it('generates a proposal without modifying project DSL', async () => {
    projectId = await setupProject();
    const beforeProject = await request('GET', `/api/projects/${projectId}`);

    const { status, json } = await request('POST', `/api/projects/${projectId}/propose`, { brief: validBrief });
    assert.equal(status, 201);
    assert.ok(json.id);
    assert.equal(json.status, 'pending');
    assert.ok(json.proposal.shots.length > 0);
    assert.ok(json.proposal.estimated_duration > 0);
    assert.ok(json.proposal.asset_needs.length > 0);
    assert.ok(json.proposal.selling_point_distribution.length > 0);

    const afterProject = await request('GET', `/api/projects/${projectId}`);
    assert.equal(afterProject.json.current_dsl_json, beforeProject.json.current_dsl_json);
  });

  it('adopts a proposal and creates a new project version', async () => {
    const { json: proposal } = await request('POST', `/api/projects/${projectId}/propose`, { brief: validBrief });
    const beforeProject = await request('GET', `/api/projects/${projectId}`);

    const { status, json } = await request('POST', `/api/projects/${projectId}/proposals/${proposal.id}/adopt`);
    assert.equal(status, 200);
    assert.equal(json.status, 'adopted');
    assert.ok(json.adopted_version_id);

    const afterProject = await request('GET', `/api/projects/${projectId}`);
    assert.notEqual(afterProject.json.current_version_id, beforeProject.json.current_version_id);
  });

  it('adopt is idempotent', async () => {
    const { json: proposal } = await request('POST', `/api/projects/${projectId}/propose`, { brief: validBrief });
    const r1 = await request('POST', `/api/projects/${projectId}/proposals/${proposal.id}/adopt`);
    const r2 = await request('POST', `/api/projects/${projectId}/proposals/${proposal.id}/adopt`);
    assert.equal(r1.status, 200);
    assert.equal(r2.status, 200);
    assert.equal(r1.json.adopted_version_id, r2.json.adopted_version_id);
  });

  it('preflight detects blockers and warnings', async () => {
    const { status, json } = await request('POST', `/api/projects/${projectId}/preflight`, { brief: validBrief });
    assert.equal(status, 200);
    assert.ok(Array.isArray(json.blockers));
    assert.ok(Array.isArray(json.warnings));
    assert.ok(typeof json.estimated_duration === 'number');
    assert.ok(typeof json.ready === 'boolean');
  });

  it('brief validation rejects missing fields', async () => {
    const { status, json } = await request('POST', `/api/projects/${projectId}/propose`, {
      brief: { product_name: '', audience: '' },
    });
    assert.equal(status, 400);
    assert.ok(json.error.includes('required'));
  });
});
