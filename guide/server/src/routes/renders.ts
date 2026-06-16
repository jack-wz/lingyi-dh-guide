import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDataDir, getDb } from '../db/database.js';
import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readFileSync } from 'fs';
import { removeRenderArtifacts } from '../render-artifacts.js';
import {
  ACTIVE_RENDER_STATUSES,
  PIPELINES,
  TERMINAL_STATUSES,
  enrichJob,
  getPipeline,
  materializeRenderDsl,
  shouldTimeoutJob,
  statusFromStage,
  validateInputMode,
  validatePipeline,
  validateProgress,
  validateRenderLogLevel,
  validateRenderStatus,
} from '../render-utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '../../..');
const DATA_DIR = getDataDir();

const router = Router();
// ---- Worker 进程管理 ----
let workerProcess: ReturnType<typeof spawn> | null = null;

function ensureWorkerRunning() {
  if (process.env.DISABLE_RENDER_WORKER === '1') return;
  if (workerProcess && !workerProcess.killed) return;

  // __dirname = server/src/routes, so ../../.. = project root
  const projectRoot = join(__dirname, '../../..');
  const workerDir = join(projectRoot, 'worker');
  const venvPython =
    process.platform === 'win32'
      ? join(workerDir, '.venv', 'Scripts', 'python.exe')
      : join(workerDir, '.venv', 'bin', 'python3');
  const pythonCmd = existsSync(venvPython)
    ? venvPython
    : process.platform === 'win32'
      ? 'python'
      : 'python3';

  console.log('[Render] Starting worker process...');
  workerProcess = spawn(pythonCmd, ['-B', 'run_worker.py'], {
    cwd: workerDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, SERVER_URL: process.env.SERVER_URL || 'http://localhost:3000' },
  });

  workerProcess.stdout?.on('data', (data: Buffer) => {
    const msg = data.toString().trim();
    if (msg) console.log(`[Worker] ${msg}`);
  });

  workerProcess.stderr?.on('data', (data: Buffer) => {
    const msg = data.toString().trim();
    if (msg) console.error(`[Worker:err] ${msg}`);
  });

  workerProcess.on('exit', (code) => {
    console.log(`[Render] Worker process exited with code ${code}`);
    workerProcess = null;
  });

  workerProcess.on('error', (err) => {
    console.error(`[Render] Worker process error: ${err.message}`);
    workerProcess = null;
  });
}

function getProviderConfigSnapshot() {
  const configPath = join(DATA_DIR, 'config.json');
  const envFallback = {
    models: {
      kie: { api_key: process.env.KIE_API_KEY || '', base_url: process.env.KIE_BASE_URL || '' },
      yuntts: { api_key: process.env.YUNTTS_API_KEY || '', base_url: process.env.YUNTTS_BASE_URL || '' },
      wavespeed: { api_key: process.env.WAVESPEED_API_KEY || '', base_url: process.env.WAVESPEED_BASE_URL || '' },
    },
    pipeline: {},
    prompts: {},
  };
  if (!existsSync(configPath)) return envFallback;
  try {
    const raw = JSON.parse(readFileSync(configPath, 'utf-8'));
    const models = raw.models || {};
    return {
      ...raw,
      models: Object.fromEntries(Object.entries({ ...envFallback.models, ...models }).map(([key, value]: [string, any]) => {
        const fallback = (envFallback.models as Record<string, any>)[key] || {};
        const apiKey = value?.api_key && !String(value.api_key).includes('***')
          ? value.api_key
          : fallback.api_key || '';
        return [key, { ...fallback, ...value, api_key: apiKey }];
      })),
      pipeline: raw.pipeline || {},
      prompts: raw.prompts || {},
    };
  } catch {
    return envFallback;
  }
}

// GET /api/renders/pipelines - list available pipelines
router.get('/pipelines', (_req: Request, res: Response) => {
  res.json(PIPELINES);
});

