import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/database.js';

const router = Router();
const ASSET_TYPES = ['image', 'video', 'audio', 'sticker', 'logo', 'file'] as const;

function parseMetadata(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === 'object') return raw as Record<string, unknown>;
  try {
    return JSON.parse(String(raw));
  } catch {
    return {};
  }
}

function serializeAsset(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    file_url: row.file_url,
    metadata: parseMetadata(row.metadata),
    created_at: row.created_at,
  };
}

router.get('/', (req: Request, res: Response) => {
  const db = getDb();
  const typeFilter = String(req.query.type || '').trim();
  const q = String(req.query.q || '').trim().toLowerCase();
  const limit = Math.min(200, Math.max(1, Number(req.query.limit || 100)));

  let sql = 'SELECT * FROM assets';
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (typeFilter) {
    const types = typeFilter.split(',').map((t) => t.trim()).filter(Boolean);
    if (types.length) {
      clauses.push(`type IN (${types.map(() => '?').join(',')})`);
      params.push(...types);
    }
  }
  if (q) {
    clauses.push('(LOWER(name) LIKE ? OR LOWER(file_url) LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }
  if (clauses.length) sql += ` WHERE ${clauses.join(' AND ')}`;
  sql += ' ORDER BY datetime(created_at) DESC LIMIT ?';
  params.push(limit);

  const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
  res.json({ items: rows.map(serializeAsset), total: rows.length });
});

router.post('/', (req: Request, res: Response) => {
  const { name, type, file_url, metadata } = req.body || {};
  if (!file_url || typeof file_url !== 'string') {
    return res.status(400).json({ error: 'file_url is required' });
  }
  const assetType = typeof type === 'string' && ASSET_TYPES.includes(type as typeof ASSET_TYPES[number])
    ? type
    : 'file';
  const id = uuidv4();
  const db = getDb();
  db.prepare(
    'INSERT INTO assets (id, name, type, file_url, metadata) VALUES (?, ?, ?, ?, ?)',
  ).run(
    id,
    typeof name === 'string' && name.trim() ? name.trim() : file_url.split('/').pop() || 'asset',
    assetType,
    file_url,
    JSON.stringify(metadata && typeof metadata === 'object' ? metadata : {}),
  );
  const row = db.prepare('SELECT * FROM assets WHERE id = ?').get(id) as Record<string, unknown>;
  res.status(201).json(serializeAsset(row));
});

router.put('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM assets WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!existing) return res.status(404).json({ error: 'Asset not found' });

  const name = req.body?.name != null ? String(req.body.name).trim() : String(existing.name);
  const type = req.body?.type != null ? String(req.body.type) : String(existing.type);
  const fileUrl = req.body?.file_url != null ? String(req.body.file_url) : String(existing.file_url);
  const metadata = req.body?.metadata != null
    ? JSON.stringify(req.body.metadata && typeof req.body.metadata === 'object' ? req.body.metadata : {})
    : String(existing.metadata || '{}');

  db.prepare('UPDATE assets SET name = ?, type = ?, file_url = ?, metadata = ? WHERE id = ?')
    .run(name, type, fileUrl, metadata, req.params.id);

  const row = db.prepare('SELECT * FROM assets WHERE id = ?').get(req.params.id) as Record<string, unknown>;
  res.json(serializeAsset(row));
});

router.delete('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM assets WHERE id = ?').run(req.params.id);
  if (!result.changes) return res.status(404).json({ error: 'Asset not found' });
  res.json({ success: true });
});

export function inferAssetType(filename: string, mimeType = ''): string {
  const lower = filename.toLowerCase();
  if (/\.(gif|png|jpe?g|webp|svg)$/i.test(lower) || mimeType.startsWith('image/')) {
    return /\.gif$/i.test(lower) ? 'sticker' : 'image';
  }
  if (/\.(mp4|mov|webm|avi)$/i.test(lower) || mimeType.startsWith('video/')) return 'video';
  if (/\.(mp3|wav|m4a|ogg)$/i.test(lower) || mimeType.startsWith('audio/')) return 'audio';
  return 'file';
}

export function registerUploadedAsset(
  file: { filename: string; originalname: string; size: number; mimetype: string },
  url: string,
) {
  const db = getDb();
  const id = uuidv4();
  const type = inferAssetType(file.originalname || file.filename, file.mimetype);
  db.prepare(
    'INSERT INTO assets (id, name, type, file_url, metadata) VALUES (?, ?, ?, ?, ?)',
  ).run(
    id,
    file.originalname || file.filename,
    type,
    url,
    JSON.stringify({
      source: 'upload',
      filename: file.filename,
      size: file.size,
      mime_type: file.mimetype,
    }),
  );
  return id;
}

export default router;