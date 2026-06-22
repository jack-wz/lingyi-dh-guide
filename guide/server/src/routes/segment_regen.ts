import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/database.js';
import { isFeatureEnabled } from '../featureFlags.js';
import { apiError, ErrorCodes } from '../apiErrors.js';

const router = Router();

router.use((req: Request, res: Response, next) => {
  if (!isFeatureEnabled('ENABLE_SEGMENT_REGEN')) {
    return apiError(res, ErrorCodes.VALIDATION, 'Segment regen is not enabled (ENABLE_SEGMENT_REGEN=0)');
  }
  next();
});

router.post('/projects/:projectId/segments/:segmentIndex/regen', (req: Request, res: Response) => {
  const db = getDb();
  const { projectId, segmentIndex } = req.params;
  const idx = parseInt(segmentIndex, 10);

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as any;
  if (!project) return apiError(res, ErrorCodes.JOB_NOT_FOUND, 'Project not found', 404);

  const dsl = JSON.parse(project.current_dsl_json || '{}');
  const segments = dsl.segments || [];
  if (idx < 0 || idx >= segments.length) {
    return apiError(res, ErrorCodes.VALIDATION, `Segment index ${idx} out of range (0-${segments.length - 1})`);
  }

  const regenId = uuidv4();
  const { recipe_id, provider, source_asset_ids, metadata } = req.body;

  db.prepare(
    `INSERT INTO generation_artifacts (id, segment_id, recipe_id, provider, source_asset_ids, status, metadata)
     VALUES (?, ?, ?, ?, ?, 'pending', ?)`
  ).run(
    regenId,
    String(idx),
    recipe_id || '',
    provider || '',
    JSON.stringify(source_asset_ids || []),
    JSON.stringify(metadata || {}),
  );

  res.status(201).json({
    id: regenId,
    project_id: projectId,
    segment_index: idx,
    status: 'pending',
    message: `Segment ${idx} regen queued`,
  });
});

router.get('/projects/:projectId/segments/:segmentIndex/artifacts', (req: Request, res: Response) => {
  const db = getDb();
  const { projectId, segmentIndex } = req.params;
  const artifacts = db.prepare(
    'SELECT * FROM generation_artifacts WHERE segment_id = ? ORDER BY created_at DESC'
  ).all(segmentIndex);
  res.json({ items: artifacts });
});

router.post('/projects/:projectId/segments/:segmentIndex/reuse', (req: Request, res: Response) => {
  const db = getDb();
  const { projectId, segmentIndex } = req.params;
  const idx = parseInt(segmentIndex, 10);
  const { source_segment_index } = req.body;
  const sourceIdx = parseInt(source_segment_index, 10);

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as any;
  if (!project) return apiError(res, ErrorCodes.JOB_NOT_FOUND, 'Project not found', 404);

  const dsl = JSON.parse(project.current_dsl_json || '{}');
  const segments = dsl.segments || [];
  if (sourceIdx < 0 || sourceIdx >= segments.length || idx < 0 || idx >= segments.length) {
    return apiError(res, ErrorCodes.VALIDATION, 'Segment index out of range');
  }

  const sourceSeg = segments[sourceIdx];
  segments[idx] = {
    ...segments[idx],
    scene_image_url: sourceSeg.scene_image_url,
    clip_path: sourceSeg.clip_path,
    tts_audio_path: sourceSeg.tts_audio_path,
    narration_text: segments[idx].narration_text,
  };
  dsl.segments = segments;

  const actorId = String(req.headers['x-actor-id'] || 'local-user');
  const versionId = uuidv4();
  const nextVersion = ((db.prepare('SELECT MAX(version_number) AS max FROM project_versions WHERE project_id = ?').get(projectId) as any)?.max || 0) + 1;
  const dslStr = JSON.stringify(dsl);

  db.transaction(() => {
    db.prepare(
      `INSERT INTO project_versions (id, project_id, version_number, dsl_json, change_summary, actor_id, parent_version_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(versionId, projectId, nextVersion, dslStr, `Reuse segment ${sourceIdx} artifacts into segment ${idx}`, actorId, project.current_version_id);
    db.prepare("UPDATE projects SET current_dsl_json = ?, current_version_id = ?, updated_at = datetime('now') WHERE id = ?")
      .run(dslStr, versionId, projectId);
  })();

  res.json({ success: true, project_id: projectId, reused_from: sourceIdx, into: idx });
});

export default router;
