import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/database.js';
import { isFeatureEnabled } from '../featureFlags.js';
import { apiError, ErrorCodes } from '../apiErrors.js';

const router = Router();

function getActorId(req: Request): string {
  return String(req.headers['x-actor-id'] || req.body?.actor_id || 'local-user');
}

function createProjectFromTemplate(templateId: string, name: string, actorId: string) {
  const db = getDb();
  const template = db.prepare('SELECT dsl_json, name FROM templates WHERE id = ?').get(templateId) as any;
  if (!template) return null;

  const projectId = uuidv4();
  const snapshot = String(template.dsl_json || '{}');
  const dsl = JSON.parse(snapshot);
  const brandPackId = dsl.globalConfig?.brand_pack_id || '';
  const versionId = uuidv4();
  const now = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO projects (id, template_id, name, status, template_snapshot_json, brand_pack_id, brand_pack_version, brief_json, current_dsl_json, current_version_id, actor_id)
       VALUES (?, ?, ?, 'draft', ?, ?, 0, '{}', ?, ?, ?)`
    ).run(projectId, templateId, name, snapshot, brandPackId, snapshot, versionId, actorId);

    db.prepare(
      `INSERT INTO project_versions (id, project_id, version_number, dsl_json, change_summary, actor_id, parent_version_id)
       VALUES (?, ?, 1, ?, '从模板创建项目', ?, '')`
    ).run(versionId, projectId, snapshot, actorId);
  });
  tx();

  return db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
}

router.use((req: Request, res: Response, next) => {
  if (!isFeatureEnabled('ENABLE_PROJECT_WORKFLOW')) {
    return apiError(res, ErrorCodes.VALIDATION, 'Project workflow is not enabled (ENABLE_PROJECT_WORKFLOW=0)');
  }
  next();
});

router.post('/', (req: Request, res: Response) => {
  const { template_id, name } = req.body;
  if (!template_id) return apiError(res, ErrorCodes.VALIDATION, 'template_id is required');
  if (!name) return apiError(res, ErrorCodes.VALIDATION, 'name is required');
  const actorId = getActorId(req);
  const project = createProjectFromTemplate(String(template_id), String(name), actorId);
  if (!project) return apiError(res, ErrorCodes.TEMPLATE_NOT_FOUND, 'Template not found', 404);
  res.status(201).json(project);
});

router.get('/', (req: Request, res: Response) => {
  const db = getDb();
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
  const offset = Math.max(0, Number(req.query.offset || 0));
  const status = String(req.query.status || '').trim();
  const where = status ? 'WHERE p.status = ?' : '';
  const params = status ? [status] : [];
  const totalRow = db.prepare(`SELECT COUNT(*) AS c FROM projects p ${where}`).get(...params) as { c: number };
  const items = db.prepare(
    `SELECT p.*, t.name AS template_name FROM projects p LEFT JOIN templates t ON t.id = p.template_id ${where} ORDER BY p.created_at DESC LIMIT ? OFFSET ?`
  ).all(...params, limit, offset);
  res.json({ items, total: totalRow.c, limit, offset });
});

router.get('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id) as any;
  if (!project) return apiError(res, ErrorCodes.JOB_NOT_FOUND, 'Project not found', 404);
  res.json(project);
});

router.put('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id) as any;
  if (!project) return apiError(res, ErrorCodes.JOB_NOT_FOUND, 'Project not found', 404);

  const { name, status, brief_json, current_dsl_json } = req.body;
  const actorId = getActorId(req);
  const updates: string[] = [];
  const values: any[] = [];

  if (name !== undefined) { updates.push('name = ?'); values.push(name); }
  if (status !== undefined) { updates.push('status = ?'); values.push(status); }
  if (brief_json !== undefined) { updates.push('brief_json = ?'); values.push(typeof brief_json === 'string' ? brief_json : JSON.stringify(brief_json)); }
  if (current_dsl_json !== undefined) {
    const dslStr = typeof current_dsl_json === 'string' ? current_dsl_json : JSON.stringify(current_dsl_json);
    updates.push('current_dsl_json = ?'); values.push(dslStr);

    const versionId = uuidv4();
    const nextVersion = (db.prepare('SELECT MAX(version_number) AS max FROM project_versions WHERE project_id = ?').get(req.params.id) as any)?.max || 0 + 1;
    db.prepare(
      `INSERT INTO project_versions (id, project_id, version_number, dsl_json, change_summary, actor_id, parent_version_id)
       VALUES (?, ?, ?, ?, 'DSL 更新', ?, ?)`
    ).run(versionId, req.params.id, nextVersion, dslStr, actorId, project.current_version_id);
    updates.push('current_version_id = ?'); values.push(versionId);
  }

  if (updates.length === 0) return res.json(project);
  updates.push("updated_at = datetime('now')");
  values.push(req.params.id);
  db.prepare(`UPDATE projects SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  res.json(db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id));
});

router.get('/:id/versions', (req: Request, res: Response) => {
  const db = getDb();
  const versions = db.prepare(
    'SELECT * FROM project_versions WHERE project_id = ? ORDER BY version_number DESC'
  ).all(req.params.id);
  res.json({ items: versions });
});

router.post('/:id/versions/:versionId/restore', (req: Request, res: Response) => {
  const db = getDb();
  const version = db.prepare('SELECT * FROM project_versions WHERE id = ? AND project_id = ?').get(req.params.versionId, req.params.id) as any;
  if (!version) return apiError(res, ErrorCodes.JOB_NOT_FOUND, 'Version not found', 404);

  const actorId = getActorId(req);
  const newVersionId = uuidv4();
  const nextNumber = (db.prepare('SELECT MAX(version_number) AS max FROM project_versions WHERE project_id = ?').get(req.params.id) as any)?.max || 0 + 1;

  db.transaction(() => {
    db.prepare(
      `INSERT INTO project_versions (id, project_id, version_number, dsl_json, change_summary, actor_id, parent_version_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(newVersionId, req.params.id, nextNumber, version.dsl_json, `恢复至版本 ${version.version_number}`, actorId, version.id);
    db.prepare("UPDATE projects SET current_dsl_json = ?, current_version_id = ?, updated_at = datetime('now') WHERE id = ?")
      .run(version.dsl_json, newVersionId, req.params.id);
  })();

  res.json(db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id));
});

export default router;
