import { Router, Request, Response } from 'express';
import { spawnSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { getDataDir } from '../db/database.js';
import { apiError, ErrorCodes } from '../apiErrors.js';

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

function runPreviewScript(payload: Record<string, unknown>) {
  const scriptPath = join(PROJECT_ROOT, 'worker/scripts/preview_tts_align.py');
  return spawnSync(resolveWorkerPython(), [scriptPath], {
    cwd: PROJECT_ROOT,
    env: process.env,
    input: JSON.stringify(payload),
    encoding: 'utf-8',
    timeout: 120_000,
  });
}

router.post('/preview-segment', (req: Request, res: Response) => {
  const text = String(req.body?.text || '').trim();
  if (!text) {
    return apiError(res, ErrorCodes.VALIDATION, 'text is required', 400);
  }

  const previewDir = join(getDataDir(), 'uploads', 'tts-preview');
  mkdirSync(previewDir, { recursive: true });

  const fileStem = `seg-${uuidv4().slice(0, 12)}`;
  const result = runPreviewScript({
    text,
    output_dir: previewDir,
    file_stem: fileStem,
    voice_id: String(req.body?.voice_id || '').trim(),
    voice_sample: String(req.body?.voice_sample || '').trim(),
    aligner: String(req.body?.aligner || 'whisper').trim(),
  });

  if (result.status !== 0) {
    let message = (result.stderr || result.stdout || 'preview TTS failed').trim();
    try {
      const parsed = JSON.parse(message) as { error?: string };
      if (parsed.error) message = parsed.error;
    } catch {
      /* keep raw stderr */
    }
    return apiError(res, ErrorCodes.INTERNAL, message.slice(-2000), 500);
  }

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(String(result.stdout || '{}'));
  } catch {
    return apiError(res, ErrorCodes.INTERNAL, 'Invalid preview TTS response', 500);
  }

  const filename = String(data.audio_filename || `${fileStem}.wav`);
  res.json({
    audio_url: `/uploads/tts-preview/${filename}`,
    duration_sec: Number(data.duration_sec || 0),
    word_timings: Array.isArray(data.word_timings) ? data.word_timings : [],
    word_timing_source: data.word_timing_source === 'whisper' ? 'whisper' : 'heuristic',
    tts_provider: String(data.tts_provider || 'edge'),
  });
});

export default router;