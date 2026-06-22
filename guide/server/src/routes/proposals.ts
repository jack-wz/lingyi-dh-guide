import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/database.js';
import { isFeatureEnabled } from '../featureFlags.js';
import { apiError, ErrorCodes } from '../apiErrors.js';
import { getLlmClient } from '../llmClient.js';

const router = Router();

export interface ProjectBrief {
  product_name: string;
  audience: string;
  goal: string;
  selling_points: string[];
  offer: string;
  cta: string;
  platform: string;
  target_duration_sec: number;
  aspect_ratio: string;
  tone: string;
  language: string;
  required_disclaimers: string[];
  banned_words: string[];
}

function getActorId(req: Request): string {
  return String(req.headers['x-actor-id'] || req.body?.actor_id || 'local-user');
}

function validateBrief(brief: Partial<ProjectBrief>): string[] {
  const errors: string[] = [];
  if (!brief.product_name?.trim()) errors.push('product_name is required');
  if (!brief.audience?.trim()) errors.push('audience is required');
  if (!brief.goal?.trim()) errors.push('goal is required');
  if (!Array.isArray(brief.selling_points) || brief.selling_points.length === 0)
    errors.push('selling_points must be a non-empty array');
  if (!brief.cta?.trim()) errors.push('cta is required');
  return errors;
}

function buildProposalFromBrief(brief: ProjectBrief, projectDsl: Record<string, any>) {
  const segments = (projectDsl.segments || []).slice(0, 8);
  const estimatedDuration = segments.reduce((sum: number, s: any) => sum + (s.duration_sec || 5), 0);
  const frameTemplateIds = (projectDsl.globalConfig?.brand_pack?.frames || []).map((f: any) => f.frame_template_id || f.id);

  const shots = segments.map((seg: any, i: number) => ({
    index: i,
    narration: seg.narration_text || '',
    frame: seg.camera_shot || frameTemplateIds[i] || '',
    estimated_duration: seg.duration_sec || 5,
    selling_point: brief.selling_points[i % brief.selling_points.length],
  }));

  const assetNeeds = segments.map((seg: any, i: number) => ({
    index: i,
    needs_scene_image: !seg.scene_image_url,
    needs_digital_human: !seg.avatar_id && !projectDsl.meta?.digital_human_id,
    needs_voice: !seg.voice_id,
  }));

  const missing = assetNeeds.filter((a) => a.needs_scene_image || a.needs_digital_human || a.needs_voice);
  const risks: string[] = [];
  if (estimatedDuration > brief.target_duration_sec + 10) risks.push(`预计时长 ${estimatedDuration}s 超出目标 ${brief.target_duration_sec}s`);
  if (missing.length > 0) risks.push(`${missing.length} 个分镜缺少素材`);

  for (const word of brief.banned_words || []) {
    for (const shot of shots) {
      if (shot.narration.includes(word)) risks.push(`分镜 ${shot.index + 1} 包含禁用词: ${word}`);
    }
  }

  return {
    shots,
    estimated_duration: estimatedDuration,
    selling_point_distribution: brief.selling_points.map((sp, i) => ({
      selling_point: sp,
      shot_indices: shots.filter((s) => s.selling_point === sp).map((s) => s.index),
    })),
    frame: brief.aspect_ratio,
    asset_needs: assetNeeds,
    missing_items: missing,
    risks,
    disclaimers: brief.required_disclaimers || [],
  };
}

function runPreflight(dsl: Record<string, any>, brief: ProjectBrief) {
  const blockers: string[] = [];
  const warnings: string[] = [];

  const segments = dsl.segments || [];
  if (segments.length === 0) blockers.push('没有分镜');

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (!seg.scene_image_url) blockers.push(`分镜 ${i + 1} 缺少场景图`);
    if (!seg.narration_text?.trim()) warnings.push(`分镜 ${i + 1} 缺少旁白`);
  }

  const dhId = dsl.meta?.digital_human_id;
  if (!dhId) warnings.push('未设置数字人');

  for (const word of brief.banned_words || []) {
    for (let i = 0; i < segments.length; i++) {
      if (segments[i].narration_text?.includes(word)) {
        blockers.push(`分镜 ${i + 1} 旁白包含禁用词: ${word}`);
      }
    }
  }

  const estimatedDuration = segments.reduce((sum: number, s: any) => sum + (s.duration_sec || 5), 0);
  if (estimatedDuration > brief.target_duration_sec + 15) {
    warnings.push(`预计时长 ${estimatedDuration}s 超出目标 ${brief.target_duration_sec}s`);
  }

  const missingAssetCount = segments.filter((s: any) => !s.scene_image_url).length;
  const missingDhCount = !dhId ? 1 : 0;

  return {
    blockers,
    warnings,
    estimated_duration: estimatedDuration,
    missing_scene_images: missingAssetCount,
    missing_digital_humans: missingDhCount,
    missing_voices: segments.filter((s: any) => !s.voice_id).length,
    ready: blockers.length === 0,
  };
}

