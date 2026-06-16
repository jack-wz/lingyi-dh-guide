import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/database.js';
import { readFileSync, existsSync } from 'fs';
import { importExternalCatalog, type CatalogImportOptions } from '../import-external-catalog.js';
import { buildBrandPackPayload, parseDesignMd, parseFrameMd } from '../../../shared/brandPack.js';
import { brandDocToLibraryPayload, parseBrandAssetDocs } from '../../../shared/brandYaml.js';
import { readLocalBrandMarkdown, reloadLocalBrandFromDisk } from '../local-brand-system.js';
import { enrichBrandPackFontsLocal, scanBrandFontCatalog } from '../brand-fonts.js';
import { getDataDir } from '../db/database.js';

const router = Router();

export const LIBRARY_CATEGORIES = [
  'digital_human',
  'template',
  'brand',
  'voice',
  'script',
  'knowledge',
  'knowledge_doc',
  'media',
] as const;

type LibraryCategory = typeof LIBRARY_CATEGORIES[number];
type StoredCategory = 'brand' | 'voice' | 'script' | 'knowledge' | 'knowledge_doc';

const STORED_CATEGORIES = new Set<StoredCategory>(['brand', 'voice', 'script', 'knowledge', 'knowledge_doc']);

function parseJson<T>(raw: unknown, fallback: T): T {
  if (raw == null || raw === '') return fallback;
  if (typeof raw === 'object') return raw as T;
  try {
    return JSON.parse(String(raw)) as T;
  } catch {
    return fallback;
  }
}

function serializeLibraryRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    category: row.category,
    name: row.name,
    description: row.description || '',
    status: row.status || 'active',
    tags: parseJson<string[]>(row.tags, []),
    file_url: row.file_url || '',
    parent_id: row.parent_id || '',
    payload: parseJson<Record<string, unknown>>(row.payload_json, {}),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function normalizeCategory(raw: unknown): LibraryCategory | null {
  const value = String(raw || '').trim() as LibraryCategory;
  return LIBRARY_CATEGORIES.includes(value) ? value : null;
}

function listDigitalHumans(q: string, limit: number) {
  const db = getDb();
  let sql = 'SELECT * FROM digital_humans';
  const params: unknown[] = [];
  if (q) {
    sql += ' WHERE LOWER(name) LIKE ?';
    params.push(`%${q.toLowerCase()}%`);
  }
  sql += ' ORDER BY datetime(updated_at) DESC LIMIT ?';
  params.push(limit);
  const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    id: row.id,
    category: 'digital_human' as const,
    name: row.name,
    description: row.training_error || '',
    status: row.status,
    tags: [],
    file_url: row.face_photo_url || '',
    parent_id: '',
    payload: {
      face_photo_url: row.face_photo_url,
      half_body_photo_url: row.half_body_photo_url,
      half_body_cutout_url: row.half_body_cutout_url,
      full_body_photo_url: row.full_body_photo_url,
      voice_sample_url: row.voice_sample_url,
      voice_clone_id: row.voice_clone_id,
      image_model_id: row.image_model_id,
    },
    created_at: row.created_at,
    updated_at: row.updated_at,
    link: `/digital-humans/${row.id}`,
  }));
}

function listTemplates(q: string, limit: number) {
  const db = getDb();
  let sql = 'SELECT id, name, type, description, cover_url, status, version, created_at, updated_at FROM templates';
  const params: unknown[] = [];
  if (q) {
    sql += ' WHERE LOWER(name) LIKE ? OR LOWER(description) LIKE ?';
    params.push(`%${q.toLowerCase()}%`, `%${q.toLowerCase()}%`);
  }
  sql += ' ORDER BY datetime(updated_at) DESC LIMIT ?';
  params.push(limit);
  const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    id: row.id,
    category: 'template' as const,
    name: row.name,
    description: row.description || '',
    status: row.status,
    tags: row.type ? [row.type] : [],
    file_url: row.cover_url || '',
    parent_id: '',
    payload: { type: row.type, version: row.version },
    created_at: row.created_at,
    updated_at: row.updated_at,
    link: `/editor/${row.id}`,
  }));
}