// POST /api/renders - create a render job
router.post('/', (req: Request, res: Response) => {
  const db = getDb();
  const id = uuidv4();
  const {
    template_id,
    digital_human_id,
    variables,
    pipeline_key = req.body.pipeline || 'standard',
    input_mode = 'template',
    topic = '',
    script_text = '',
    max_retries = 1,
  } = req.body;

  if (!template_id) {
    return res.status(400).json({ error: 'template_id is required' });
  }
  if (!validatePipeline(pipeline_key)) {
    return res.status(400).json({ error: `Unknown pipeline_key: ${pipeline_key}` });
  }
  if (!validateInputMode(input_mode)) {
    return res.status(400).json({ error: `Unknown input_mode: ${input_mode}` });
  }
  if (input_mode === 'topic' && !String(topic || '').trim()) {
    return res.status(400).json({ error: 'topic is required for topic input_mode' });
  }
  if (input_mode === 'script' && !String(script_text || '').trim()) {
    return res.status(400).json({ error: 'script_text is required for script input_mode' });
  }

  // Fetch template DSL
  const template = db.prepare('SELECT dsl_json FROM templates WHERE id = ?').get(template_id) as any;
  if (!template) {
    return res.status(404).json({ error: 'Template not found' });
  }

  const selectedPipeline = getPipeline(pipeline_key);
  if (selectedPipeline?.requires_digital_human && !digital_human_id) {
    return res.status(400).json({ error: 'digital_human_id is required for digital_human pipeline' });
  }

  if (digital_human_id) {
    const dh = db.prepare('SELECT id, status FROM digital_humans WHERE id = ?').get(digital_human_id) as any;
    if (!dh) {
      return res.status(400).json({ error: `数字人不存在: ${digital_human_id}` });
    }
    if (selectedPipeline?.requires_digital_human && dh.status !== 'ready') {
      return res.status(400).json({ error: `数字人未就绪: ${digital_human_id}` });
    }
  }

  db.prepare(
    `INSERT INTO render_jobs (
       id, template_id, digital_human_id, status, stage, pipeline_key, input_mode,
       topic, script_text, variables_json, template_dsl_snapshot,
       provider_config_snapshot, progress, max_retries
     )
     VALUES (?, ?, ?, 'queued', 'queued', ?, ?, ?, ?, ?, ?, ?, 0, ?)`
  ).run(
    id,
    template_id,
    digital_human_id || null,
    pipeline_key,
    input_mode,
    topic || '',
    script_text || '',
    JSON.stringify(variables || {}),
    String(template.dsl_json || ''),
    JSON.stringify(getProviderConfigSnapshot()),
    Math.max(0, Math.min(Number(max_retries) || 0, 3)),
  );

  // Ensure worker is running to pick up this job
  ensureWorkerRunning();

  const job = db.prepare('SELECT * FROM render_jobs WHERE id = ?').get(id) as any;
  res.status(201).json(enrichJob(job, DATA_DIR));
});

