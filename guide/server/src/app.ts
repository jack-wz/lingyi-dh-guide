import express from 'express';
import cors from 'cors';
import { join } from 'path';
import { getDataDir, getDb } from './db/database.js';
import templatesRouter from './routes/templates.js';
import digitalHumansRouter from './routes/digital-humans.js';
import uploadsRouter from './routes/uploads.js';
import rendersRouter from './routes/renders.js';
import hyperframesRouter from './routes/hyperframes.js';
import configRouter from './routes/config.js';
import assetsRouter from './routes/assets.js';
import tasksRouter from './routes/tasks.js';
import opsRouter from './routes/ops.js';
import libraryRouter from './routes/library.js';
import aiRouter from './routes/ai.js';
import ttsRouter from './routes/tts.js';
import projectsRouter from './routes/projects.js';
import proposalsRouter from './routes/proposals.js';
import recipesRouter from './routes/recipes.js';
import segmentRegenRouter from './routes/segment_regen.js';
import assetWorkbenchRouter from './routes/asset_workbench.js';
import editorPreviewRouter from './routes/editor_preview.js';
import reviewRouter from './routes/review.js';
import metricsRouter from './routes/metrics.js';

import { getBrandFontsStaticDir } from './brand-fonts.js';
import { ErrorCodes, apiError, listErrorCatalog } from './apiErrors.js';

export function createApp() {
  const app = express();
  const dataDir = getDataDir();

  app.use(cors());
  app.use(express.json({ limit: '50mb' }));

  app.use('/uploads', express.static(join(dataDir, 'uploads')));
  app.use('/renders', express.static(join(dataDir, 'renders')));
  app.use('/brand-fonts', express.static(getBrandFontsStaticDir(dataDir)));

  getDb();

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Alias for integrator smoke when hitting guide server directly (CI / start-guide-internal).
  app.get('/api/guide/health', (_req, res) => {
    res.json({ status: 'ok', service: 'guide', timestamp: new Date().toISOString() });
  });

  app.use('/api/templates', templatesRouter);
  app.use('/api/digital-humans', digitalHumansRouter);
  app.use('/api/uploads', uploadsRouter);
  app.use('/api/renders', rendersRouter);
  app.use('/api/hyperframes', hyperframesRouter);
  app.use('/api/config', configRouter);
  app.use('/api/assets', assetsRouter);
  app.use('/api/tasks', tasksRouter);
  app.use('/api/ops', opsRouter);
  app.use('/api/library', libraryRouter);
  app.use('/api/ai', aiRouter);
  app.use('/api/tts', ttsRouter);
  app.use('/api/projects', projectsRouter);
  app.use('/api/projects', proposalsRouter);
  app.use('/api/recipes', recipesRouter);
  app.use('/api/segment-regen', segmentRegenRouter);
  app.use('/api/assets', assetWorkbenchRouter);
  app.use('/api/editor-preview', editorPreviewRouter);
  app.use('/api/review', reviewRouter);
  app.use('/api/metrics', metricsRouter);

  app.get('/api/error-catalog', (_req, res) => {
    res.json({ errors: listErrorCatalog() });
  });

  app.use('/api', (_req, res) => {
    apiError(res, ErrorCodes.NOT_FOUND, 'API route not found', 404);
  });

  return app;
}
