import { Router } from 'express';
import { join } from 'path';
import { rmSync, writeFileSync, mkdirSync } from 'fs';
import { randomUUID } from 'crypto';
import { generateHyperframesHTML, HYPERFRAMES_RUNTIME_URL } from '../hyperframes/composer.js';
import { renderWithHyperframes, isHyperframesAvailable } from '../hyperframes/renderer.js';
import { getDb } from '../db/database.js';
import { materializeRenderDsl, validateInputMode } from '../render-utils.js';
import { resolveCompositionDsl } from '@shared/compositionResolver';
import { hydrateDslBrandPack } from '../brandHydration.js';

const router = Router();
const DATA_DIR = join(import.meta.dirname, '../../../data');

let runtimeCache: { body: string; fetchedAt: number } | null = null;

router.get('/runtime.js', async (_req, res) => {
  try {
    const now = Date.now();
    if (!runtimeCache || now - runtimeCache.fetchedAt > 3_600_000) {
      const upstream = await fetch(HYPERFRAMES_RUNTIME_URL);
      if (!upstream.ok) throw new Error(`HyperFrames runtime upstream ${upstream.status}`);
      runtimeCache = { body: await upstream.text(), fetchedAt: now };
    }
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(runtimeCache.body);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Failed to load HyperFrames runtime';
    res.status(502).json({ error: message });
  }
});

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
  const db = getDb();
  const dsl = JSON.parse(row.dsl_json);
  const inputMode = resolveInputMode(req.query.input_mode || dsl.meta?.input_mode, 'template');
  const topic = String(req.query.topic || dsl.meta?.topic || '');
  const scriptText = String(req.query.script_text || dsl.meta?.script_text || '');
  const variables = parseVariables(req.query.variables);
  const materialized = hydrateDslBrandPack(
    materializeRenderDsl(dsl, inputMode, topic, scriptText),
    db,
  );
  return resolveCompositionDsl(materialized, variables);
}

router.post('/preview-html/live', (req, res) => {
  try {
    const dsl = req.body?.dsl;
    if (!dsl?.segments) return res.status(400).json({ error: 'Invalid DSL payload' });
    const variables = parseVariables(req.body?.variables);
    const inputMode = resolveInputMode(req.body?.input_mode || dsl.meta?.input_mode, 'template');
    const db = getDb();
    const materialized = hydrateDslBrandPack(
      materializeRenderDsl(
        dsl,
        inputMode,
        String(req.body?.topic || dsl.meta?.topic || ''),
        String(req.body?.script_text || dsl.meta?.script_text || ''),
      ),
      db,
    );
    const { dsl: resolvedDsl, segments } = resolveCompositionDsl(materialized, variables);
    const html = generateHyperframesHTML(
      resolvedDsl as unknown as Parameters<typeof generateHyperframesHTML>[0],
      segments as unknown as Parameters<typeof generateHyperframesHTML>[1],
    );
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

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
    const materialized = hydrateDslBrandPack(
      materializeRenderDsl(
        dsl,
        inputMode,
        String(req.body?.topic || dsl.meta?.topic || ''),
        String(req.body?.script_text || dsl.meta?.script_text || ''),
      ),
      db,
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