function listMedia(q: string, limit: number) {
  const db = getDb();
  let sql = 'SELECT * FROM assets';
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (q) {
    clauses.push('(LOWER(name) LIKE ? OR LOWER(file_url) LIKE ?)');
    params.push(`%${q.toLowerCase()}%`, `%${q.toLowerCase()}%`);
  }
  if (clauses.length) sql += ` WHERE ${clauses.join(' AND ')}`;
  sql += ' ORDER BY datetime(created_at) DESC LIMIT ?';
  params.push(limit);
  const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    id: row.id,
    category: 'media' as const,
    name: row.name,
    description: '',
    status: 'active',
    tags: [row.type],
    file_url: row.file_url,
    parent_id: '',
    payload: parseJson(row.metadata, {}),
    created_at: row.created_at,
    updated_at: row.created_at,
    link: row.file_url,
  }));
}

function listVoiceItems(q: string, subType: string, limit: number) {
  const stored = listStored('voice', q, '', limit * 2) as Array<ReturnType<typeof serializeLibraryRow>>;
  const db = getDb();
  let sql = "SELECT * FROM assets WHERE type IN ('audio', 'bgm', 'sound', 'music')";
  const params: unknown[] = [];
  if (q) {
    sql += ' AND (LOWER(name) LIKE ? OR LOWER(file_url) LIKE ?)';
    params.push(`%${q.toLowerCase()}%`, `%${q.toLowerCase()}%`);
  }
  sql += ' ORDER BY datetime(created_at) DESC LIMIT ?';
  params.push(limit);
  const audioRows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;

  const ttsItems = stored
    .filter((row) => String(row.payload?.kind || 'tts') !== 'bgm')
    .map((row) => ({ ...row, payload: { kind: 'tts', ...row.payload } }));

  const bgmStored = stored
    .filter((row) => String(row.payload?.kind) === 'bgm')
    .map((row) => ({ ...row, payload: { kind: 'bgm', ...row.payload } }));

  const bgmAssets = audioRows.map((row) => ({
    id: `asset-${row.id}`,
    category: 'voice' as const,
    name: row.name,
    description: '',
    status: 'active',
    tags: [String(row.type)],
    file_url: row.file_url,
    parent_id: '',
    payload: { kind: 'bgm', source: 'assets', asset_id: row.id, ...parseJson(row.metadata, {}) },
    created_at: row.created_at,
    updated_at: row.created_at,
  }));

  const bgmItems = [...bgmStored, ...bgmAssets];
  if (subType === 'tts') return ttsItems.slice(0, limit);
  if (subType === 'bgm') return bgmItems.slice(0, limit);
  return [...ttsItems, ...bgmItems].slice(0, limit);
}

function listStored(category: StoredCategory, q: string, parentId: string, limit: number) {
  const db = getDb();
  let sql = 'SELECT * FROM library_items WHERE category = ?';
  const params: unknown[] = [category];
  if (parentId) {
    sql += ' AND parent_id = ?';
    params.push(parentId);
  }
  if (q) {
    sql += ' AND (LOWER(name) LIKE ? OR LOWER(description) LIKE ?)';
    params.push(`%${q.toLowerCase()}%`, `%${q.toLowerCase()}%`);
  }
  sql += ' ORDER BY datetime(updated_at) DESC LIMIT ?';
  params.push(limit);
  const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
  return rows.map(serializeLibraryRow);
}

router.get('/summary', (_req: Request, res: Response) => {
  const db = getDb();
  const counts = {
    digital_human: (db.prepare('SELECT COUNT(*) AS c FROM digital_humans').get() as { c: number }).c,
    template: (db.prepare('SELECT COUNT(*) AS c FROM templates').get() as { c: number }).c,
    brand: (db.prepare("SELECT COUNT(*) AS c FROM library_items WHERE category = 'brand'").get() as { c: number }).c,
    voice:
      (db.prepare("SELECT COUNT(*) AS c FROM library_items WHERE category = 'voice'").get() as { c: number }).c
      + (db.prepare("SELECT COUNT(*) AS c FROM assets WHERE type IN ('audio', 'bgm', 'sound', 'music')").get() as { c: number }).c,
    script: (db.prepare("SELECT COUNT(*) AS c FROM library_items WHERE category = 'script'").get() as { c: number }).c,
    knowledge: (db.prepare("SELECT COUNT(*) AS c FROM library_items WHERE category = 'knowledge'").get() as { c: number }).c,
    knowledge_doc: (db.prepare("SELECT COUNT(*) AS c FROM library_items WHERE category = 'knowledge_doc'").get() as { c: number }).c,
    media: (db.prepare('SELECT COUNT(*) AS c FROM assets').get() as { c: number }).c,
  };
  res.json({ counts, categories: LIBRARY_CATEGORIES });
});