// POST /api/renders/ai-generate - shortcut to create an AI full-auto render job
router.post('/ai-generate', (req: Request, res: Response) => {
  const db = getDb();
  const id = uuidv4();
  const {
    template_id,
    digital_human_id,
    topic = '',
    script_text = '',
    variables,
    max_retries = 1,
  } = req.body;

  if (!template_id) {
    return res.status(400).json({ error: 'template_id is required' });
  }
  if (!digital_human_id) {
    return res.status(400).json({ error: 'digital_human_id is required for AI full-auto pipeline' });
  }

  const input_mode = String(topic || '').trim() ? 'topic' : String(script_text || '').trim() ? 'script' : 'template';
  const pipeline_key = 'ai_full_auto';

  const template = db.prepare('SELECT dsl_json FROM templates WHERE id = ?').get(template_id) as any;
  if (!template) {
    return res.status(404).json({ error: 'Template not found' });
  }

  const dh = db.prepare('SELECT id, status FROM digital_humans WHERE id = ?').get(digital_human_id) as any;
  if (!dh) {
    return res.status(400).json({ error: `数字人不存在: ${digital_human_id}` });
  }
  if (dh.status !== 'ready') {
    return res.status(400).json({ error: `数字人未就绪: ${digital_human_id}` });
  }

  db.prepare(
    `INSERT INTO render_jobs (
       id, template_id, digital_human_id, status, stage, pipeline_key, input_mode,
       topic, script_text, variables_json, template_dsl_snapshot,
       provider_config_snapshot, progress, max_retries
     )
     VALUES (?, ?, ?, 'queued', 'queued', ?, ?, ?, ?, ?, ?, ?, 0, ?)`
  ).run(
    id,
    template_id,
    digital_human_id,
    pipeline_key,
    input_mode,
    topic || '',
    script_text || '',
    JSON.stringify(variables || {}),
    String(template.dsl_json || ''),
    JSON.stringify(getProviderConfigSnapshot()),
    Math.max(0, Math.min(Number(max_retries) || 0, 3)),
  );

  ensureWorkerRunning();

  const job = db.prepare('SELECT * FROM render_jobs WHERE id = ?').get(id) as any;
  res.status(201).json(enrichJob(job, DATA_DIR));
});

const QUEUE_CLAIM_ATTEMPTS = 5;

function materializeClaimedJob(job: any) {
  const templateDsl = typeof job.template_dsl === 'string'
    ? JSON.parse(job.template_dsl || '{}')
    : job.template_dsl || {};
  job.template_dsl = materializeRenderDsl(
    templateDsl,
    validateInputMode(job.input_mode) ? job.input_mode : 'template',
    job.topic || '',
    job.script_text || '',
  );
  return job;
}

function selectRenderJobWithTemplateDsl(db: ReturnType<typeof getDb>, whereClause: string) {
  return db.prepare(
    `SELECT rj.*, COALESCE(NULLIF(rj.template_dsl_snapshot, ''), t.dsl_json) as template_dsl
     FROM render_jobs rj
     JOIN templates t ON t.id = rj.template_id
     ${whereClause}`
  );
}

// GET /api/renders/next - get next queued job (for worker polling)
router.get('/next', (_req: Request, res: Response) => {
  const db = getDb();
  const workerId = String(_req.query.worker_id || '');
  const selectNextQueued = selectRenderJobWithTemplateDsl(
    db,
    `WHERE rj.status = 'queued' AND rj.cancel_requested = 0
     ORDER BY rj.created_at ASC, rj.id ASC
     LIMIT 1`,
  );
  const selectById = selectRenderJobWithTemplateDsl(db, 'WHERE rj.id = ?');
  const claimJob = db.prepare(
    `UPDATE render_jobs
     SET status = 'parsing', stage = 'parsing', worker_id = ?, started_at = COALESCE(started_at, datetime('now')),
         heartbeat_at = datetime('now'), updated_at = datetime('now')
     WHERE id = ? AND status = 'queued' AND cancel_requested = 0`
  );

  for (let attempt = 0; attempt < QUEUE_CLAIM_ATTEMPTS; attempt += 1) {
    const candidate = selectNextQueued.get() as any;
    if (!candidate) return res.status(404).json({ error: 'No queued jobs' });

    const result = claimJob.run(workerId, candidate.id);
    if (result.changes === 0) continue;

    const claimed = selectById.get(candidate.id) as any;
    if (!claimed) return res.status(404).json({ error: 'Claimed job not found' });
    return res.json(materializeClaimedJob(claimed));
  }

  return res.status(409).json({ error: 'Unable to claim queued job; retry polling' });
});