router.use((req: Request, res: Response, next) => {
  if (!isFeatureEnabled('ENABLE_PROPOSAL_GATE')) {
    return apiError(res, ErrorCodes.VALIDATION, 'Proposal gate is not enabled (ENABLE_PROPOSAL_GATE=0)');
  }
  next();
});

router.post('/:id/propose', async (req: Request, res: Response) => {
  const db = getDb();
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id) as any;
  if (!project) return apiError(res, ErrorCodes.JOB_NOT_FOUND, 'Project not found', 404);

  const brief = req.body.brief as Partial<ProjectBrief>;
  const errors = validateBrief(brief);
  if (errors.length > 0) return apiError(res, ErrorCodes.VALIDATION, errors.join('; '));

  const dsl = JSON.parse(project.current_dsl_json || '{}');
  const proposal = buildProposalFromBrief(brief as ProjectBrief, dsl);

  const proposalId = uuidv4();
  db.prepare(
    `INSERT INTO generation_proposals (id, project_id, status, proposal_json, brief_json, actor_id)
     VALUES (?, ?, 'pending', ?, ?, ?)`
  ).run(proposalId, req.params.id, JSON.stringify(proposal), JSON.stringify(brief), getActorId(req));

  res.status(201).json({ id: proposalId, project_id: req.params.id, status: 'pending', proposal });
});

router.post('/:id/proposals/:proposalId/adopt', (req: Request, res: Response) => {
  const db = getDb();
  const proposal = db.prepare('SELECT * FROM generation_proposals WHERE id = ? AND project_id = ?').get(req.params.proposalId, req.params.id) as any;
  if (!proposal) return apiError(res, ErrorCodes.JOB_NOT_FOUND, 'Proposal not found', 404);
  if (proposal.status === 'adopted') return res.json(proposal);

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id) as any;
  if (!project) return apiError(res, ErrorCodes.JOB_NOT_FOUND, 'Project not found', 404);

  const proposalData = JSON.parse(proposal.proposal_json || '{}');
  const brief = JSON.parse(proposal.brief_json || '{}');
  const currentDsl = JSON.parse(project.current_dsl_json || '{}');

  const updatedDsl = {
    ...currentDsl,
    meta: { ...currentDsl.meta, brief, proposal_adopted: true },
    segments: (currentDsl.segments || []).map((seg: any, i: number) => {
      const shot = proposalData.shots?.[i];
      return shot ? { ...seg, narration_text: shot.narration, duration_sec: shot.estimated_duration } : seg;
    }),
  };

  const actorId = getActorId(req);
  const versionId = uuidv4();
  const nextVersion = ((db.prepare('SELECT MAX(version_number) AS max FROM project_versions WHERE project_id = ?').get(req.params.id) as any)?.max || 0) + 1;
  const dslStr = JSON.stringify(updatedDsl);

  db.transaction(() => {
    db.prepare(
      `INSERT INTO project_versions (id, project_id, version_number, dsl_json, change_summary, actor_id, parent_version_id)
       VALUES (?, ?, ?, ?, 'Adopt proposal', ?, ?)`
    ).run(versionId, req.params.id, nextVersion, dslStr, actorId, project.current_version_id);

    db.prepare("UPDATE projects SET current_dsl_json = ?, current_version_id = ?, updated_at = datetime('now') WHERE id = ?")
      .run(dslStr, versionId, req.params.id);

    db.prepare("UPDATE generation_proposals SET status = 'adopted', adopted_version_id = ?, adopted_at = datetime('now') WHERE id = ?")
      .run(versionId, proposal.id);
  })();

  res.json(db.prepare('SELECT * FROM generation_proposals WHERE id = ?').get(proposal.id));
});

router.post('/:id/preflight', (req: Request, res: Response) => {
  const db = getDb();
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id) as any;
  if (!project) return apiError(res, ErrorCodes.JOB_NOT_FOUND, 'Project not found', 404);

  const brief = (req.body.brief || {}) as Partial<ProjectBrief>;
  const dsl = req.body.dsl ? req.body.dsl : JSON.parse(project.current_dsl_json || '{}');

  const result = runPreflight(dsl, brief as ProjectBrief);
  res.json(result);
});

router.get('/:id/proposals', (req: Request, res: Response) => {
  const db = getDb();
  const proposals = db.prepare(
    'SELECT * FROM generation_proposals WHERE project_id = ? ORDER BY created_at DESC'
  ).all(req.params.id);
  res.json({ items: proposals });
});

export default router;
