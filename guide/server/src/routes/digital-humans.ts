import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/database.js';
import { removeRenderArtifactsForJobs } from '../render-artifacts.js';
import { spawnDetachedPython } from '../python-spawn.js';

const router = Router();

const REQUIRED_ASSETS: Array<[string, string]> = [
  ['face_photo_url', '大头照片'],
  ['half_body_photo_url', '半身照片'],
  ['full_body_photo_url', '全身照片'],
  ['voice_sample_url', '声音样本'],
];
const DIGITAL_HUMAN_STATUSES = ['pending', 'pending_assets', 'training', 'ready', 'failed'];

function missingAssets(row: Record<string, unknown>) {
  return REQUIRED_ASSETS.filter(([field]) => !row[field]).map(([, label]) => label);
}

function normalizeProvider(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : 'local-assets';
}

function shouldUseAsyncTraining(provider: string, body: Record<string, unknown>): boolean {
  if (provider === 'cenker' || provider === 'kie-yuntts') return true;
  return body.async === true || process.env.DIGITAL_HUMAN_TRAINING_MODE === 'async' || provider !== 'local-assets';
}

function defaultTrainingProvider(): string {
  return process.env.DIGITAL_HUMAN_TRAINING_PROVIDER || 'cenker';
}

// GET /api/digital-humans - list all
router.get('/', (_req: Request, res: Response) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM digital_humans ORDER BY created_at DESC').all();
  res.json(rows);
});

// GET /api/digital-humans/:id
router.get('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM digital_humans WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Digital human not found' });
  res.json(row);
});

// POST /api/digital-humans - create
router.post('/', (req: Request, res: Response) => {
  const db = getDb();
  const id = uuidv4();
  const { name } = req.body;

  db.prepare(
    `INSERT INTO digital_humans (id, name, status) VALUES (?, ?, 'pending_assets')`
  ).run(id, name || '未命名数字人');

  const row = db.prepare('SELECT * FROM digital_humans WHERE id = ?').get(id);
  res.status(201).json(row);
});

