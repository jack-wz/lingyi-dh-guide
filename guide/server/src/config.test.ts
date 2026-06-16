import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

type JsonValue = Record<string, unknown> | unknown[];

let server: Server;
let baseUrl = '';
let closeDb: () => void;
let dataDir = '';

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

describe('config diagnostics', () => {
  before(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'config-api-'));
    process.env.DATA_DIR = dataDir;
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

  it('reports provider readiness without exposing secrets and uses DATA_DIR config', async () => {
    const initial = await request('GET', '/api/config/diagnostics');
    assert.equal(initial.status, 200);
    const initialProviders = (initial.json as { providers: Array<{ key: string; configured: boolean }> }).providers;
    assert.equal(initialProviders.find((p) => p.key === 'yuntts')?.configured, false);
    assert.equal(initialProviders.find((p) => p.key === 'kie')?.configured, false);
    assert.equal(initialProviders.find((p) => p.key === 'wavespeed')?.configured, false);

    const saved = await request('PUT', '/api/config', {
      models: {
        kie: { api_key: 'kie-secret-123456789' },
        yuntts: { api_key: 'yuntts-secret-123456789' },
        wavespeed: { api_key: 'wavespeed-secret-123456789' },
      },
    });
    assert.equal(saved.status, 200);
    assert.equal(existsSync(join(dataDir, 'config.json')), true);
    assert.match(readFileSync(join(dataDir, 'config.json'), 'utf-8'), /kie-secret-123456789/);

    const diagnostics = await request('GET', '/api/config/diagnostics');
    assert.equal(diagnostics.status, 200);
    const body = diagnostics.json as {
      data_dir: string;
      providers: Array<{ key: string; configured: boolean; base_url: string }>;
      pipelines: Record<string, { blockers: string[]; warnings: string[]; provider_keys: string[] }>;
      avatar: { provider: string; wavespeed_model: string; configured: boolean };
    };
    assert.equal(body.data_dir, dataDir);
    assert.equal(body.providers.find((p) => p.key === 'kie')?.configured, true);
    assert.equal(body.providers.find((p) => p.key === 'yuntts')?.configured, true);
    assert.equal(body.providers.find((p) => p.key === 'wavespeed')?.configured, true);
    assert.equal(JSON.stringify(body).includes('secret-123456789'), false);
    assert.deepEqual(body.pipelines.standard.provider_keys, ['kie', 'yuntts', 'wavespeed', 'ffmpeg']);
    assert.ok(Array.isArray(body.pipelines.standard.blockers));
    assert.ok(Array.isArray(body.pipelines.digital_human.warnings));
    assert.equal(body.avatar.provider, 'wavespeed');
    assert.equal(body.avatar.wavespeed_model, 'infinitetalk');
    assert.equal(body.avatar.configured, true);

    const kieAvatar = await request('PATCH', '/api/config/pipeline', { avatar_provider: 'kie' });
    assert.equal(kieAvatar.status, 200);
    const afterKie = await request('GET', '/api/config/diagnostics');
    const avatarAfter = (afterKie.json as { avatar: { provider: string; configured: boolean } }).avatar;
    assert.equal(avatarAfter.provider, 'kie');
    assert.equal(avatarAfter.configured, true);
  });
});
