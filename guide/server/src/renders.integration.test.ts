import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type Database from 'better-sqlite3';

type JsonValue = Record<string, unknown> | unknown[];

let server: Server;
let baseUrl = '';
let closeDb: () => void;
let getDb: () => Database.Database;

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
    name: 'Integration Template',
    type: 'test',
    description: 'render integration',
  });
  assert.equal(res.status, 201);
  return res.json as { id: string };
}

async function createReadyDigitalHuman() {
  const created = await request('POST', '/api/digital-humans', { name: 'Ready Presenter' });
  assert.equal(created.status, 201);
  const id = (created.json as { id: string }).id;
  const updated = await request('PUT', `/api/digital-humans/${id}`, {
    face_photo_url: '/uploads/face.png',
    half_body_photo_url: '/uploads/half.png',
    full_body_photo_url: '/uploads/full.png',
    voice_sample_url: '/uploads/voice.wav',
  });
  assert.equal(updated.status, 200);
  const trained = await request('POST', `/api/digital-humans/${id}/train`, { provider: 'local-assets' });
  assert.equal(trained.status, 200);
  assert.equal((trained.json as { status: string }).status, 'ready');
  return id;
}

function writeRenderArtifacts(id: string, outputName = `${id}.mp4`) {
  const renderDir = join(process.env.DATA_DIR || '', 'renders');
  const workDir = join(renderDir, `job_${id}`);
  const outputPath = join(renderDir, outputName);
  mkdirSync(workDir, { recursive: true });
  mkdirSync(renderDir, { recursive: true });
  writeFileSync(join(workDir, 'stage.log'), 'worker artifacts');
  writeFileSync(outputPath, 'video bytes');
  return { workDir, outputPath, outputUrl: `/renders/${outputName}` };
}

