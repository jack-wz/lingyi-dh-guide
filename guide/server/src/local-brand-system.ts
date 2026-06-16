import { readFileSync, existsSync, mkdirSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { brandDocToLibraryPayload, parseBrandAssetDocs } from '../../shared/brandYaml.js';
import { getDataDir } from './db/database.js';
import { enrichBrandPackFontsLocal } from './brand-fonts.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const LOCAL_BRAND_EXTERNAL_ID = 'local:brand:default';

const BUNDLED_BRAND_DIR = join(__dirname, '../../data/brand-system/default');

export function getLocalBrandSystemDir(dataDir?: string): string {
  const base = dataDir || getDataDir();
  const userDir = join(base, 'brand-system', 'default');
  if (!existsSync(join(userDir, 'design.md')) && existsSync(join(BUNDLED_BRAND_DIR, 'design.md'))) {
    mkdirSync(userDir, { recursive: true });
    copyFileSync(join(BUNDLED_BRAND_DIR, 'design.md'), join(userDir, 'design.md'));
    if (existsSync(join(BUNDLED_BRAND_DIR, 'frame.md'))) {
      copyFileSync(join(BUNDLED_BRAND_DIR, 'frame.md'), join(userDir, 'frame.md'));
    }
  }
  return userDir;
}

export function readLocalBrandMarkdown(dataDir?: string): { designMd: string; frameMd: string } | null {
  const dir = getLocalBrandSystemDir(dataDir);
  const designPath = join(dir, 'design.md');
  const framePath = join(dir, 'frame.md');
  if (!existsSync(designPath)) return null;
  return {
    designMd: readFileSync(designPath, 'utf-8'),
    frameMd: existsSync(framePath) ? readFileSync(framePath, 'utf-8') : '',
  };
}

function findByExternalId(db: Database.Database, externalId: string): string | null {
  const row = db.prepare(
    `SELECT id FROM library_items
     WHERE category = 'brand' AND json_extract(payload_json, '$.external_id') = ?`,
  ).get(externalId) as { id: string } | undefined;
  return row?.id || null;
}

export function seedLocalBrandSystem(db: Database.Database, dataDir?: string): 'imported' | 'updated' | 'skipped' {
  const files = readLocalBrandMarkdown(dataDir);
  if (!files) return 'skipped';

  const doc = parseBrandAssetDocs(files.designMd, files.frameMd);
  const rawFonts = Array.isArray((doc.design.typography as { fonts?: unknown[] }).fonts)
    ? (doc.design.typography as { fonts: Array<{ name: string; family: string; style?: string; class?: string }> }).fonts
    : [];
  const enrichedFonts = enrichBrandPackFontsLocal(rawFonts, dataDir);
  doc.design.typography = { ...doc.design.typography, fonts: enrichedFonts };
  const payload = brandDocToLibraryPayload(doc, {
    external_id: LOCAL_BRAND_EXTERNAL_ID,
    source: 'local',
    category: 'general',
  });

  const existingId = findByExternalId(db, LOCAL_BRAND_EXTERNAL_ID);
  if (existingId) {
    db.prepare(
      `UPDATE library_items SET name = ?, description = ?, tags = ?, payload_json = ?, updated_at = datetime('now')
       WHERE id = ?`,
    ).run(
      doc.design.name || '默认品牌包',
      doc.design.description || '',
      JSON.stringify(['本地', '品牌包', '导购']),
      JSON.stringify(payload),
      existingId,
    );
    return 'updated';
  }

  db.prepare(
    `INSERT INTO library_items (id, category, name, description, tags, file_url, parent_id, payload_json)
     VALUES (?, 'brand', ?, ?, ?, '', '', ?)`,
  ).run(
    uuidv4(),
    doc.design.name || '默认品牌包',
    doc.design.description || '',
    JSON.stringify(['本地', '品牌包', '导购']),
    JSON.stringify(payload),
  );
  return 'imported';
}

export function reloadLocalBrandFromDisk(db: Database.Database, dataDir?: string) {
  return seedLocalBrandSystem(db, dataDir);
}