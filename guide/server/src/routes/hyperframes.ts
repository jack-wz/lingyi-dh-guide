import { Router } from 'express';
import { join } from 'path';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { generateHyperframesHTML } from '../hyperframes/composer.js';
import { renderWithHyperframes, isHyperframesAvailable } from '../hyperframes/renderer.js';
import { getDb } from '../db/database.js';
import { randomUUID } from 'crypto';

const router = Router();
const DATA_DIR = join(import.meta.dirname, '../../../data');

router.get('/:id/preview-html', (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT dsl_json FROM templates WHERE id = ?').get(req.params.id) as any;
  if (!row) return res.status(404).json({ error: 'Template not found' });

  try {
    const dsl = JSON.parse(row.dsl_json);
    const html = generateHyperframesHTML(dsl);
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
  const row = db.prepare('SELECT dsl_json FROM templates WHERE id = ?').get(req.params.id) as any;
  if (!row) return res.status(404).json({ error: 'Template not found' });

  try {
    const dsl = JSON.parse(row.dsl_json);
    const jobId = randomUUID();
    const workDir = join(DATA_DIR, `renders/hf_${jobId}`);
    const outputPath = join(DATA_DIR, `renders/${jobId}.mp4`);

    const html = generateHyperframesHTML(dsl);
    mkdirSync(workDir, { recursive: true });
    writeFileSync(join(workDir, 'index.html'), html, 'utf-8');

    const success = renderWithHyperframes({
      compositionDir: workDir,
      outputPath,
      fps: dsl.globalConfig?.fps || 30,
    });

    rmSync(workDir, { recursive: true, force: true });

    if (success) {
      res.json({ success: true, output_url: `/renders/${jobId}.mp4` });
    } else {
      res.status(500).json({ error: 'HyperFrames render failed' });
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
