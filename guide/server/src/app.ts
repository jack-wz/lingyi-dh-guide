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

export function createApp() {
  const app = express();
  const dataDir = getDataDir();

  app.use(cors());
  app.use(express.json({ limit: '50mb' }));

  app.use('/uploads', express.static(join(dataDir, 'uploads')));
  app.use('/renders', express.static(join(dataDir, 'renders')));

  getDb();

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use('/api/templates', templatesRouter);
  app.use('/api/digital-humans', digitalHumansRouter);
  app.use('/api/uploads', uploadsRouter);
  app.use('/api/renders', rendersRouter);
  app.use('/api/hyperframes', hyperframesRouter);
  app.use('/api/config', configRouter);

  return app;
}