router.get('/', (req: Request, res: Response) => {
  const category = normalizeCategory(req.query.category);
  const q = String(req.query.q || '').trim();
  const parentId = String(req.query.parent_id || '').trim();
  const subType = String(req.query.sub_type || '').trim();
  const limit = Math.min(200, Math.max(1, Number(req.query.limit || 100)));

  if (!category) {
    return res.status(400).json({ error: `category is required. Allowed: ${LIBRARY_CATEGORIES.join(', ')}` });
  }

  let items: unknown[] = [];
  if (category === 'digital_human') items = listDigitalHumans(q, limit);
  else if (category === 'template') items = listTemplates(q, limit);
  else if (category === 'media') items = listMedia(q, limit);
  else if (category === 'voice') {
    items = listVoiceItems(q, subType, limit);
  }
  else if (STORED_CATEGORIES.has(category as StoredCategory)) {
    items = listStored(category as StoredCategory, q, parentId, limit);
  }

  res.json({ category, items, total: items.length });
});

router.get('/brand/fonts', (_req: Request, res: Response) => {
  try {
    res.json({ fonts: scanBrandFontCatalog(getDataDir()) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Font catalog failed' });
  }
});

router.get('/brand/local-template', (_req: Request, res: Response) => {
  const files = readLocalBrandMarkdown(getDataDir());
  if (!files) return res.status(404).json({ error: 'Local brand template not found' });
  res.json(files);
});

router.post('/brand/reload-local', (_req: Request, res: Response) => {
  const db = getDb();
  try {
    const result = reloadLocalBrandFromDisk(db, getDataDir());
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Reload failed' });
  }
});

router.post('/import-catalog', (req: Request, res: Response) => {
  const db = getDb();
  const options: CatalogImportOptions = {
    openStorylineRoot: req.body?.open_storyline_root,
    opentalkingRoot: req.body?.opentalking_root,
    bgmLimit: req.body?.bgm_limit != null ? Number(req.body.bgm_limit) : undefined,
  };
  try {
    const result = importExternalCatalog(db, options);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Import failed' });
  }
});

router.post('/brand/import-md', (req: Request, res: Response) => {
  const designMd = String(req.body?.design_md || '').trim();
  if (!designMd) return res.status(400).json({ error: 'design_md is required' });

  const frameMd = String(req.body?.frame_md || '').trim();
  const doc = parseBrandAssetDocs(designMd, frameMd);
  const rawFonts = Array.isArray((doc.design.typography as { fonts?: unknown[] }).fonts)
    ? (doc.design.typography as { fonts: Array<{ name: string; family: string; style?: string; class?: string }> }).fonts
    : [];
  doc.design.typography = {
    ...doc.design.typography,
    fonts: enrichBrandPackFontsLocal(rawFonts, getDataDir()),
  };
  const payload = brandDocToLibraryPayload(doc, {
    external_id: `custom:brand:${Date.now()}`,
    source: 'custom',
    category: String(req.body?.category || 'general'),
    logo_label: String(req.body?.logo_label || doc.design.name.slice(0, 4) || '品牌'),
  });

  const name = String(req.body?.name || doc.design.name).trim();
  const id = uuidv4();
  const db = getDb();
  db.prepare(
    `INSERT INTO library_items (id, category, name, description, tags, file_url, parent_id, payload_json)
     VALUES (?, 'brand', ?, ?, ?, '', '', ?)`,
  ).run(
    id,
    name,
    doc.design.description,
    JSON.stringify(['custom', '品牌包']),
    JSON.stringify(payload),
  );

  const row = db.prepare('SELECT * FROM library_items WHERE id = ?').get(id) as Record<string, unknown>;
  res.status(201).json(serializeLibraryRow(row));
});

router.post('/brand/import-files', (req: Request, res: Response) => {
  const designPath = String(req.body?.design_path || '').trim();
  const framePath = String(req.body?.frame_path || '').trim();
  if (!designPath || !existsSync(designPath)) {
    return res.status(400).json({ error: 'design_path must exist on server' });
  }
  const design = parseDesignMd(readFileSync(designPath, 'utf-8'));
  if (!design) return res.status(400).json({ error: 'Failed to parse design.md' });
  const frame = framePath && existsSync(framePath) ? parseFrameMd(readFileSync(framePath, 'utf-8')) : null;
  const payload = buildBrandPackPayload(design, frame, { source: 'import', category: 'general' });
  const id = uuidv4();
  const db = getDb();
  db.prepare(
    `INSERT INTO library_items (id, category, name, description, tags, file_url, parent_id, payload_json)
     VALUES (?, 'brand', ?, ?, ?, '', '', ?)`,
  ).run(id, design.name, design.description, JSON.stringify(['import', '品牌包']), JSON.stringify(payload));
  const row = db.prepare('SELECT * FROM library_items WHERE id = ?').get(id) as Record<string, unknown>;
  res.status(201).json(serializeLibraryRow(row));
});

router.get('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM library_items WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!row) return res.status(404).json({ error: 'Library item not found' });
  res.json(serializeLibraryRow(row));
});

router.post('/', (req: Request, res: Response) => {
  const category = normalizeCategory(req.body?.category);
  if (!category || !STORED_CATEGORIES.has(category as StoredCategory)) {
    return res.status(400).json({
      error: `Only stored categories can be created here: ${[...STORED_CATEGORIES].join(', ')}`,
    });
  }

  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'name is required' });

  const id = uuidv4();
  const db = getDb();
  db.prepare(
    `INSERT INTO library_items (
      id, category, name, description, status, tags, file_url, parent_id, payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    category,
    name,
    String(req.body?.description || ''),
    req.body?.status === 'archived' ? 'archived' : 'active',
    JSON.stringify(Array.isArray(req.body?.tags) ? req.body.tags : []),
    String(req.body?.file_url || ''),
    String(req.body?.parent_id || ''),
    JSON.stringify(req.body?.payload && typeof req.body.payload === 'object' ? req.body.payload : {}),
  );

  const row = db.prepare('SELECT * FROM library_items WHERE id = ?').get(id) as Record<string, unknown>;
  res.status(201).json(serializeLibraryRow(row));
});

router.put('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM library_items WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!existing) return res.status(404).json({ error: 'Library item not found' });

  const fields: string[] = [];
  const values: unknown[] = [];
  const setField = (column: string, value: unknown) => {
    fields.push(`${column} = ?`);
    values.push(value);
  };

  if (req.body?.name != null) setField('name', String(req.body.name).trim());
  if (req.body?.description != null) setField('description', String(req.body.description));
  if (req.body?.status != null) setField('status', req.body.status === 'archived' ? 'archived' : 'active');
  if (req.body?.tags != null) setField('tags', JSON.stringify(Array.isArray(req.body.tags) ? req.body.tags : []));
  if (req.body?.file_url != null) setField('file_url', String(req.body.file_url));
  if (req.body?.parent_id != null) setField('parent_id', String(req.body.parent_id));
  if (req.body?.payload != null) {
    let payload = req.body.payload && typeof req.body.payload === 'object' ? req.body.payload as Record<string, unknown> : {};
    if (existing.category === 'brand') {
      const oldPayload = parseJson<Record<string, unknown>>(existing.payload_json, {});
      const designMd = String(payload.design_markdown || oldPayload.design_markdown || '').trim();
      const frameMd = String(payload.frame_markdown || oldPayload.frame_markdown || '').trim();
      if (designMd) {
        const doc = parseBrandAssetDocs(designMd, frameMd);
        const rawFonts = Array.isArray((doc.design.typography as { fonts?: unknown[] }).fonts)
          ? (doc.design.typography as { fonts: Array<{ name: string; family: string; style?: string; class?: string }> }).fonts
          : [];
        doc.design.typography = {
          ...doc.design.typography,
          fonts: enrichBrandPackFontsLocal(rawFonts, getDataDir()),
        };
        payload = brandDocToLibraryPayload(doc, { ...oldPayload, ...payload });
        if (req.body?.name == null && doc.design.name) setField('name', doc.design.name);
        if (req.body?.description == null) setField('description', doc.design.description);
      }
    }
    setField('payload_json', JSON.stringify(payload));
  }

  if (!fields.length) return res.status(400).json({ error: 'No fields to update' });

  setField('updated_at', new Date().toISOString().slice(0, 19).replace('T', ' '));
  values.push(req.params.id);
  db.prepare(`UPDATE library_items SET ${fields.join(', ')} WHERE id = ?`).run(...values);

  const row = db.prepare('SELECT * FROM library_items WHERE id = ?').get(req.params.id) as Record<string, unknown>;
  res.json(serializeLibraryRow(row));
});

router.delete('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM library_items WHERE id = ?').run(req.params.id);
  if (!result.changes) return res.status(404).json({ error: 'Library item not found' });
  db.prepare('DELETE FROM library_items WHERE parent_id = ?').run(req.params.id);
  res.json({ success: true });
});

export default router;