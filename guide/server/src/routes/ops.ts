import { Router, Request, Response } from 'express';
import { spawnSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getDataDir } from '../db/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '../../..');

const router = Router();

function resolveWorkerPython() {
  const workerDir = join(PROJECT_ROOT, 'worker');
  const venvPython =
    process.platform === 'win32'
      ? join(workerDir, '.venv', 'Scripts', 'python.exe')
      : join(workerDir, '.venv', 'bin', 'python3');
  return existsSync(venvPython)
    ? venvPython
    : process.platform === 'win32'
      ? 'python'
      : 'python3';
}

function runPythonScript(scriptRel: string, args: string[], env: Record<string, string> = {}) {
  const scriptPath = join(PROJECT_ROOT, scriptRel);
  return spawnSync(resolveWorkerPython(), [scriptPath, ...args], {
    cwd: PROJECT_ROOT,
    env: { ...process.env, ...env },
    encoding: 'utf-8',
    timeout: 30 * 60 * 1000,
  });
}

router.get('/render-audit', (_req: Request, res: Response) => {
  const auditPath = join(getDataDir(), 'render_jobs_audit.json');
  if (!existsSync(auditPath)) {
    const generated = runPythonScript('scripts/validate_render_jobs.py', [
      '--json-out', auditPath,
      '--allow-empty',
    ]);
    if (generated.status !== 0) {
      return res.status(500).json({
        error: 'Failed to generate render audit',
        stderr: (generated.stderr || '').slice(-2000),
      });
    }
  }
  try {
    const payload = JSON.parse(readFileSync(auditPath, 'utf-8'));
    res.json(payload);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Invalid audit JSON' });
  }
});

router.post('/batch-reassemble', (req: Request, res: Response) => {
  const dryRun = Boolean(req.body?.dry_run);
  const needsFix = req.body?.needs_fix !== false;
  const templateId = String(req.body?.template_id || process.env.REASSEMBLE_TEMPLATE_ID || '');
  const jobs = Array.isArray(req.body?.job_ids)
    ? req.body.job_ids.map((id: unknown) => String(id)).filter(Boolean)
    : [];
  const outputName = String(req.body?.output_name || 'final.mp4');
  const jsonOut = join(getDataDir(), 'batch_reassemble_report.json');

  const args = [
    ...(templateId ? ['--template-id', templateId] : []),
    ...(needsFix ? ['--needs-fix'] : []),
    ...(dryRun ? ['--dry-run'] : []),
    '--output-name', outputName,
    '--json-out', jsonOut,
    ...jobs.flatMap((jobId: string) => ['--job', jobId]),
  ];

  const result = runPythonScript('scripts/batch_reassemble.py', args, {
    SERVER_URL: process.env.SERVER_URL || 'http://127.0.0.1:3001',
  });

  let report: Record<string, unknown> | null = null;
  if (existsSync(jsonOut)) {
    try {
      report = JSON.parse(readFileSync(jsonOut, 'utf-8'));
    } catch {
      report = null;
    }
  }

  if (result.status !== 0 && !dryRun) {
    return res.status(500).json({
      error: 'Batch reassemble failed',
      stderr: (result.stderr || '').slice(-3000),
      stdout: (result.stdout || '').slice(-3000),
      report,
    });
  }

  res.json({
    ok: true,
    dry_run: dryRun,
    needs_fix: needsFix,
    stdout: (result.stdout || '').slice(-4000),
    report,
  });
});

export default router;