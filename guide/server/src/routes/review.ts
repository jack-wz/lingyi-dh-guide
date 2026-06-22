import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/database.js';
import { isFeatureEnabled } from '../featureFlags.js';
import { apiError, ErrorCodes } from '../apiErrors.js';

const router = Router();

router.use((req: Request, res: Response, next) => {
  if (!isFeatureEnabled('ENABLE_REVIEW_WORKFLOW')) {
    return apiError(res, ErrorCodes.VALIDATION, 'Review workflow is not enabled (ENABLE_REVIEW_WORKFLOW=0)');
  }
  next();
});

router.post('/projects/:projectId/review', (req: Request, res: Response) => {
  const db = getDb();
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.projectId) as any;
  if (!project) return apiError(res, ErrorCodes.JOB_NOT_FOUND, 'Project not found', 404);

  const { status, review_notes, reviewer_id } = req.body;
  const validStatuses = ['approved', 'rejected', 'changes_requested'];
  if (!validStatuses.includes(status)) {
    return apiError(res, ErrorCodes.VALIDATION, `status must be one of: ${validStatuses.join(', ')}`);
  }

  const reviewId = uuidv4();
  const projectStatus = status === 'approved' ? 'completed' : 'reviewing';
  db.transaction(() => {
    db.prepare("UPDATE projects SET status = ?, updated_at = datetime('now') WHERE id = ?")
      .run(projectStatus, req.params.projectId);
  })();

  res.json({
    id: reviewId,
    project_id: req.params.projectId,
    status,
    review_notes: review_notes || '',
    reviewer_id: reviewer_id || 'local-user',
    project_status: projectStatus,
  });
});

router.post('/projects/:projectId/save-as-template', (req: Request, res: Response) => {
  const db = getDb();
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.projectId) as any;
  if (!project) return apiError(res, ErrorCodes.JOB_NOT_FOUND, 'Project not found', 404);

  const { template_name } = req.body;
  if (!template_name) return apiError(res, ErrorCodes.VALIDATION, 'template_name is required');

  const dsl = JSON.parse(project.current_dsl_json || '{}');
  const newTemplateId = uuidv4();

  db.transaction(() => {
    db.prepare(
      `INSERT INTO templates (id, name, type, description, dsl_json, status, version)
       VALUES (?, ?, '从项目创建', ?, ?, 'draft', 1)`
    ).run(newTemplateId, template_name, `从项目 ${project.name} 另存为模板`, JSON.stringify(dsl));
  })();

  const template = db.prepare('SELECT * FROM templates WHERE id = ?').get(newTemplateId) as any;
  res.status(201).json({
    id: template.id,
    name: template.name,
    status: template.status,
    source_project_id: req.params.projectId,
  });
});

router.get('/projects/:projectId/versions/:versionId/diff', (req: Request, res: Response) => {
  const db = getDb();
  const version = db.prepare('SELECT * FROM project_versions WHERE id = ? AND project_id = ?')
    .get(req.params.versionId, req.params.projectId) as any;
  if (!version) return apiError(res, ErrorCodes.JOB_NOT_FOUND, 'Version not found', 404);

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.projectId) as any;
  const currentDsl = JSON.parse(project.current_dsl_json || '{}');
  const versionDsl = JSON.parse(version.dsl_json || '{}');

  const currentSegs = currentDsl.segments || [];
  const versionSegs = versionDsl.segments || [];
  const diffs: any[] = [];

  const maxLen = Math.max(currentSegs.length, versionSegs.length);
  for (let i = 0; i < maxLen; i++) {
    const curr = currentSegs[i];
    const prev = versionSegs[i];
    if (!prev && curr) diffs.push({ index: i, type: 'added' });
    else if (prev && !curr) diffs.push({ index: i, type: 'removed' });
    else if (prev && curr) {
      const changes: string[] = [];
      if (prev.narration_text !== curr.narration_text) changes.push('narration_text');
      if (prev.duration_sec !== curr.duration_sec) changes.push('duration_sec');
      if (prev.scene_image_url !== curr.scene_image_url) changes.push('scene_image_url');
      if (prev.frame_template_id !== curr.frame_template_id) changes.push('frame_template_id');
      if (changes.length > 0) diffs.push({ index: i, type: 'modified', fields: changes });
    }
  }

  res.json({
    version_id: req.params.versionId,
    version_number: version.version_number,
    diff: diffs,
    segment_count_current: currentSegs.length,
    segment_count_version: versionSegs.length,
  });
});

export default router;
