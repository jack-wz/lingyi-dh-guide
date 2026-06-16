import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

let server: Server;
let baseUrl = '';
let closeDb: () => void;

describe('tasks API', () => {
  before(async () => {
    process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'guide-tasks-test-'));
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

  it('returns active render and training tasks', async () => {
    const { getDb } = await import('./db/database.js');
    const db = getDb();
    db.prepare(
      `INSERT INTO digital_humans (id, name, status) VALUES ('dh-active', '测试数字人', 'training')`,
    ).run();
    db.prepare(
      `INSERT INTO templates (id, name, type, dsl_json, status)
       VALUES ('tpl-1', '测试模板', 'training', '{}', 'draft')`,
    ).run();
    db.prepare(
      `INSERT INTO render_jobs (id, template_id, digital_human_id, status, stage, progress)
       VALUES ('job-active', 'tpl-1', 'dh-active', 'video_gen', 'video_gen', 55)`,
    ).run();

    const res = await fetch(`${baseUrl}/api/tasks?scope=active`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.items.length >= 2);
    assert.ok(body.items.some((item: { task_type: string }) => item.task_type === 'render'));
    assert.ok(body.items.some((item: { task_type: string }) => item.task_type === 'dh_training'));
  });
});