describe('render API integration', () => {
  before(async () => {
    process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'render-api-'));
    process.env.DISABLE_RENDER_WORKER = '1';
    process.env.DIGITAL_HUMAN_TRAINING_PROVIDER = 'local-assets';

    const appModule = await import('./app.js');
    const dbModule = await import('./db/database.js');
    closeDb = dbModule.closeDb;
    getDb = dbModule.getDb;

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
    delete process.env.DIGITAL_HUMAN_TRAINING_PROVIDER;
  });

  it('creates, claims, updates, logs, cancels, and duplicates a standard render job', async () => {
    const template = await createTemplate();

    const created = await request('POST', '/api/renders', {
      template_id: template.id,
      pipeline_key: 'standard',
      input_mode: 'topic',
      topic: 'Safety training',
      variables: { brand: 'Acme' },
      max_retries: 2,
    });

    assert.equal(created.status, 201);
    assert.equal((created.json as { status: string }).status, 'queued');
    assert.equal((created.json as { pipeline_key: string }).pipeline_key, 'standard');
    assert.equal((created.json as { input_mode: string }).input_mode, 'topic');
    assert.equal((created.json as { output_exists: boolean }).output_exists, false);

    const claimed = await request('GET', '/api/renders/next?worker_id=test-worker');
    assert.equal(claimed.status, 200);
    assert.equal((claimed.json as { id: string }).id, (created.json as { id: string }).id);
    assert.equal((claimed.json as { status: string }).status, 'parsing');
    assert.equal((claimed.json as { stage: string }).stage, 'parsing');
    assert.equal((claimed.json as { worker_id: string }).worker_id, 'test-worker');
    const claimedDsl = (claimed.json as { template_dsl: any }).template_dsl;
    assert.equal(claimedDsl.meta.input_mode, 'topic');
    assert.equal(claimedDsl.segments.length, 4);
    assert.match(claimedDsl.segments[0].narration_text, /Safety training/);
    assert.match(claimedDsl.segments[0].diagnostics.at(-1), /主题模式/);

    const afterClaim = await request('GET', `/api/renders/${(created.json as { id: string }).id}`);
    assert.equal((afterClaim.json as { status: string }).status, 'parsing');
    assert.equal((afterClaim.json as { worker_id: string }).worker_id, 'test-worker');

    const patched = await request('PATCH', `/api/renders/${(created.json as { id: string }).id}`, {
      status: 'video_gen',
      stage: 'video_gen',
      progress: 42,
      heartbeat: true,
      worker_id: 'test-worker',
    });
    assert.equal(patched.status, 200);
    assert.equal((patched.json as { status: string }).status, 'video_gen');
    assert.equal((patched.json as { progress: number }).progress, 42);

    const log = await request('POST', `/api/renders/${(created.json as { id: string }).id}/logs`, {
      level: 'info',
      message: 'progress mapped',
    });
    assert.equal(log.status, 200);

    const logs = await request('GET', `/api/renders/${(created.json as { id: string }).id}/logs`);
    assert.equal(logs.status, 200);
    assert.equal((logs.json as Array<{ message: string }>).at(-1)?.message, 'progress mapped');

    const cancelled = await request('POST', `/api/renders/${(created.json as { id: string }).id}/cancel`, {});
    assert.equal(cancelled.status, 200);
    assert.equal((cancelled.json as { status: string }).status, 'cancelling');
    assert.equal(Boolean((cancelled.json as { cancel_requested: number }).cancel_requested), true);

    const cancelConflict = await request('PATCH', `/api/renders/${(created.json as { id: string }).id}`, {
      status: 'completed',
      stage: 'completed',
      progress: 100,
    });
    assert.equal(cancelConflict.status, 409);

    const duplicate = await request('POST', `/api/renders/${(created.json as { id: string }).id}/duplicate`, {});
    assert.equal(duplicate.status, 201);
    assert.equal((duplicate.json as { status: string }).status, 'queued');
    assert.equal((duplicate.json as { parent_job_id: string }).parent_job_id, (created.json as { id: string }).id);
  });

  it('validates pipeline selection and digital-human readiness before enqueueing', async () => {
    const template = await createTemplate();

    const unknownPipeline = await request('POST', '/api/renders', {
      template_id: template.id,
      pipeline_key: 'motion_transfer',
    });
    assert.equal(unknownPipeline.status, 400);
    assert.match((unknownPipeline.json as { error: string }).error, /Unknown pipeline_key/);

    const unknownInputMode = await request('POST', '/api/renders', {
      template_id: template.id,
      pipeline_key: 'standard',
      input_mode: 'batch',
    });
    assert.equal(unknownInputMode.status, 400);
    assert.match((unknownInputMode.json as { error: string }).error, /Unknown input_mode/);

    const missingTopic = await request('POST', '/api/renders', {
      template_id: template.id,
      pipeline_key: 'standard',
      input_mode: 'topic',
    });
    assert.equal(missingTopic.status, 400);
    assert.match((missingTopic.json as { error: string }).error, /topic is required/);

    const missingScript = await request('POST', '/api/renders', {
      template_id: template.id,
      pipeline_key: 'standard',
      input_mode: 'script',
    });
    assert.equal(missingScript.status, 400);
    assert.match((missingScript.json as { error: string }).error, /script_text is required/);

    const missingDigitalHuman = await request('POST', '/api/renders', {
      template_id: template.id,
      pipeline_key: 'digital_human',
    });
    assert.equal(missingDigitalHuman.status, 400);
    assert.match((missingDigitalHuman.json as { error: string }).error, /digital_human_id is required/);

    const digitalHumanId = await createReadyDigitalHuman();
    const accepted = await request('POST', '/api/renders', {
      template_id: template.id,
      pipeline_key: 'digital_human',
      digital_human_id: digitalHumanId,
      input_mode: 'template',
    });
    assert.equal(accepted.status, 201);
    assert.equal((accepted.json as { pipeline_key: string }).pipeline_key, 'digital_human');
    assert.equal((accepted.json as { digital_human_id: string }).digital_human_id, digitalHumanId);
  });

  it('retries failed or cancelled jobs and respects retry limits', async () => {
    const template = await createTemplate();
    const created = await request('POST', '/api/renders', {
      template_id: template.id,
      pipeline_key: 'standard',
      max_retries: 1,
    });
    assert.equal(created.status, 201);
    const id = (created.json as { id: string }).id;

    const failed = await request('PATCH', `/api/renders/${id}`, {
      status: 'failed',
      stage: 'failed',
      error_message: 'provider timeout',
    });
    assert.equal(failed.status, 200);

    const retry = await request('POST', `/api/renders/${id}/retry`, {});
    assert.equal(retry.status, 201);
    assert.equal((retry.json as { status: string }).status, 'queued');
    assert.equal((retry.json as { retry_count: number }).retry_count, 1);
    assert.equal((retry.json as { parent_job_id: string }).parent_job_id, id);

    const retryId = (retry.json as { id: string }).id;
    const failedRetry = await request('PATCH', `/api/renders/${retryId}`, {
      status: 'failed',
      stage: 'failed',
      error_message: 'provider timeout again',
    });
    assert.equal(failedRetry.status, 200);

    const retryLimit = await request('POST', `/api/renders/${retryId}/retry`, {});
    assert.equal(retryLimit.status, 400);
    assert.match((retryLimit.json as { error: string }).error, /Retry limit reached/);
  });

  it('keeps cancelled jobs terminal during worker update races', async () => {
    const template = await createTemplate();
    const created = await request('POST', '/api/renders', {
      template_id: template.id,
      pipeline_key: 'standard',
    });
    assert.equal(created.status, 201);
    const id = (created.json as { id: string }).id;

    const cancelledQueued = await request('POST', `/api/renders/${id}/cancel`, {});
    assert.equal(cancelledQueued.status, 200);
    assert.equal((cancelledQueued.json as { status: string }).status, 'cancelled');

    const lateCompleted = await request('PATCH', `/api/renders/${id}`, {
      status: 'completed',
      stage: 'completed',
      progress: 100,
      output_url: '/renders/late/final.mp4',
    });
    assert.equal(lateCompleted.status, 409);
    assert.match((lateCompleted.json as { error: string }).error, /terminal status/);

    const afterLateCompleted = await request('GET', `/api/renders/${id}`);
    assert.equal((afterLateCompleted.json as { status: string }).status, 'cancelled');
    assert.equal((afterLateCompleted.json as { output_url: string | null }).output_url, null);

    const active = await request('POST', '/api/renders', {
      template_id: template.id,
      pipeline_key: 'standard',
    });
    assert.equal(active.status, 201);
    const activeId = (active.json as { id: string }).id;
    getDb()
      .prepare(
        `UPDATE render_jobs
         SET status = 'video_gen', stage = 'video_gen', worker_id = 'race-worker',
             started_at = datetime('now'), heartbeat_at = datetime('now')
         WHERE id = ?`
      )
      .run(activeId);

    const cancelling = await request('POST', `/api/renders/${activeId}/cancel`, {});
    assert.equal(cancelling.status, 200);
    assert.equal((cancelling.json as { status: string }).status, 'cancelling');

    const lateFailed = await request('PATCH', `/api/renders/${activeId}`, {
      status: 'failed',
      stage: 'failed',
      error_message: 'provider returned after cancel',
    });
    assert.equal(lateFailed.status, 409);
    assert.equal((lateFailed.json as { cancel_requested: boolean }).cancel_requested, true);

    const workerCancelled = await request('PATCH', `/api/renders/${activeId}`, {
      status: 'cancelled',
      stage: 'cancelled',
      error_message: 'worker observed cancel flag',
    });
    assert.equal(workerCancelled.status, 200);
    assert.equal((workerCancelled.json as { status: string }).status, 'cancelled');
    assert.match((workerCancelled.json as { error_message: string }).error_message, /worker observed cancel flag/);
  });

  it('normalizes terminal stage when worker omits it', async () => {
    const template = await createTemplate();
    const created = await request('POST', '/api/renders', {
      template_id: template.id,
      pipeline_key: 'standard',
    });
    assert.equal(created.status, 201);
    const id = (created.json as { id: string }).id;

    const failed = await request('PATCH', `/api/renders/${id}`, {
      status: 'failed',
      error_message: 'pipeline crashed before stage update',
    });
    assert.equal(failed.status, 200);
    assert.equal((failed.json as { status: string }).status, 'failed');
    assert.equal((failed.json as { stage: string }).stage, 'failed');

    const completedJob = await request('POST', '/api/renders', {
      template_id: template.id,
      pipeline_key: 'standard',
    });
    assert.equal(completedJob.status, 201);
    const completedId = (completedJob.json as { id: string }).id;
    const completed = await request('PATCH', `/api/renders/${completedId}`, {
      status: 'completed',
      progress: 100,
      output_url: '/renders/stage-normalized.mp4',
    });
    assert.equal(completed.status, 200);
    assert.equal((completed.json as { status: string }).status, 'completed');
    assert.equal((completed.json as { stage: string }).stage, 'completed');
  });

  it('validates worker updates and derives status from progress stage callbacks', async () => {
    const template = await createTemplate();
    const created = await request('POST', '/api/renders', {
      template_id: template.id,
      pipeline_key: 'standard',
    });
    assert.equal(created.status, 201);
    const id = (created.json as { id: string }).id;

    const invalidStatus = await request('PATCH', `/api/renders/${id}`, {
      status: 'rendering',
      stage: 'rendering',
    });
    assert.equal(invalidStatus.status, 400);
    assert.match((invalidStatus.json as { error: string }).error, /Unknown render status/);

    const invalidProgress = await request('PATCH', `/api/renders/${id}`, {
      progress: 120,
    });
    assert.equal(invalidProgress.status, 400);
    assert.match((invalidProgress.json as { error: string }).error, /progress/);

    const sceneProgress = await request('PATCH', `/api/renders/${id}`, {
      stage: 'scene_gen',
      progress: 25,
      heartbeat: true,
    });
    assert.equal(sceneProgress.status, 200);
    assert.equal((sceneProgress.json as { status: string }).status, 'scene_gen');
    assert.equal((sceneProgress.json as { stage: string }).stage, 'scene_gen');
    assert.equal((sceneProgress.json as { progress: number }).progress, 25);

    const assembleProgress = await request('PATCH', `/api/renders/${id}`, {
      stage: 'assemble',
      progress: 80,
    });
    assert.equal(assembleProgress.status, 200);
    assert.equal((assembleProgress.json as { status: string }).status, 'ffmpeg');
    assert.equal((assembleProgress.json as { stage: string }).stage, 'assemble');

    const invalidLog = await request('POST', `/api/renders/${id}/logs`, {
      level: 'debug',
      message: 'should not hit sqlite check constraint',
    });
    assert.equal(invalidLog.status, 400);
    assert.match((invalidLog.json as { error: string }).error, /Unknown render log level/);
  });

  it('uses the render job template DSL snapshot when templates change later', async () => {
    getDb().prepare("UPDATE render_jobs SET status = 'cancelled', stage = 'cancelled' WHERE status = 'queued'").run();

    const template = await createTemplate();
    const row = getDb().prepare('SELECT dsl_json FROM templates WHERE id = ?').get(template.id) as { dsl_json: string };
    const originalDsl = JSON.parse(row.dsl_json);
    originalDsl.segments[0].narration_text = 'snapshot original narration';
    getDb().prepare('UPDATE templates SET dsl_json = ? WHERE id = ?').run(JSON.stringify(originalDsl), template.id);

    const created = await request('POST', '/api/renders', {
      template_id: template.id,
      pipeline_key: 'standard',
    });
    assert.equal(created.status, 201);
    const id = (created.json as { id: string }).id;

    const mutatedDsl = JSON.parse(JSON.stringify(originalDsl));
    mutatedDsl.segments[0].narration_text = 'mutated template narration';
    getDb().prepare('UPDATE templates SET dsl_json = ? WHERE id = ?').run(JSON.stringify(mutatedDsl), template.id);

    const claimed = await request('GET', '/api/renders/next?worker_id=snapshot-worker');
    assert.equal(claimed.status, 200);
    assert.equal((claimed.json as { id: string }).id, id);
    assert.equal((claimed.json as { status: string }).status, 'parsing');
    assert.equal((claimed.json as { worker_id: string }).worker_id, 'snapshot-worker');
    const claimedDsl = (claimed.json as { template_dsl: any }).template_dsl;
    assert.equal(claimedDsl.segments[0].narration_text, 'snapshot original narration');

    const failed = await request('PATCH', `/api/renders/${id}`, {
      status: 'failed',
      error_message: 'force retry path',
    });
    assert.equal(failed.status, 200);

    const retry = await request('POST', `/api/renders/${id}/retry`, {});
    assert.equal(retry.status, 201);
    const retryId = (retry.json as { id: string }).id;
    const retryRow = getDb()
      .prepare('SELECT template_dsl_snapshot FROM render_jobs WHERE id = ?')
      .get(retryId) as { template_dsl_snapshot: string };
    assert.equal(JSON.parse(retryRow.template_dsl_snapshot).segments[0].narration_text, 'snapshot original narration');

    const duplicate = await request('POST', `/api/renders/${id}/duplicate`, {});
    assert.equal(duplicate.status, 201);
    const duplicateId = (duplicate.json as { id: string }).id;
    const duplicateRow = getDb()
      .prepare('SELECT template_dsl_snapshot FROM render_jobs WHERE id = ?')
      .get(duplicateId) as { template_dsl_snapshot: string };
    assert.equal(JSON.parse(duplicateRow.template_dsl_snapshot).segments[0].narration_text, 'snapshot original narration');
  });

  it('stores provider config snapshots for workers while redacting public job responses', async () => {
    getDb().prepare("UPDATE render_jobs SET status = 'cancelled', stage = 'cancelled' WHERE status = 'queued'").run();
    writeFileSync(join(process.env.DATA_DIR || '', 'config.json'), JSON.stringify({
      models: {
        kie: { api_key: 'kie-secret-abcdef', base_url: 'https://snapshot.kie' },
        yuntts: { api_key: 'yuntts-secret-abcdef', base_url: 'https://snapshot.yuntts' },
      },
      pipeline: { poll_interval: 9 },
      prompts: { scene_image_default: 'snapshot prompt' },
    }));

    const template = await createTemplate();
    const created = await request('POST', '/api/renders', {
      template_id: template.id,
      pipeline_key: 'standard',
    });
    assert.equal(created.status, 201);
    const id = (created.json as { id: string }).id;

    const publicJob = await request('GET', `/api/renders/${id}`);
    assert.equal(publicJob.status, 200);
    assert.equal(JSON.stringify(publicJob.json).includes('kie-secret-abcdef'), false);
    assert.match(String((publicJob.json as { provider_config_snapshot: string }).provider_config_snapshot), /kie-se\*\*\*/);

    const stored = getDb()
      .prepare('SELECT provider_config_snapshot FROM render_jobs WHERE id = ?')
      .get(id) as { provider_config_snapshot: string };
    assert.equal(JSON.parse(stored.provider_config_snapshot).models.kie.api_key, 'kie-secret-abcdef');

    const claimed = await request('GET', '/api/renders/next?worker_id=provider-snapshot-worker');
    assert.equal(claimed.status, 200);
    assert.equal((claimed.json as { id: string }).id, id);
    const workerSnapshot = JSON.parse((claimed.json as { provider_config_snapshot: string }).provider_config_snapshot);
    assert.equal(workerSnapshot.models.kie.api_key, 'kie-secret-abcdef');
    assert.equal(workerSnapshot.models.kie.base_url, 'https://snapshot.kie');
    assert.equal(workerSnapshot.pipeline.poll_interval, 9);

    const failed = await request('PATCH', `/api/renders/${id}`, {
      status: 'failed',
      error_message: 'force provider snapshot retry path',
    });
    assert.equal(failed.status, 200);
    writeFileSync(join(process.env.DATA_DIR || '', 'config.json'), JSON.stringify({
      models: {
        kie: { api_key: 'new-kie-secret-abcdef', base_url: 'https://new.kie' },
      },
      pipeline: { poll_interval: 1 },
    }));

    const retry = await request('POST', `/api/renders/${id}/retry`, {});
    assert.equal(retry.status, 201);
    const retrySnapshot = getDb()
      .prepare('SELECT provider_config_snapshot FROM render_jobs WHERE id = ?')
      .get((retry.json as { id: string }).id) as { provider_config_snapshot: string };
    assert.equal(JSON.parse(retrySnapshot.provider_config_snapshot).models.kie.api_key, 'kie-secret-abcdef');
    assert.equal(JSON.parse(retrySnapshot.provider_config_snapshot).models.kie.base_url, 'https://snapshot.kie');

    const duplicate = await request('POST', `/api/renders/${id}/duplicate`, {});
    assert.equal(duplicate.status, 201);
    const duplicateSnapshot = getDb()
      .prepare('SELECT provider_config_snapshot FROM render_jobs WHERE id = ?')
      .get((duplicate.json as { id: string }).id) as { provider_config_snapshot: string };
    assert.equal(JSON.parse(duplicateSnapshot.provider_config_snapshot).models.kie.api_key, 'kie-secret-abcdef');
    assert.equal(JSON.parse(duplicateSnapshot.provider_config_snapshot).pipeline.poll_interval, 9);
  });

  it('fails active jobs when worker heartbeat exceeds timeout', async () => {
    const template = await createTemplate();
    const created = await request('POST', '/api/renders', {
      template_id: template.id,
      pipeline_key: 'standard',
      max_retries: 1,
    });
    assert.equal(created.status, 201);
    const id = (created.json as { id: string }).id;

    getDb()
      .prepare(
        `UPDATE render_jobs
         SET status = 'video_gen', stage = 'video_gen', worker_id = 'stale-worker',
             started_at = datetime('now', '-25 minutes'), heartbeat_at = datetime('now', '-20 minutes')
         WHERE id = ?`
      )
      .run(id);

    const maintenance = await request('POST', '/api/renders/maintenance/timeouts', {
      timeout_ms: 5 * 60 * 1000,
    });
    assert.equal(maintenance.status, 200);
    assert.equal((maintenance.json as { timed_out: number }).timed_out, 1);
    assert.deepEqual((maintenance.json as { job_ids: string[] }).job_ids, [id]);

    const afterTimeout = await request('GET', `/api/renders/${id}`);
    assert.equal(afterTimeout.status, 200);
    assert.equal((afterTimeout.json as { status: string }).status, 'failed');
    assert.equal((afterTimeout.json as { stage: string }).stage, 'failed');
    assert.match((afterTimeout.json as { error_message: string }).error_message, /Worker heartbeat timeout/);

    const logs = await request('GET', `/api/renders/${id}/logs`);
    assert.equal(logs.status, 200);
    assert.match((logs.json as Array<{ message: string }>).at(-1)?.message || '', /stale-worker/);
  });

  it('deletes render jobs with logs, output files, and worker artifact directories', async () => {
    const template = await createTemplate();
    const created = await request('POST', '/api/renders', {
      template_id: template.id,
      pipeline_key: 'standard',
    });
    assert.equal(created.status, 201);
    const id = (created.json as { id: string }).id;
    const artifact = writeRenderArtifacts(id);

    const completed = await request('PATCH', `/api/renders/${id}`, {
      status: 'completed',
      stage: 'completed',
      progress: 100,
      output_url: artifact.outputUrl,
    });
    assert.equal(completed.status, 200);

    const log = await request('POST', `/api/renders/${id}/logs`, {
      level: 'info',
      message: 'completed',
    });
    assert.equal(log.status, 200);
    assert.equal(existsSync(artifact.outputPath), true);
    assert.equal(existsSync(artifact.workDir), true);

    const deleted = await request('DELETE', `/api/renders/${id}`);
    assert.equal(deleted.status, 200);
    assert.equal((deleted.json as { deleted_artifacts: boolean }).deleted_artifacts, true);
    assert.equal(existsSync(artifact.outputPath), false);
    assert.equal(existsSync(artifact.workDir), false);

    const afterDelete = await request('GET', `/api/renders/${id}`);
    assert.equal(afterDelete.status, 404);
    const logsAfterDelete = await request('GET', `/api/renders/${id}/logs`);
    assert.equal(logsAfterDelete.status, 200);
    assert.deepEqual(logsAfterDelete.json, []);
  });

  it('does not remove files outside the render artifact directory when output_url is malformed', async () => {
    const template = await createTemplate();
    const keepPath = join(process.env.DATA_DIR || '', 'keep.mp4');
    writeFileSync(keepPath, 'keep me');

    const created = await request('POST', '/api/renders', {
      template_id: template.id,
      pipeline_key: 'standard',
    });
    assert.equal(created.status, 201);
    const id = (created.json as { id: string }).id;
    const artifact = writeRenderArtifacts(id);

    const completed = await request('PATCH', `/api/renders/${id}`, {
      status: 'completed',
      stage: 'completed',
      output_url: '/renders/../keep.mp4',
    });
    assert.equal(completed.status, 200);

    const deleted = await request('DELETE', `/api/renders/${id}`);
    assert.equal(deleted.status, 200);
    assert.equal(existsSync(artifact.workDir), false);
    assert.equal(existsSync(keepPath), true);
  });

  it('cleans render artifacts when deleting parent templates and digital humans', async () => {
    const template = await createTemplate();
    const standard = await request('POST', '/api/renders', {
      template_id: template.id,
      pipeline_key: 'standard',
    });
    assert.equal(standard.status, 201);
    const standardId = (standard.json as { id: string }).id;
    const standardArtifact = writeRenderArtifacts(standardId);
    const completedStandard = await request('PATCH', `/api/renders/${standardId}`, {
      status: 'completed',
      stage: 'completed',
      output_url: standardArtifact.outputUrl,
    });
    assert.equal(completedStandard.status, 200);

    const deletedTemplate = await request('DELETE', `/api/templates/${template.id}`);
    assert.equal(deletedTemplate.status, 200);
    assert.equal((deletedTemplate.json as { deleted_artifacts: number }).deleted_artifacts, 1);
    assert.equal(existsSync(standardArtifact.outputPath), false);
    assert.equal(existsSync(standardArtifact.workDir), false);
    assert.equal((await request('GET', `/api/renders/${standardId}`)).status, 404);

    const digitalTemplate = await createTemplate();
    const digitalHumanId = await createReadyDigitalHuman();
    const digital = await request('POST', '/api/renders', {
      template_id: digitalTemplate.id,
      pipeline_key: 'digital_human',
      digital_human_id: digitalHumanId,
    });
    assert.equal(digital.status, 201);
    const digitalId = (digital.json as { id: string }).id;
    const digitalArtifact = writeRenderArtifacts(digitalId);
    const completedDigital = await request('PATCH', `/api/renders/${digitalId}`, {
      status: 'completed',
      stage: 'completed',
      output_url: digitalArtifact.outputUrl,
    });
    assert.equal(completedDigital.status, 200);

    const deletedHuman = await request('DELETE', `/api/digital-humans/${digitalHumanId}`);
    assert.equal(deletedHuman.status, 200);
    assert.equal((deletedHuman.json as { deleted_artifacts: number }).deleted_artifacts, 1);
    assert.equal(existsSync(digitalArtifact.outputPath), false);
    assert.equal(existsSync(digitalArtifact.workDir), false);
    assert.equal((await request('GET', `/api/renders/${digitalId}`)).status, 404);
  });

  it('lists render jobs with pagination and template_name', async () => {
    const template = await createTemplate();
    for (let i = 0; i < 3; i += 1) {
      const created = await request('POST', '/api/renders', {
        template_id: template.id,
        pipeline_key: 'standard',
        input_mode: 'template',
        variables: {},
      });
      assert.equal(created.status, 201);
      const id = (created.json as { id: string }).id;
      const done = await request('PATCH', `/api/renders/${id}`, {
        status: 'completed',
        stage: 'completed',
        progress: 100,
      });
      assert.equal(done.status, 200);
    }

    const page1 = await request('GET', '/api/renders?limit=2&offset=0');
    assert.equal(page1.status, 200);
    const payload = page1.json as {
      items: Array<{ template_name?: string }>;
      total: number;
      limit: number;
      offset: number;
    };
    assert.equal(payload.limit, 2);
    assert.equal(payload.offset, 0);
    assert.ok(payload.total >= 3);
    assert.equal(payload.items.length, 2);
    assert.ok(payload.items.every((job) => job.template_name === 'Integration Template'));

    const page2 = await request('GET', '/api/renders?limit=2&offset=2');
    assert.equal(page2.status, 200);
    assert.ok((page2.json as { items: unknown[] }).items.length >= 1);
  });
});