// POST /api/renders/maintenance/timeouts - fail jobs whose worker heartbeat expired
router.post('/maintenance/timeouts', (req: Request, res: Response) => {
  const db = getDb();
  const requestedTimeoutMs = Number(req.body?.timeout_ms);
  const timeoutMs = Number.isFinite(requestedTimeoutMs)
    ? Math.max(1000, requestedTimeoutMs)
    : Number(process.env.RENDER_HEARTBEAT_TIMEOUT_MS || 10 * 60 * 1000);
  const nowMs = Date.now();
  const jobs = db.prepare(
    `SELECT id, status, stage, heartbeat_at, worker_id
     FROM render_jobs
     WHERE status IN (${ACTIVE_RENDER_STATUSES.map(() => '?').join(',')})
       AND heartbeat_at IS NOT NULL`
  ).all(...ACTIVE_RENDER_STATUSES) as Array<Record<string, unknown>>;

  const timedOutJobs = jobs.filter((job) => shouldTimeoutJob(job, nowMs, timeoutMs));
  const failJob = db.prepare(
    `UPDATE render_jobs
     SET status = 'failed',
         stage = 'failed',
         error_message = ?,
         updated_at = datetime('now'),
         completed_at = datetime('now')
     WHERE id = ? AND status IN (${ACTIVE_RENDER_STATUSES.map(() => '?').join(',')})`
  );
  const addLog = db.prepare('INSERT INTO render_logs (render_job_id, level, message) VALUES (?, ?, ?)');

  const timeoutMessage = `Worker heartbeat timeout after ${Math.round(timeoutMs / 1000)}s`;
  const timedOutIds: string[] = [];
  const tx = db.transaction(() => {
    for (const job of timedOutJobs) {
      const id = String(job.id);
      const result = failJob.run(timeoutMessage, id, ...ACTIVE_RENDER_STATUSES);
      if (result.changes > 0) {
        timedOutIds.push(id);
        addLog.run(id, 'error', `${timeoutMessage}; worker=${String(job.worker_id || 'unknown')}`);
      }
    }
  });
  tx();

  res.json({ timed_out: timedOutIds.length, job_ids: timedOutIds, timeout_ms: timeoutMs });
});

// GET /api/renders/:id - get job status
router.get('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const job = db.prepare('SELECT * FROM render_jobs WHERE id = ?').get(req.params.id) as any;
  if (!job) return res.status(404).json({ error: 'Render job not found' });
  res.json(enrichJob(job, DATA_DIR));
});

