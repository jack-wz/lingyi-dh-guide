import { Router } from 'express';
import { join } from 'path';
import { rmSync, writeFileSync, mkdirSync } from 'fs';
import { randomUUID } from 'crypto';
import { generateHyperframesHTML } from '../hyperframes/composer.js';
import { renderWithHyperframes, isHyperframesAvailable } from '../hyperframes/renderer.js';
import { getDb } from '../db/database.js';
import { materializeRenderDsl, validateInputMode } from '../render-utils.js';
import { resolveCompositionDsl } from '@shared/compositionResolver';

const router = Router();
const DATA_DIR = join(import.meta.dirname, '../../../data');

function parseVariables(raw: unknown): Record<string, string> {
  if (!raw) return {};
  if (typeof raw === 'object' && raw !== null) {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      out[key] = String(value ?? '');
    }
    return out;
  }
  try {
    const parsed = JSON.parse(String(raw));
    return parseVariables(parsed);
  } catch {
    return {};
  }
}

function resolveInputMode(raw: unknown, fallback = 'template'): 'template' | 'topic' | 'script' {
  const mode = String(raw || fallback);
  return validateInputMode(mode) ? mode : 'template';
}

function buildPreviewDsl(row: { dsl_json: string }, req: { query: Record<string, unknown> }) {
  const dsl = JSON.parse(row.dsl_json);
  const inputMode = resolveInputMode(req.query.input_mode || dsl.meta?.input_mode, 'template');
  const topic = String(req.query.topic || dsl.meta?.topic || '');
  const scriptText = String(req.query.script_text || dsl.meta?.script_text || '');
  const variables = parseVariables(req.query.variables);
  const materialized = materializeRenderDsl(dsl, inputMode, topic, scriptText);
  return resolveCompositionDsl(materialized, variables);
}

router.get('/:id/preview-html', (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT dsl_json FROM templates WHERE id = ?').get(req.params.id) as { dsl_json: string } | undefined;
  if (!row) return res.status(404).json({ error: 'Template not found' });

  try {
    const { dsl, segments } = buildPreviewDsl(row, req);
    const html = generateHyperframesHTML(dsl as unknown as Parameters<typeof generateHyperframesHTML>[0], segments as Parameters<typeof generateHyperframesHTML>[1]);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/preview-html', (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT dsl_json FROM templates WHERE id = ?').get(req.params.id) as { dsl_json: string } | undefined;
  if (!row) return res.status(404).json({ error: 'Template not found' });

  try {
    const dsl = JSON.parse(row.dsl_json);
    const inputMode = resolveInputMode(req.body?.input_mode || dsl.meta?.input_mode, 'template');
    const materialized = materializeRenderDsl(
      dsl,
      inputMode,
      String(req.body?.topic || dsl.meta?.topic || ''),
      String(req.body?.script_text || dsl.meta?.script_text || ''),
    );
    const { dsl: resolvedDsl, segments } = resolveCompositionDsl(
      materialized,
      parseVariables(req.body?.variables),
    );
    const html = generateHyperframesHTML(
      resolvedDsl as unknown as Parameters<typeof generateHyperframesHTML>[0],
      segments as Parameters<typeof generateHyperframesHTML>[1],
    );
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/render-hyperframes', (req, res) => {
  if (!isHyperframesAvailable()) {
    return res.status(503).json({ error: 'HyperFrames not available. Install with: npm install -g hyperframes' });
  }

  const db = getDb();
  const row = db.prepare('SELECT dsl_json FROM templates WHERE id = ?').get(req.params.id) as { dsl_json: string } | undefined;
  if (!row) return res.status(404).json({ error: 'Template not found' });

  try {
    const { dsl, segments } = buildPreviewDsl(row, { query: { ...req.query, ...req.body } });
    const jobId = randomUUID();
    const workDir = join(DATA_DIR, `renders/hf_${jobId}`);
    const outputPath = join(DATA_DIR, `renders/job_hf_${jobId}/final.mp4`);
    mkdirSync(join(DATA_DIR, 'renders', `job_hf_${jobId}`), { recursive: true });

    const html = generateHyperframesHTML(dsl as unknown as Parameters<typeof generateHyperframesHTML>[0], segments as Parameters<typeof generateHyperframesHTML>[1]);
    mkdirSync(workDir, { recursive: true });
    writeFileSync(join(workDir, 'index.html'), html, 'utf-8');

    const success = renderWithHyperframes({
      compositionDir: workDir,
      outputPath,
      fps: Number((dsl.globalConfig as { fps?: number })?.fps || 30),
    });

    rmSync(workDir, { recursive: true, force: true });

    if (success) {
      res.json({ success: true, output_url: `/renders/job_hf_${jobId}/final.mp4`, preview_mode: true });
    } else {
      res.status(500).json({ error: 'HyperFrames render failed' });
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;