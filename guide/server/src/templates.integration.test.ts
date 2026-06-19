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

async function createTemplate() {
  const res = await request('POST', '/api/templates', {
    name: 'Lifecycle Template',
    type: 'training',
    description: 'template lifecycle',
  });
  assert.equal(res.status, 201);
  return res.json as { id: string; status: string; version: number; dsl_json: any };
}

describe('template lifecycle API', () => {
  before(async () => {
    process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'template-api-'));
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
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    closeDb();
    delete process.env.DATA_DIR;
    delete process.env.DISABLE_RENDER_WORKER;
  });

  it('creates templates with the production editor DSL defaults', async () => {
    const template = await createTemplate();
    const dsl = template.dsl_json;

    assert.equal(dsl.meta.id, template.id);
    assert.equal(dsl.meta.name, 'Lifecycle Template');
    assert.equal(dsl.meta.type, 'training');
    assert.equal(dsl.meta.description, 'template lifecycle');
    assert.equal(dsl.meta.status, 'draft');
    assert.equal(dsl.globalConfig.canvas_width, 1080);
    assert.equal(dsl.globalConfig.canvas_height, 1920);
    assert.equal(dsl.globalConfig.background_color, '#f6f6f6');
    assert.equal(dsl.globalConfig.bgm_enabled, false);
    assert.equal(dsl.globalConfig.bgm_loop, true);
    assert.equal(dsl.globalConfig.transition_enabled, false);
    assert.equal(dsl.globalConfig.brand_color, '#4f46e5');
    assert.equal(dsl.globalConfig.output_resolution, '1080p');
    assert.equal(dsl.globalConfig.aspect_ratio, '9:16');
    assert.equal(dsl.segments.length, 1);
    assert.equal(dsl.segments[0].layout, 'avatar-center');
    assert.equal(dsl.segments[0].avatar_id, '');
    assert.equal(dsl.segments[0].voice_id, '');
    assert.deepEqual(dsl.segments[0].diagnostics, []);
    assert.deepEqual(dsl.segments[0].objects, []);
  });

  it('enforces controlled status transitions and synchronizes DSL metadata', async () => {
    const template = await createTemplate();
    assert.equal(template.status, 'draft');
    assert.equal(template.version, 1);
    assert.equal(template.dsl_json.meta.status, 'draft');

    const invalidStatus = await request('PATCH', `/api/templates/${template.id}/status`, {
      status: 'archived',
    });
    assert.equal(invalidStatus.status, 400);

    const invalidTransition = await request('PATCH', `/api/templates/${template.id}/status`, {
      status: 'offline',
    });
    assert.equal(invalidTransition.status, 409);
    assert.deepEqual((invalidTransition.json as { allowed_statuses: string[] }).allowed_statuses, ['pending', 'published']);

    const pending = await request('PATCH', `/api/templates/${template.id}/status`, {
      status: 'pending',
    });
    assert.equal(pending.status, 200);
    assert.equal((pending.json as { status: string }).status, 'pending');
    assert.equal((pending.json as { version: number }).version, 1);
    assert.equal((pending.json as { dsl_json: any }).dsl_json.meta.status, 'pending');

    const published = await request('PATCH', `/api/templates/${template.id}/status`, {
      status: 'published',
    });
    assert.equal(published.status, 200);
    const publishedBody = published.json as { status: string; version: number; published_at: string; dsl_json: any };
    assert.equal(publishedBody.status, 'published');
    assert.equal(publishedBody.version, 2);
    assert.match(publishedBody.published_at, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(publishedBody.dsl_json.meta.status, 'published');
    assert.equal(publishedBody.dsl_json.meta.version, 2);
    assert.match(publishedBody.dsl_json.meta.updatedAt, /^\d{4}-\d{2}-\d{2}T/);

    const offline = await request('PATCH', `/api/templates/${template.id}/status`, {
      status: 'offline',
    });
    assert.equal(offline.status, 200);
    assert.equal((offline.json as { status: string }).status, 'offline');
    assert.equal((offline.json as { version: number }).version, 2);
    assert.equal((offline.json as { published_at: string }).published_at, publishedBody.published_at);
  });

  it('filters e2e templates when exclude_e2e=1 and reports meta counts', async () => {
    const e2e = await request('POST', '/api/templates', {
      name: 'E2E Filter Test',
      type: 'e2e',
      description: 'browser smoke',
    });
    assert.equal(e2e.status, 201);

    const ops = await request('POST', '/api/templates', {
      name: 'Ops Template',
      type: '新品发布',
      description: 'operator template',
    });
    assert.equal(ops.status, 201);

    const filtered = await request('GET', '/api/templates?exclude_e2e=1&with_meta=1');
    assert.equal(filtered.status, 200);
    const body = filtered.json as { items: Array<{ type: string; name: string }>; meta: { e2e_count: number } };
    assert.ok(body.items.every((t) => t.type !== 'e2e'));
    assert.ok(body.items.some((t) => t.name === 'Ops Template'));
    assert.equal(body.meta.e2e_count, 1);

    const all = await request('GET', '/api/templates?include_e2e=1&q=E2E%20Filter');
    assert.equal(all.status, 200);
    const allItems = all.json as Array<{ name: string }>;
    assert.equal(allItems.length, 1);
    assert.equal(allItems[0].name, 'E2E Filter Test');
  });

  it('lists templates with brand_pack_id and brand_pack_name from dsl', async () => {
    const { getDb } = await import('./db/database.js');
    const db = getDb();
    db.prepare(
      `INSERT INTO library_items (id, category, name, description, tags, file_url, parent_id, payload_json)
       VALUES (?, 'brand', ?, '', '', '', '', '{}')`,
    ).run('brand-list-test', '列表品牌包');

    const created = await request('POST', '/api/templates', {
      name: 'Brand Bound Template',
      type: '新品发布',
      description: 'has brand',
    });
    assert.equal(created.status, 201);
    const template = created.json as { id: string; dsl_json: { meta: Record<string, unknown>; globalConfig: Record<string, unknown> } };
    template.dsl_json.meta.brand_pack_id = 'brand-list-test';
    template.dsl_json.globalConfig.brand_pack_id = 'brand-list-test';
    const saved = await request('PUT', `/api/templates/${template.id}`, { dsl_json: template.dsl_json });
    assert.equal(saved.status, 200);

    const list = await request('GET', '/api/templates?with_meta=1&q=Brand%20Bound');
    assert.equal(list.status, 200);
    const item = (list.json as { items: Array<{ brand_pack_id?: string; brand_pack_name?: string; name: string }> }).items
      .find((t) => t.name === 'Brand Bound Template');
    assert.ok(item);
    assert.equal(item!.brand_pack_id, 'brand-list-test');
    assert.equal(item!.brand_pack_name, '列表品牌包');
  });

  it('filters templates by brand_pack_id and brand_unbound', async () => {
    const { getDb } = await import('./db/database.js');
    const db = getDb();
    db.prepare(
      `INSERT INTO library_items (id, category, name, description, tags, file_url, parent_id, payload_json)
       VALUES (?, 'brand', ?, '', '', '', '', '{}')`,
    ).run('brand-filter-a', '筛选品牌A');

    const bound = await request('POST', '/api/templates', {
      name: 'Filter Bound Template',
      type: '新品发布',
    });
    assert.equal(bound.status, 201);
    const boundTpl = bound.json as { id: string; dsl_json: { meta: Record<string, unknown>; globalConfig: Record<string, unknown> } };
    boundTpl.dsl_json.meta.brand_pack_id = 'brand-filter-a';
    boundTpl.dsl_json.globalConfig.brand_pack_id = 'brand-filter-a';
    await request('PUT', `/api/templates/${boundTpl.id}`, { dsl_json: boundTpl.dsl_json });

    const unbound = await request('POST', '/api/templates', {
      name: 'Filter Unbound Template',
      type: '新品发布',
    });
    assert.equal(unbound.status, 201);

    const byBrand = await request('GET', '/api/templates?brand_pack_id=brand-filter-a&with_meta=1');
    assert.equal(byBrand.status, 200);
    const byBrandItems = (byBrand.json as { items: Array<{ name: string }> }).items;
    assert.ok(byBrandItems.some((t) => t.name === 'Filter Bound Template'));
    assert.ok(!byBrandItems.some((t) => t.name === 'Filter Unbound Template'));

    const onlyUnbound = await request('GET', '/api/templates?brand_unbound=1&with_meta=1&q=Filter');
    assert.equal(onlyUnbound.status, 200);
    const unboundBody = onlyUnbound.json as { items: Array<{ name: string }>; meta: { unbound_brand_count: number } };
    assert.ok(unboundBody.items.some((t) => t.name === 'Filter Unbound Template'));
    assert.ok(!unboundBody.items.some((t) => t.name === 'Filter Bound Template'));
    assert.ok(unboundBody.meta.unbound_brand_count >= 1);
  });

  it('keeps legacy PUT status updates validated', async () => {
    const template = await createTemplate();
    const invalid = await request('PUT', `/api/templates/${template.id}`, {
      status: 'archived',
    });
    assert.equal(invalid.status, 400);

    const valid = await request('PUT', `/api/templates/${template.id}`, {
      status: 'pending',
      description: 'updated',
    });
    assert.equal(valid.status, 200);
    assert.equal((valid.json as { status: string }).status, 'pending');
    assert.equal((valid.json as { description: string }).description, 'updated');
  });
});