// PATCH /api/renders/:id - update job status (for worker)
router.patch('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const { status, stage, progress, output_url, error_message, heartbeat, worker_id } = req.body;
  if (status !== undefined && !validateRenderStatus(status)) {
    return res.status(400).json({ error: `Unknown render status: ${status}` });
  }
  if (progress !== undefined && !validateProgress(progress)) {
    return res.status(400).json({ error: 'progress must be a number between 0 and 100' });
  }

  const existing = db.prepare('SELECT * FROM render_jobs WHERE id = ?').get(req.params.id) as any;
  if (!existing) return res.status(404).json({ error: 'Render job not found' });
  if (TERMINAL_STATUSES.includes(existing.status)) {
    if (status === undefined || status === existing.status) {
      return res.json(enrichJob(existing, DATA_DIR));
    }
    return res.status(409).json({
      error: 'Render job already reached a terminal status',
      status: existing.status,
    });
  }
  if (existing.cancel_requested && status !== 'cancelled') {
    return res.status(409).json({ error: 'Job cancellation requested', cancel_requested: true });
  }

  const updates: string[] = [];
  const values: any[] = [];

  const normalizedStatus = status !== undefined
    ? status
    : statusFromStage(stage);
  const normalizedStage = stage !== undefined
    ? stage
    : TERMINAL_STATUSES.includes(normalizedStatus)
      ? normalizedStatus
      : undefined;

  if (normalizedStatus !== undefined) { updates.push('status = ?'); values.push(normalizedStatus); }
  if (normalizedStage !== undefined) { updates.push('stage = ?'); values.push(normalizedStage); }
  if (progress !== undefined) { updates.push('progress = ?'); values.push(progress); }
  if (output_url !== undefined) { updates.push('output_url = ?'); values.push(output_url); }
  if (error_message !== undefined) { updates.push('error_message = ?'); values.push(error_message); }
  if (worker_id !== undefined) { updates.push('worker_id = ?'); values.push(worker_id); }
  if (heartbeat !== undefined) updates.push("heartbeat_at = datetime('now')");

  updates.push("updated_at = datetime('now')");
  if (TERMINAL_STATUSES.includes(normalizedStatus)) {
    updates.push("completed_at = datetime('now')");
  }

  if (updates.length === 1) return res.json(existing);
  values.push(req.params.id);

  db.prepare(`UPDATE render_jobs SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  const job = db.prepare('SELECT * FROM render_jobs WHERE id = ?').get(req.params.id) as any;
  res.json(enrichJob(job, DATA_DIR));
});

// POST /api/renders/:id/heartbeat - update worker heartbeat
router.post('/:id/heartbeat', (req: Request, res: Response) => {
  const db = getDb();
  const job = db.prepare('SELECT id, status, cancel_requested FROM render_jobs WHERE id = ?').get(req.params.id) as any;
  if (!job) return res.status(404).json({ error: 'Render job not found' });
  db.prepare("UPDATE render_jobs SET heartbeat_at = datetime('now'), worker_id = COALESCE(?, worker_id), updated_at = datetime('now') WHERE id = ?")
    .run(req.body.worker_id || '', req.params.id);
  res.json({ cancel_requested: !!job.cancel_requested, status: job.status });
});

// POST /api/renders/:id/cancel - request cancellation
router.post('/:id/cancel', (req: Request, res: Response) => {
  const db = getDb();
  const job = db.prepare('SELECT * FROM render_jobs WHERE id = ?').get(req.params.id) as any;
  if (!job) return res.status(404).json({ error: 'Render job not found' });
  if (TERMINAL_STATUSES.includes(job.status)) return res.json(job);

  const nextStatus = job.status === 'queued' ? 'cancelled' : 'cancelling';
  db.prepare(
    `UPDATE render_jobs SET status = ?, stage = ?, cancel_requested = 1,
       error_message = COALESCE(NULLIF(error_message, ''), '用户已请求取消任务'),
       updated_at = datetime('now'), completed_at = CASE WHEN ? = 'cancelled' THEN datetime('now') ELSE completed_at END
     WHERE id = ?`
  ).run(nextStatus, nextStatus, nextStatus, req.params.id);
  db.prepare('INSERT INTO render_logs (render_job_id, level, message) VALUES (?, ?, ?)')
    .run(req.params.id, 'warn', '用户请求取消任务');
  const updated = db.prepare('SELECT * FROM render_jobs WHERE id = ?').get(req.params.id) as any;
  res.json(enrichJob(updated, DATA_DIR));
});

// POST /api/renders/:id/retry - clone a failed/cancelled job back into the queue
router.post('/:id/retry', (req: Request, res: Response) => {
  const db = getDb();
  const job = db.prepare('SELECT * FROM render_jobs WHERE id = ?').get(req.params.id) as any;
  if (!job) return res.status(404).json({ error: 'Render job not found' });
  if (!['failed', 'cancelled'].includes(job.status)) {
    return res.status(400).json({ error: 'Only failed or cancelled jobs can be retried' });
  }
  if ((job.retry_count || 0) >= (job.max_retries || 1)) {
    return res.status(400).json({ error: 'Retry limit reached' });
  }

  const newId = uuidv4();
  db.prepare(
    `INSERT INTO render_jobs (
      id, template_id, digital_human_id, status, stage, pipeline_key, input_mode,
      topic, script_text, variables_json, template_dsl_snapshot, provider_config_snapshot, progress,
      retry_count, max_retries, parent_job_id
    ) VALUES (?, ?, ?, 'queued', 'queued', ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`
  ).run(
    newId,
    job.template_id,
    job.digital_human_id,
    job.pipeline_key || 'standard',
    job.input_mode || 'template',
    job.topic || '',
    job.script_text || '',
    job.variables_json || '{}',
    job.template_dsl_snapshot || '',
    job.provider_config_snapshot || '{}',
    (job.retry_count || 0) + 1,
    job.max_retries || 1,
    job.id,
  );
  ensureWorkerRunning();
  const created = db.prepare('SELECT * FROM render_jobs WHERE id = ?').get(newId) as any;
  res.status(201).json(enrichJob(created, DATA_DIR));
});

// POST /api/renders/:id/duplicate - copy a job without incrementing retry count
router.post('/:id/duplicate', (req: Request, res: Response) => {
  const db = getDb();
  const job = db.prepare('SELECT * FROM render_jobs WHERE id = ?').get(req.params.id) as any;
  if (!job) return res.status(404).json({ error: 'Render job not found' });

  const newId = uuidv4();
  db.prepare(
    `INSERT INTO render_jobs (
      id, template_id, digital_human_id, status, stage, pipeline_key, input_mode,
      topic, script_text, variables_json, template_dsl_snapshot, provider_config_snapshot, progress,
      retry_count, max_retries, parent_job_id
    ) VALUES (?, ?, ?, 'queued', 'queued', ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`
  ).run(
    newId,
    job.template_id,
    job.digital_human_id,
    job.pipeline_key || 'standard',
    job.input_mode || 'template',
    job.topic || '',
    job.script_text || '',
    job.variables_json || '{}',
    job.template_dsl_snapshot || '',
    job.provider_config_snapshot || '{}',
    job.max_retries || 1,
    job.id,
  );
  ensureWorkerRunning();
  const created = db.prepare('SELECT * FROM render_jobs WHERE id = ?').get(newId) as any;
  res.status(201).json(enrichJob(created, DATA_DIR));
});

// POST /api/renders/:id/logs - append a log entry
router.post('/:id/logs', (req: Request, res: Response) => {
  const db = getDb();
  const { level, message } = req.body;
  const normalizedLevel = level || 'info';
  if (!validateRenderLogLevel(normalizedLevel)) {
    return res.status(400).json({ error: `Unknown render log level: ${level}` });
  }

  db.prepare(
    `INSERT INTO render_logs (render_job_id, level, message) VALUES (?, ?, ?)`
  ).run(req.params.id, normalizedLevel, message || '');

  res.json({ success: true });
});

// GET /api/renders/:id/logs - get logs for a render job
router.get('/:id/logs', (req: Request, res: Response) => {
  const db = getDb();
  const after = req.query.after ? parseInt(req.query.after as string) : 0;
  const logs = db.prepare(
    `SELECT id, level, message, created_at FROM render_logs WHERE render_job_id = ? AND id > ? ORDER BY id ASC`
  ).all(req.params.id, after);
  res.json(logs);
});

// DELETE /api/renders/:id - delete a render job
router.delete('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const jobId = req.params.id;

  const job = db.prepare('SELECT * FROM render_jobs WHERE id = ?').get(jobId) as any;
  if (!job) return res.status(404).json({ error: 'Render job not found' });

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM render_logs WHERE render_job_id = ?').run(jobId);
    db.prepare('DELETE FROM render_jobs WHERE id = ?').run(jobId);
  });
  tx();
  removeRenderArtifacts(job);

  res.json({ success: true, deleted_artifacts: true });
});

// GET /api/renders - list all render jobs
router.get('/', (_req: Request, res: Response) => {
  const db = getDb();
  const jobs = db.prepare('SELECT * FROM render_jobs ORDER BY created_at DESC LIMIT 50').all() as any[];
  res.json(jobs.map((job) => enrichJob(job, DATA_DIR)));
});

export default router;
