import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/database.js';
import { removeRenderArtifactsForJobs } from '../render-artifacts.js';
import { createDefaultDSL } from '../../../shared/types/template.js';
import {
  enrichTemplateRowsWithBrandSummary,
  SQL_BRAND_PACK_MATCH,
  SQL_BRAND_UNBOUND,
} from '../templateBrandSummary.js';

const router = Router();
const TEMPLATE_STATUSES = ['draft', 'pending', 'published', 'offline'] as const;
type TemplateStatus = (typeof TEMPLATE_STATUSES)[number];

const STATUS_TRANSITIONS: Record<TemplateStatus, TemplateStatus[]> = {
  draft: ['pending', 'published'],
  pending: ['draft', 'published'],
  published: ['offline'],
  offline: ['draft', 'published'],
};

function isTemplateStatus(status: unknown): status is TemplateStatus {
  return typeof status === 'string' && (TEMPLATE_STATUSES as readonly string[]).includes(status);
}

function parseDsl(json: string): any {
  try {
    return JSON.parse(json);
  } catch {
    return {};
  }
}

function syncDslLifecycle(dslJson: string, updates: { status?: TemplateStatus; version?: number; updatedAt: string }): string {
  const dsl = parseDsl(dslJson);
  dsl.meta = dsl.meta || {};
  if (updates.status) dsl.meta.status = updates.status;
  if (updates.version !== undefined) dsl.meta.version = updates.version;
  dsl.meta.updatedAt = updates.updatedAt;
  dsl.meta.updated_at = updates.updatedAt;
  return JSON.stringify(dsl);
}

function serializeTemplate(row: any) {
  if (row?.dsl_json) row.dsl_json = JSON.parse(row.dsl_json);
  return row;
}

function parseBoolQuery(value: unknown, defaultValue: boolean): boolean {
  if (value === undefined || value === null || value === '') return defaultValue;
  const text = String(value).toLowerCase();
  if (text === '1' || text === 'true' || text === 'yes') return true;
  if (text === '0' || text === 'false' || text === 'no') return false;
  return defaultValue;
}

function listTemplatesQuery(req: Request) {
  const includeE2e = parseBoolQuery(req.query.include_e2e, false);
  const excludeE2e = !includeE2e && parseBoolQuery(req.query.exclude_e2e, false);
  const q = String(req.query.q || '').trim();
  const statusFilter = String(req.query.status || '').trim();
  const brandPackId = String(req.query.brand_pack_id || '').trim();
  const brandUnbound = parseBoolQuery(req.query.brand_unbound, false);

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (excludeE2e) {
    conditions.push("type != 'e2e'");
  }
  if (brandUnbound) {
    conditions.push(SQL_BRAND_UNBOUND);
  } else if (brandPackId) {
    conditions.push(SQL_BRAND_PACK_MATCH);
    params.push(brandPackId, brandPackId);
  }
  if (statusFilter && isTemplateStatus(statusFilter)) {
    conditions.push('status = ?');
    params.push(statusFilter);
  }
  if (q) {
    conditions.push('(name LIKE ? OR description LIKE ? OR type LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return {
    sql: `SELECT * FROM templates ${where} ORDER BY updated_at DESC`,
    params,
    excludeE2e,
  };
}

// GET /api/templates - list templates (optional filters: exclude_e2e, include_e2e, q, status, with_meta)
router.get('/', (req: Request, res: Response) => {
  const db = getDb();
  const withMeta = parseBoolQuery(req.query.with_meta, false);
  const { sql, params, excludeE2e } = listTemplatesQuery(req);
  const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
  const templates = enrichTemplateRowsWithBrandSummary(rows, db);

  if (!withMeta) {
    res.json(templates);
    return;
  }

  const e2eCount = (db.prepare("SELECT COUNT(*) as n FROM templates WHERE type = 'e2e'").get() as { n: number }).n;
  const unboundWhere = excludeE2e ? `WHERE type != 'e2e' AND ${SQL_BRAND_UNBOUND}` : `WHERE ${SQL_BRAND_UNBOUND}`;
  const unboundBrandCount = (
    db.prepare(`SELECT COUNT(*) as n FROM templates ${unboundWhere}`).get() as { n: number }
  ).n;
  res.json({
    items: templates,
    meta: {
      e2e_count: e2eCount,
      shown_count: templates.length,
      unbound_brand_count: unboundBrandCount,
    },
  });
});

// GET /api/templates/:id - get single template
router.get('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM templates WHERE id = ?').get(req.params.id) as any;
  if (!row) return res.status(404).json({ error: 'Template not found' });
  res.json(serializeTemplate(row));
});