// PUT /api/digital-humans/:id - update
router.put('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM digital_humans WHERE id = ?').get(req.params.id) as any;
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const fields = ['name', 'face_photo_url', 'half_body_photo_url', 'full_body_photo_url',
    'voice_sample_url', 'voice_clone_id', 'image_model_id', 'status', 'provider_job_id',
    'training_error', 'last_trained_at'];

  if (req.body.status !== undefined && !DIGITAL_HUMAN_STATUSES.includes(req.body.status)) {
    return res.status(400).json({ error: `Invalid status: ${req.body.status}` });
  }

  const updates: string[] = [];
  const values: any[] = [];

  for (const field of fields) {
    if (req.body[field] !== undefined) {
      updates.push(`${field} = ?`);
      values.push(req.body[field]);
    }
  }

  if (updates.length === 0) return res.json(existing);

  updates.push('updated_at = datetime(\'now\')');
  values.push(req.params.id);

  db.prepare(`UPDATE digital_humans SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  const row = db.prepare('SELECT * FROM digital_humans WHERE id = ?').get(req.params.id);
  res.json(row);
});

// DELETE /api/digital-humans/:id
router.delete('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const dhId = req.params.id;

  const existing = db.prepare('SELECT * FROM digital_humans WHERE id = ?').get(dhId);
  if (!existing) return res.status(404).json({ error: 'Digital human not found' });

  const jobs = db.prepare('SELECT id, output_url FROM render_jobs WHERE digital_human_id = ?').all(dhId) as Array<{
    id: string;
    output_url?: string | null;
  }>;

  // Clean up related render_logs (FK -> render_jobs)
  db.prepare(
    'DELETE FROM render_logs WHERE render_job_id IN (SELECT id FROM render_jobs WHERE digital_human_id = ?)'
  ).run(dhId);

  // Clean up related render_jobs (FK -> digital_humans)
  db.prepare('DELETE FROM render_jobs WHERE digital_human_id = ?').run(dhId);

  // Now safe to delete
  db.prepare('DELETE FROM digital_humans WHERE id = ?').run(dhId);
  removeRenderArtifactsForJobs(jobs);
  res.json({ success: true, deleted_artifacts: jobs.length });
});

// POST /api/digital-humans/:id/train - validate assets and mark provider training state
router.post('/:id/train', (req: Request, res: Response) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM digital_humans WHERE id = ?').get(req.params.id) as any;
  if (!row) return res.status(404).json({ error: 'Not found' });

  const missing = missingAssets(row);

  if (missing.length > 0) {
    const msg = `缺少素材: ${missing.join('、')}`;
    db.prepare(
      `UPDATE digital_humans
       SET status = 'pending_assets', training_error = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(msg, req.params.id);
    const updated = db.prepare('SELECT * FROM digital_humans WHERE id = ?').get(req.params.id);
    return res.status(400).json({ error: msg, digital_human: updated });
  }

  const provider = normalizeProvider(req.body?.provider || defaultTrainingProvider());
  if (shouldUseAsyncTraining(provider, req.body || {})) {
    const providerJobId = typeof req.body?.provider_job_id === 'string' && req.body.provider_job_id.trim()
      ? req.body.provider_job_id.trim()
      : `${provider}:${req.params.id}:${Date.now()}`;

    db.prepare(
      `UPDATE digital_humans
       SET status = 'training', provider_job_id = ?, training_error = '',
           updated_at = datetime('now')
       WHERE id = ?`
    ).run(providerJobId, req.params.id);

    if (provider === 'cenker' || provider === 'kie-yuntts') {
      spawnDetachedPython('train_digital_human.py', ['--id', String(req.params.id)], 'DH-Train');
    }

    const updated = db.prepare('SELECT * FROM digital_humans WHERE id = ?').get(req.params.id);
    return res.status(202).json(updated);
  }

  // Production v1 treats a complete local asset pack as render-ready. This is explicit
  // local-provider state, not a fake sleep-based training job.
  db.prepare(
    `UPDATE digital_humans
     SET status = 'ready', provider_job_id = COALESCE(NULLIF(provider_job_id, ''), 'local-assets'),
         voice_clone_id = COALESCE(NULLIF(voice_clone_id, ''), ?),
         image_model_id = COALESCE(NULLIF(image_model_id, ''), ?),
         training_error = '', last_trained_at = datetime('now'), updated_at = datetime('now')
     WHERE id = ?`
  ).run(`local-voice:${req.params.id}`, `local-image:${req.params.id}`, req.params.id);

  const updated = db.prepare('SELECT * FROM digital_humans WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// POST /api/digital-humans/:id/training-status - provider callback / operator sync
router.post('/:id/training-status', (req: Request, res: Response) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM digital_humans WHERE id = ?').get(req.params.id) as any;
  if (!row) return res.status(404).json({ error: 'Not found' });

  const nextStatus = req.body?.status;
  if (!['training', 'ready', 'failed'].includes(nextStatus)) {
    return res.status(400).json({ error: 'status must be training, ready, or failed' });
  }

  const providerJobId = typeof req.body?.provider_job_id === 'string' && req.body.provider_job_id.trim()
    ? req.body.provider_job_id.trim()
    : row.provider_job_id;
  const voiceCloneId = typeof req.body?.voice_clone_id === 'string' && req.body.voice_clone_id.trim()
    ? req.body.voice_clone_id.trim()
    : row.voice_clone_id;
  const imageModelId = typeof req.body?.image_model_id === 'string' && req.body.image_model_id.trim()
    ? req.body.image_model_id.trim()
    : row.image_model_id;
  const errorMessage = typeof req.body?.error_message === 'string' && req.body.error_message.trim()
    ? req.body.error_message.trim()
    : '';

  if (nextStatus === 'ready' && (!voiceCloneId || !imageModelId)) {
    return res.status(400).json({ error: 'ready status requires voice_clone_id and image_model_id' });
  }

  if (nextStatus === 'failed' && !errorMessage) {
    return res.status(400).json({ error: 'failed status requires error_message' });
  }

  db.prepare(
    `UPDATE digital_humans
     SET status = ?, provider_job_id = ?, voice_clone_id = ?, image_model_id = ?,
         training_error = ?, last_trained_at = CASE WHEN ? IN ('ready', 'failed') THEN datetime('now') ELSE last_trained_at END,
         updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    nextStatus,
    providerJobId,
    voiceCloneId || '',
    imageModelId || '',
    nextStatus === 'failed' ? errorMessage : '',
    nextStatus,
    req.params.id
  );

  const updated = db.prepare('SELECT * FROM digital_humans WHERE id = ?').get(req.params.id);
  res.json(updated);
});

export default router;
