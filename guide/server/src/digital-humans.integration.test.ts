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

async function createDigitalHuman(name = 'Presenter') {
  const created = await request('POST', '/api/digital-humans', { name });
  assert.equal(created.status, 201);
  return created.json as { id: string; status: string };
}

async function attachAssets(id: string) {
  const updated = await request('PUT', `/api/digital-humans/${id}`, {
    face_photo_url: '/uploads/face.png',
    half_body_photo_url: '/uploads/half.png',
    full_body_photo_url: '/uploads/full.png',
    voice_sample_url: '/uploads/voice.wav',
  });
  assert.equal(updated.status, 200);
  return updated.json as { id: string; status: string };
}

describe('digital human training lifecycle API', () => {
  before(async () => {
    process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'digital-human-api-'));
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
    delete process.env.DIGITAL_HUMAN_TRAINING_MODE;
  });

  it('starts new records in pending_assets and reports missing training assets', async () => {
    const human = await createDigitalHuman('Needs Assets');
    assert.equal(human.status, 'pending_assets');

    const invalidStatus = await request('PUT', `/api/digital-humans/${human.id}`, {
      status: 'archived',
    });
    assert.equal(invalidStatus.status, 400);
    assert.match((invalidStatus.json as { error: string }).error, /Invalid status/);

    const trained = await request('POST', `/api/digital-humans/${human.id}/train`, {});
    assert.equal(trained.status, 400);
    assert.match((trained.json as { error: string }).error, /缺少素材/);
    assert.equal((trained.json as { digital_human: { status: string } }).digital_human.status, 'pending_assets');
    assert.match((trained.json as { digital_human: { training_error: string } }).digital_human.training_error, /声音样本/);
  });

  it('marks complete local asset packs as ready with explicit local model ids', async () => {
    const human = await createDigitalHuman('Local Ready');
    await attachAssets(human.id);

    const trained = await request('POST', `/api/digital-humans/${human.id}/train`, {});
    assert.equal(trained.status, 200);
    const body = trained.json as {
      status: string;
      provider_job_id: string;
      voice_clone_id: string;
      image_model_id: string;
      training_error: string;
      last_trained_at: string;
    };
    assert.equal(body.status, 'ready');
    assert.equal(body.provider_job_id, 'local-assets');
    assert.equal(body.voice_clone_id, `local-voice:${human.id}`);
    assert.equal(body.image_model_id, `local-image:${human.id}`);
    assert.equal(body.training_error, '');
    assert.match(body.last_trained_at, /^\d{4}-\d{2}-\d{2}/);
  });

  it('supports async provider training callbacks for ready and failed outcomes', async () => {
    const human = await createDigitalHuman('Async Ready');
    await attachAssets(human.id);

    const queued = await request('POST', `/api/digital-humans/${human.id}/train`, {
      provider: 'heygen',
      provider_job_id: 'heygen-job-1',
    });
    assert.equal(queued.status, 202);
    assert.equal((queued.json as { status: string }).status, 'training');
    assert.equal((queued.json as { provider_job_id: string }).provider_job_id, 'heygen-job-1');

    const invalidReady = await request('POST', `/api/digital-humans/${human.id}/training-status`, {
      status: 'ready',
    });
    assert.equal(invalidReady.status, 400);
    assert.match((invalidReady.json as { error: string }).error, /voice_clone_id/);

    const ready = await request('POST', `/api/digital-humans/${human.id}/training-status`, {
      status: 'ready',
      voice_clone_id: 'voice-provider-1',
      image_model_id: 'image-provider-1',
    });
    assert.equal(ready.status, 200);
    assert.equal((ready.json as { status: string }).status, 'ready');
    assert.equal((ready.json as { voice_clone_id: string }).voice_clone_id, 'voice-provider-1');
    assert.equal((ready.json as { image_model_id: string }).image_model_id, 'image-provider-1');
    assert.equal((ready.json as { training_error: string }).training_error, '');

    const failedHuman = await createDigitalHuman('Async Failed');
    await attachAssets(failedHuman.id);
    const training = await request('POST', `/api/digital-humans/${failedHuman.id}/train`, {
      provider: 'heygen',
      provider_job_id: 'heygen-job-2',
    });
    assert.equal(training.status, 202);

    const invalidFailed = await request('POST', `/api/digital-humans/${failedHuman.id}/training-status`, {
      status: 'failed',
    });
    assert.equal(invalidFailed.status, 400);
    assert.match((invalidFailed.json as { error: string }).error, /error_message/);

    const failed = await request('POST', `/api/digital-humans/${failedHuman.id}/training-status`, {
      status: 'failed',
      error_message: 'provider rejected face asset',
    });
    assert.equal(failed.status, 200);
    assert.equal((failed.json as { status: string }).status, 'failed');
    assert.match((failed.json as { training_error: string }).training_error, /provider rejected/);
  });
});