// POST /api/templates - create template
router.post('/', (req: Request, res: Response) => {
  const db = getDb();
  const id = uuidv4();
  const { name, type, description } = req.body;

  const defaultDsl = createDefaultDSL({
    id,
    name: name || '未命名模板',
    type: type || '新品发布',
    description: description || '',
  });

  db.prepare(
    `INSERT INTO templates (id, name, type, description, dsl_json, status, version)
     VALUES (?, ?, ?, ?, ?, 'draft', 1)`
  ).run(id, name || '未命名模板', type || '', description || '', JSON.stringify(defaultDsl));

  const template = db.prepare('SELECT * FROM templates WHERE id = ?').get(id) as any;
  res.status(201).json(serializeTemplate(template));
});

// PUT /api/templates/:id - update template (dsl_json)
router.put('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const { dsl_json, name, description, status } = req.body;

  const existing = db.prepare('SELECT * FROM templates WHERE id = ?').get(req.params.id) as any;
  if (!existing) return res.status(404).json({ error: 'Template not found' });

  const updates: string[] = [];
  const values: any[] = [];

  if (dsl_json !== undefined) {
    updates.push('dsl_json = ?');
    values.push(JSON.stringify(dsl_json));
  }
  if (name !== undefined) {
    updates.push('name = ?');
    values.push(name);
  }
  if (description !== undefined) {
    updates.push('description = ?');
    values.push(description);
  }
  if (status !== undefined) {
    if (!isTemplateStatus(status)) {
      return res.status(400).json({ error: 'Invalid template status' });
    }
    updates.push('status = ?');
    values.push(status);
  }

  updates.push('updated_at = datetime(\'now\')');
  values.push(req.params.id);

  db.prepare(`UPDATE templates SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  const updated = db.prepare('SELECT * FROM templates WHERE id = ?').get(req.params.id) as any;
  res.json(serializeTemplate(updated));
});

// PATCH /api/templates/:id/status - controlled lifecycle transition
router.patch('/:id/status', (req: Request, res: Response) => {
  const db = getDb();
  const nextStatus = req.body?.status;
  if (!isTemplateStatus(nextStatus)) {
    return res.status(400).json({ error: 'Invalid template status' });
  }

  const existing = db.prepare('SELECT * FROM templates WHERE id = ?').get(req.params.id) as any;
  if (!existing) return res.status(404).json({ error: 'Template not found' });

  const currentStatus: TemplateStatus = isTemplateStatus(existing.status) ? existing.status : 'draft';
  if (currentStatus !== nextStatus && !STATUS_TRANSITIONS[currentStatus].includes(nextStatus)) {
    return res.status(409).json({
      error: `Cannot transition template from ${currentStatus} to ${nextStatus}`,
      current_status: currentStatus,
      allowed_statuses: STATUS_TRANSITIONS[currentStatus],
    });
  }

  const now = new Date().toISOString();
  const nextVersion = nextStatus === 'published' && currentStatus !== 'published'
    ? Number(existing.version || 1) + 1
    : Number(existing.version || 1);
  const publishedAt = nextStatus === 'published' ? now : existing.published_at;
  const nextDslJson = syncDslLifecycle(existing.dsl_json, {
    status: nextStatus,
    version: nextVersion,
    updatedAt: now,
  });

  db.prepare(
    `UPDATE templates
     SET status = ?, version = ?, published_at = ?, dsl_json = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(nextStatus, nextVersion, publishedAt, nextDslJson, req.params.id);

  const updated = db.prepare('SELECT * FROM templates WHERE id = ?').get(req.params.id) as any;
  res.json(serializeTemplate(updated));
});

// DELETE /api/templates/:id
router.delete('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const templateId = req.params.id;

  // Check if template exists
  const existing = db.prepare('SELECT * FROM templates WHERE id = ?').get(templateId);
  if (!existing) return res.status(404).json({ error: 'Template not found' });

  const jobs = db.prepare('SELECT id, output_url FROM render_jobs WHERE template_id = ?').all(templateId) as Array<{
    id: string;
    output_url?: string | null;
  }>;

  // Delete related render_logs first (FK -> render_jobs)
  db.prepare(
    'DELETE FROM render_logs WHERE render_job_id IN (SELECT id FROM render_jobs WHERE template_id = ?)'
  ).run(templateId);

  // Delete related render_jobs (FK -> templates)
  db.prepare('DELETE FROM render_jobs WHERE template_id = ?').run(templateId);

  // Now safe to delete the template
  db.prepare('DELETE FROM templates WHERE id = ?').run(templateId);
  removeRenderArtifactsForJobs(jobs);
  res.json({ success: true, deleted_artifacts: jobs.length });
});

export default router;
