import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/database.js';
import { compileLottie, validatePlan, applySlots, type MotionPlan } from '../../../shared/lottieCompiler.js';
import { judgeDeliveryMode, looksLikeLottieJson } from '../../../shared/types/motion.js';

const router = Router();

/* POST /api/motion/lottie/compile
 * Body: { svg: string, plan: MotionPlan, slots?: Record<string,...>, scope?: {...AssetLineageMeta} }
 * Deterministic compile — no LLM, no arbitrary JS. Saves source svg + lottie + recipe assets
 * and returns the new asset ids + lineage metadata. */
router.post('/lottie/compile', (req: Request, res: Response) => {
  const { svg, plan, slots, scope } = req.body || {};
  if (typeof svg !== 'string' || !svg.trim()) return res.status(400).json({ error: 'svg is required' });
  if (!plan || typeof plan !== 'object') return res.status(400).json({ error: 'plan is required' });

  const validation = validatePlan(plan as MotionPlan);
  if (validation.blockers.length) return res.status(422).json({ error: 'invalid plan', blockers: validation.blockers, warnings: validation.warnings });

  const slotValues = applySlots(plan as MotionPlan, slots || {});
  const result = compileLottie(plan as MotionPlan, svg, slotValues);
  if (result.blockers.length) return res.status(422).json({ error: 'svg blocked', blockers: result.blockers, warnings: result.warnings });

  // Validate the emitted body still looks like Lottie.
  const bodyStr = JSON.stringify(result.lottie);
  if (!looksLikeLottieJson(bodyStr)) {
    result.warnings.push('emitted body failed lottie-shape self-check');
  }

  const db = getDb();
  const sourceAssetId = uuidv4();
  const lottieAssetId = uuidv4();
  const now = new Date().toISOString();

  const lineage = {
    scope: 'project',
    parent_asset_ids: [sourceAssetId],
    generation_prompt: (plan as any).prompt || 'text-to-lottie deterministic compile',
    model: 'lottie-compiler-v1',
    aspect_ratio: '9:16',
    duration_ms: plan.durationMs,
    fps: plan.fps,
    review_status: 'pending',
    ...scope,
  };

  db.prepare('INSERT INTO assets (id, name, type, file_url, metadata) VALUES (?, ?, ?, ?, ?)').run(
    sourceAssetId, plan.nm || 'svg-source', 'svg', '', JSON.stringify({ source: 'upload', kind: 'text-to-lottie-source', ...lineage }),
  );
  const lottieUrl = `/uploads/${lottieAssetId}.json`;
  db.prepare('INSERT INTO assets (id, name, type, file_url, metadata) VALUES (?, ?, ?, ?, ?)').run(
    lottieAssetId, plan.nm || 'lottie-asset', 'lottie', lottieUrl,
    JSON.stringify({ source: 'ai', kind: 'lottie', motion_asset_id: lottieAssetId, delivery_mode: judgeDeliveryMode('lottie', false), slot_values: slotValues, poster_frames: result.posterFrames, ...lineage }),
  );

  res.status(201).json({
    source_asset_id: sourceAssetId,
    lottie_asset_id: lottieAssetId,
    lottie_url: lottieUrl,
    lottie: result.lottie,
    controls: result.controls,
    poster_frames: result.posterFrames,
    warnings: result.warnings,
    delivery_mode: judgeDeliveryMode('lottie', false),
    lineage,
  });
});

/* POST /api/motion/lottie/slots — re-apply slot overrides without re-running the compiler. */
router.post('/lottie/slots', (req: Request, res: Response) => {
  const { plan, slots } = req.body || {};
  if (!plan) return res.status(400).json({ error: 'plan is required' });
  const merged = applySlots(plan as MotionPlan, slots || {});
  res.json({ slot_values: merged, delivery_mode: judgeDeliveryMode('lottie', false) });
});

export default router;