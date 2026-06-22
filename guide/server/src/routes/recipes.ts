import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/database.js';
import { isFeatureEnabled } from '../featureFlags.js';
import { apiError, ErrorCodes } from '../apiErrors.js';

const router = Router();

router.use((req: Request, res: Response, next) => {
  if (!isFeatureEnabled('ENABLE_REFERENCE_SETS')) {
    return apiError(res, ErrorCodes.VALIDATION, 'Reference sets are not enabled (ENABLE_REFERENCE_SETS=0)');
  }
  next();
});

router.post('/recipes', (req: Request, res: Response) => {
  const db = getDb();
  const { name, shot_type, brand_id, platform, mood, reference_set_id, prompt_template } = req.body;
  if (!name) return apiError(res, ErrorCodes.VALIDATION, 'name is required');
  if (!prompt_template) return apiError(res, ErrorCodes.VALIDATION, 'prompt_template is required');
  const id = uuidv4();
  db.prepare(
    `INSERT INTO recipes (id, name, shot_type, brand_id, platform, mood, reference_set_id, prompt_template)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, name, shot_type || '', brand_id || '', platform || '', mood || '', reference_set_id || '', prompt_template);
  res.status(201).json(db.prepare('SELECT * FROM recipes WHERE id = ?').get(id));
});

router.get('/recipes', (req: Request, res: Response) => {
  const db = getDb();
  const { shot_type, brand_id, platform, mood } = req.query;
  const where: string[] = ['enabled = 1'];
  const params: any[] = [];
  if (shot_type) { where.push('shot_type = ?'); params.push(shot_type); }
  if (brand_id) { where.push('brand_id = ?'); params.push(brand_id); }
  if (platform) { where.push('platform = ?'); params.push(platform); }
  if (mood) { where.push('mood = ?'); params.push(mood); }
  const items = db.prepare(`SELECT * FROM recipes WHERE ${where.join(' AND ')} ORDER BY created_at DESC`).all(...params);
  res.json({ items });
});

router.post('/reference-sets', (req: Request, res: Response) => {
  const db = getDb();
  const { project_id, category, name, asset_ids, metadata } = req.body;
  if (!category) return apiError(res, ErrorCodes.VALIDATION, 'category is required');
  if (!name) return apiError(res, ErrorCodes.VALIDATION, 'name is required');
  const id = uuidv4();
  db.prepare(
    `INSERT INTO reference_sets (id, project_id, category, name, asset_ids, metadata)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, project_id || '', category, name, JSON.stringify(asset_ids || []), JSON.stringify(metadata || {}));
  res.status(201).json(db.prepare('SELECT * FROM reference_sets WHERE id = ?').get(id));
});

router.get('/reference-sets', (req: Request, res: Response) => {
  const db = getDb();
  const { project_id, category } = req.query;
  const where: string[] = [];
  const params: any[] = [];
  if (project_id) { where.push('project_id = ?'); params.push(project_id); }
  if (category) { where.push('category = ?'); params.push(category); }
  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const items = db.prepare(`SELECT * FROM reference_sets ${whereClause} ORDER BY created_at DESC`).all(...params);
  res.json({ items });
});

router.post('/asset-relations', (req: Request, res: Response) => {
  const db = getDb();
  const { source_asset_id, generated_asset_id, relation_type, recipe_id, metadata } = req.body;
  if (!source_asset_id || !generated_asset_id || !relation_type) {
    return apiError(res, ErrorCodes.VALIDATION, 'source_asset_id, generated_asset_id, relation_type are required');
  }
  const id = uuidv4();
  db.prepare(
    `INSERT INTO asset_relations (id, source_asset_id, generated_asset_id, relation_type, recipe_id, metadata)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, source_asset_id, generated_asset_id, relation_type, recipe_id || '', JSON.stringify(metadata || {}));
  res.status(201).json(db.prepare('SELECT * FROM asset_relations WHERE id = ?').get(id));
});

router.get('/asset-lineage/:assetId', (req: Request, res: Response) => {
  const db = getDb();
  const assetId = req.params.assetId;
  const upstream = db.prepare(
    `SELECT ar.*, a.name AS source_name FROM asset_relations ar JOIN assets a ON a.id = ar.source_asset_id WHERE ar.generated_asset_id = ?`
  ).all(assetId);
  const downstream = db.prepare(
    `SELECT ar.*, a.name AS generated_name FROM asset_relations ar JOIN assets a ON a.id = ar.generated_asset_id WHERE ar.source_asset_id = ?`
  ).all(assetId);
  res.json({ asset_id: assetId, upstream, downstream });
});

router.post('/generation-artifacts', (req: Request, res: Response) => {
  const db = getDb();
  const { segment_id, render_job_id, recipe_id, recipe_version, provider, input_fingerprint, source_asset_ids, generated_asset_ids, status, metadata } = req.body;
  const id = uuidv4();
  db.prepare(
    `INSERT INTO generation_artifacts (id, segment_id, render_job_id, recipe_id, recipe_version, provider, input_fingerprint, source_asset_ids, generated_asset_ids, status, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, segment_id || '', render_job_id || '', recipe_id || '', recipe_version || '1', provider || '', input_fingerprint || '', JSON.stringify(source_asset_ids || []), JSON.stringify(generated_asset_ids || []), status || 'pending', JSON.stringify(metadata || {}));
  res.status(201).json(db.prepare('SELECT * FROM generation_artifacts WHERE id = ?').get(id));
});

router.get('/generation-artifacts', (req: Request, res: Response) => {
  const db = getDb();
  const { segment_id, render_job_id } = req.query;
  const where: string[] = [];
  const params: any[] = [];
  if (segment_id) { where.push('segment_id = ?'); params.push(segment_id); }
  if (render_job_id) { where.push('render_job_id = ?'); params.push(render_job_id); }
  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const items = db.prepare(`SELECT * FROM generation_artifacts ${whereClause} ORDER BY created_at DESC`).all(...params);
  res.json({ items });
});

router.get('/affected-projects/:assetId', (req: Request, res: Response) => {
  const db = getDb();
  const assetId = req.params.assetId;
  const relations = db.prepare(
    `SELECT DISTINCT ga.segment_id, ga.render_job_id FROM generation_artifacts ga WHERE ga.source_asset_ids LIKE ?`
  ).all(`%"${assetId}"%`);
  res.json({ asset_id: assetId, affected: relations });
});

export default router;
