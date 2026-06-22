import { Router, Request, Response } from 'express';
import { getDb } from '../db/database.js';
import { isFeatureEnabled } from '../featureFlags.js';
import { apiError, ErrorCodes } from '../apiErrors.js';
import { validateDslFrames } from '@shared/frameWhitelist';
import { compressSegmentNarrations } from '@shared/narrationCompress';

const router = Router();

router.get('/projects/:projectId/preview', (req: Request, res: Response) => {
  const db = getDb();
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.projectId) as any;
  if (!project) return apiError(res, ErrorCodes.JOB_NOT_FOUND, 'Project not found', 404);

  const dsl = JSON.parse(project.current_dsl_json || '{}');
  const segments = dsl.segments || [];

  const shotCount = segments.length;
  const totalDuration = segments.reduce((sum: number, s: any) => sum + (s.duration_sec || 5), 0);
  const missingSceneImages = segments.filter((s: any) => !s.scene_image_url).length;
  const missingDigitalHuman = !dsl.meta?.digital_human_id;
  const missingVoices = segments.filter((s: any) => !s.voice_id).length;

  const frameValidation = validateDslFrames(dsl);
  const compressionResults = compressSegmentNarrations(segments);

  const brief = JSON.parse(project.brief_json || '{}');
  const risks: string[] = [];
  if (missingSceneImages > 0) risks.push(`${missingSceneImages} 个分镜缺少场景图`);
  if (missingDigitalHuman) risks.push('未设置数字人');
  if (!frameValidation.valid) risks.push(`${frameValidation.violations.length} 个分镜 frame 不在品牌白名单`);
  if (brief.target_duration_sec && totalDuration > brief.target_duration_sec * 1.5) {
    risks.push(`预计时长 ${totalDuration}s 远超目标 ${brief.target_duration_sec}s`);
  }

  res.json({
    project_id: req.params.projectId,
    shot_count: shotCount,
    estimated_duration: totalDuration,
    missing: {
      scene_images: missingSceneImages,
      digital_human: missingDigitalHuman ? 1 : 0,
      voices: missingVoices,
    },
    frame_validation: frameValidation,
    compression_preview: compressionResults.filter((r) => r.result.reduction_pct > 0).map((r) => ({
      segment_index: r.index,
      original_chars: r.result.original_chars,
      compressed_chars: r.result.compressed_chars,
      reduction_pct: r.result.reduction_pct,
    })),
    risks,
    ready: risks.length === 0 && frameValidation.valid,
  });
});

export default router;
