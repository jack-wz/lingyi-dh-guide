import { Router, Request, Response } from 'express';
import { getDb } from '../db/database.js';

const router = Router();
const ACTIVE_RENDER_STATUSES = ['queued', 'parsing', 'scene_gen', 'video_gen', 'ffmpeg', 'cancelling'];
const ACTIVE_DH_STATUSES = ['pending', 'pending_assets', 'training'];

export interface UnifiedTask {
  id: string;
  task_type: 'render' | 'dh_training';
  status: string;
  progress: number;
  stage: string;
  title: string;
  subtitle: string;
  error_message: string;
  output_url: string;
  template_id: string;
  digital_human_id: string;
  created_at: string;
  updated_at: string;
  link: string;
}

function mapRenderTask(row: Record<string, unknown>): UnifiedTask {
  const id = String(row.id);
  const templateName = String(row.template_name || '').trim();
  const pipelineKey = String(row.pipeline_key || 'standard');
  const stage = String(row.stage || row.status || '');
  return {
    id,
    task_type: 'render',
    status: String(row.status || ''),
    progress: Number(row.progress || 0),
    stage,
    title: templateName || `渲染任务 ${id.slice(0, 8)}`,
    subtitle: `${pipelineKey} · ${stage}`,
    error_message: String(row.error_message || ''),
    output_url: String(row.output_url || ''),
    template_id: String(row.template_id || ''),
    digital_human_id: String(row.digital_human_id || ''),
    created_at: String(row.created_at || ''),
    updated_at: String(row.updated_at || row.created_at || ''),
    link: `/render/${id}`,
  };
}

function mapDhTask(row: Record<string, unknown>): UnifiedTask {
  const id = String(row.id);
  const status = String(row.status || '');
  const progress = status === 'ready' ? 100 : status === 'training' ? 60 : status === 'pending_assets' ? 20 : 5;
  return {
    id,
    task_type: 'dh_training',
    status,
    progress,
    stage: status,
    title: String(row.name || `数字人 ${id.slice(0, 8)}`),
    subtitle: '数字人训练',
    error_message: String(row.training_error || ''),
    output_url: '',
    template_id: '',
    digital_human_id: id,
    created_at: String(row.created_at || ''),
    updated_at: String(row.updated_at || row.created_at || ''),
    link: `/digital-humans/${id}`,
  };
}

router.get('/', (req: Request, res: Response) => {
  const db = getDb();
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
  const scope = String(req.query.scope || 'active');

  const renderStatuses = scope === 'all'
    ? null
    : scope === 'terminal'
      ? ['completed', 'failed', 'cancelled']
      : ACTIVE_RENDER_STATUSES;

  let renderSql = 'SELECT rj.*, t.name AS template_name, t.type AS template_type FROM render_jobs rj LEFT JOIN templates t ON t.id = rj.template_id';
  const renderParams: unknown[] = [];
  if (renderStatuses) {
    renderSql += ` WHERE rj.status IN (${renderStatuses.map(() => '?').join(',')})`;
    renderParams.push(...renderStatuses);
  }
  renderSql += ' ORDER BY datetime(rj.updated_at) DESC LIMIT ?';
  renderParams.push(limit);

  const renderRows = db.prepare(renderSql).all(...renderParams) as Array<Record<string, unknown>>;

  const dhStatuses = scope === 'all'
    ? null
    : scope === 'terminal'
      ? ['ready', 'failed']
      : ACTIVE_DH_STATUSES;

  let dhSql = 'SELECT * FROM digital_humans';
  const dhParams: unknown[] = [];
  if (dhStatuses) {
    dhSql += ` WHERE status IN (${dhStatuses.map(() => '?').join(',')})`;
    dhParams.push(...dhStatuses);
  }
  dhSql += ' ORDER BY datetime(updated_at) DESC LIMIT ?';
  dhParams.push(limit);

  const dhRows = db.prepare(dhSql).all(...dhParams) as Array<Record<string, unknown>>;

  const items = [
    ...renderRows.map((row) => mapRenderTask(row)),
    ...dhRows.map(mapDhTask),
  ]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, limit);

  res.json({ items, total: items.length, scope });
});

router.get('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const taskType = String(req.query.type || '');

  if (taskType !== 'render') {
    const dh = db.prepare('SELECT * FROM digital_humans WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
    if (dh) return res.json(mapDhTask(dh));
  }

  if (taskType !== 'dh_training') {
    const job = db
      .prepare('SELECT rj.*, t.name AS template_name, t.type AS template_type FROM render_jobs rj LEFT JOIN templates t ON t.id = rj.template_id WHERE rj.id = ?')
      .get(req.params.id) as Record<string, unknown> | undefined;
    if (job) return res.json(mapRenderTask(job));
  }

  return res.status(404).json({ error: 'Task not found' });
});

export default router;