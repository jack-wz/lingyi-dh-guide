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

describe('motion resource packs + AI orchestration API', () => {
  before(async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'motion-pack-'));
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

  it('GET /api/motion/packs returns full compliant catalog', async () => {
    const { status, json } = await request('GET', '/api/motion/packs');
    assert.equal(status, 200);
    assert.equal(json.counts.shot_template, 12);
    assert.equal(json.counts.subtitle_system, 8);
    assert.equal(json.counts.motion_effect, 20);
    assert.equal(json.counts.transition, 12);
    assert.equal(json.counts.sfx, 24);
    assert.equal(json.counts.bgm_group, 8);
    assert.equal(json.counts.brand_pack, 4);
    assert.equal(json.total, 88);
    assert.equal(json.compliance_ok, true);
    assert.deepEqual(json.compliance_problems, []);
  });

  it('GET /api/motion/recipes exposes the registry', async () => {
    const { status, json } = await request('GET', '/api/motion/recipes');
    assert.equal(status, 200);
    assert.equal(json.total, 6);
    const svgRecipe = json.recipes.find((r: any) => r.id === 'svg_to_lottie');
    assert.ok(svgRecipe.required_asset_writeback);
  });

  it('POST /api/motion/gaps detects missing scene/subtitle', async () => {
    const dsl = { segments: [{ id: '1', type: 'narration', scene_image_url: '', narration_text: 'x'.repeat(80), voice_id: '', subtitle: { style_id: '' }, digital_human: { enabled: false } }] };
    const { status, json } = await request('POST', '/api/motion/gaps', { dsl });
    assert.equal(status, 200);
    assert.ok(json.gaps.some((g: any) => g.fill === '场景图'));
    assert.match(json.oneLine, /将 AI 补/);
  });

  it('POST /api/motion/proposal returns adoptable brief then adopt', async () => {
    const p = await request('POST', '/api/motion/proposal', { topic: '飞鹤奶粉营养对比 价格优惠', brand_category: '食品', segment_count: 5 });
    assert.equal(p.status, 201);
    assert.equal(p.json.brief.shotCount, 5);
    assert.ok(p.json.brief.recommendedPacks.length);
    const a = await request('POST', '/api/motion/proposal/adopt', { brief: p.json.brief });
    assert.equal(a.status, 200);
    assert.equal(a.json.adopted, true);
    assert.ok(a.json.writeback_rule.includes('写回'));
  });

  it('POST /api/motion/writeback-check enforces asset_id', async () => {
    const bad = await request('POST', '/api/motion/writeback-check', { result: { file_url: '/tmp/x.webm' }, recipe_id: 'svg_to_lottie' });
    assert.equal(bad.json.ok, false);
    const ok = await request('POST', '/api/motion/writeback-check', { result: { asset_id: 'a1' }, recipe_id: 'svg_to_lottie' });
    assert.equal(ok.json.ok, true);
  });
});