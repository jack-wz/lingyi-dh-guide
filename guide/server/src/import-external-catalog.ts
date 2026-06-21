import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'fs';
import { basename, extname, join } from 'path';
import type Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { buildBrandPackPayload, parseDesignMd, parseFrameMd } from '../../shared/brandPack.js';
import { enrichBrandPackFontsLocal } from './brand-fonts.js';
import { cutoutUrlFromPhotoUrl, mattingDigitalHumanImage } from './digital-human-matting.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface CatalogImportOptions {
  openStorylineRoot?: string;
  opentalkingRoot?: string;
  bgmLimit?: number;
  dataDir?: string;
}

export interface CatalogImportResult {
  scripts: { imported: number; skipped: number };
  bgms: { imported: number; skipped: number; copied: number };
  brands: { imported: number; skipped: number; updated?: number };
  voices: { imported: number; skipped: number };
  digital_humans: { imported: number; skipped: number; matted: number };
  sources: { openStoryline: string; opentalking: string };
}

const DEFAULT_OPENSTORYLINE = join(__dirname, '../../data/external/openstoryline');
const DEFAULT_OPENTALKING = '/Users/wuzhu/Documents/AI 产品/数字人/零一数字人导购平台/项目demo/opentalking';

function resolveRoots(options: CatalogImportOptions = {}) {
  return {
    openStoryline: options.openStorylineRoot || process.env.OPENSTORYLINE_ROOT || DEFAULT_OPENSTORYLINE,
    opentalking: options.opentalkingRoot || process.env.OPENTALKING_ROOT || DEFAULT_OPENTALKING,
    bgmLimit: options.bgmLimit ?? Number(process.env.CATALOG_BGM_LIMIT || 30),
  };
}

function findByExternalId(db: Database.Database, category: string, externalId: string): string | null {
  const row = db.prepare(
    `SELECT id FROM library_items
     WHERE category = ? AND json_extract(payload_json, '$.external_id') = ?`,
  ).get(category, externalId) as { id: string } | undefined;
  return row?.id || null;
}

function insertLibraryItem(
  db: Database.Database,
  category: string,
  item: {
    name: string;
    description?: string;
    tags?: string[];
    file_url?: string;
    payload: Record<string, unknown>;
  },
  options: { upsert?: boolean } = {},
): 'imported' | 'skipped' | 'updated' {
  const externalId = String(item.payload.external_id || '');
  const existingId = externalId ? findByExternalId(db, category, externalId) : null;
  if (existingId) {
    if (!options.upsert) return 'skipped';
    db.prepare(
      `UPDATE library_items SET name = ?, description = ?, tags = ?, file_url = ?, payload_json = ?, updated_at = datetime('now')
       WHERE id = ?`,
    ).run(
      item.name,
      item.description || '',
      JSON.stringify(item.tags || []),
      item.file_url || '',
      JSON.stringify(item.payload),
      existingId,
    );
    return 'updated';
  }

  db.prepare(
    `INSERT INTO library_items (id, category, name, description, tags, file_url, parent_id, payload_json)
     VALUES (?, ?, ?, ?, ?, ?, '', ?)`,
  ).run(
    uuidv4(),
    category,
    item.name,
    item.description || '',
    JSON.stringify(item.tags || []),
    item.file_url || '',
    JSON.stringify(item.payload),
  );
  return 'imported';
}

function resolveOpenStorylinePath(root: string, catalogPath: string): string {
  const normalized = catalogPath.replace(/^\.\//, '').replace(/^resource\//, '');
  const candidates = [
    join(root, normalized),
    join(root, 'resource', normalized),
    join(root, 'resource', normalized.replace(/^script_templates\//, 'script_templates/')),
    join(root, basename(normalized)),
  ];
  if (normalized.includes('script_templates/')) {
    candidates.unshift(join(root, 'script_templates', basename(normalized)));
  }
  if (normalized.includes('bgms/')) {
    candidates.unshift(join(root, 'bgms', basename(normalized)));
    candidates.unshift(join(root, 'resource', 'bgms', basename(normalized)));
  }
  return candidates.find((p) => existsSync(p)) || candidates[0];
}

function resolveDataDir(options: CatalogImportOptions): string {
  return options.dataDir || process.env.DATA_DIR || join(__dirname, '../../data');
}

function copyAudioToUploads(srcPath: string, externalId: string, dataDir: string): string {
  if (!existsSync(srcPath)) return '';
  const uploadsDir = join(dataDir, 'uploads');
  if (!existsSync(uploadsDir)) mkdirSync(uploadsDir, { recursive: true });
  const ext = extname(srcPath) || '.mp3';
  const destName = `catalog-bgm-${externalId.replace(/[^a-z0-9]/gi, '').slice(0, 16)}${ext}`;
  const destPath = join(uploadsDir, destName);
  if (!existsSync(destPath)) copyFileSync(srcPath, destPath);
  return `/uploads/${destName}`;
}

function parseOpentalkingDesignLegacy(designPath: string) {
  const design = existsSync(designPath) ? parseDesignMd(readFileSync(designPath, 'utf-8')) : null;
  if (!design) return null;
  return {
    name: design.name,
    description: design.description,
    brandColor: design.colors['digital-orange'] || '#ff5600',
    backgroundColor: design.colors['soft-pink'] || '#fff0e8',
    accentColor: design.colors['trust-blue'] || '#2563eb',
    textColor: design.colors['light-text'] || '#ffffff',
    bgms: design.typography.bgms,
  };
}

function importOpenStorylineScripts(db: Database.Database, root: string) {
  const metaPath = join(root, 'script_templates', 'meta.json');
  if (!existsSync(metaPath)) return { imported: 0, skipped: 0 };

  const meta = JSON.parse(readFileSync(metaPath, 'utf-8')) as Array<{
    id: string;
    path: string;
    description: string;
    tags: string[];
  }>;

  let imported = 0;
  let skipped = 0;
  for (const entry of meta) {
    const filePath = resolveOpenStorylinePath(root, entry.path);
    let content = '';
    if (existsSync(filePath)) {
      content = readFileSync(filePath, 'utf-8').trim();
    }
    const fileName = basename(entry.path, '.txt');
    const result = insertLibraryItem(db, 'script', {
      name: fileName,
      description: entry.description,
      tags: [...(entry.tags || []), 'OpenStoryline'],
      payload: {
        external_id: `openstoryline:script:${entry.id}`,
        source: 'openstoryline',
        content,
        format: 'plain',
        template_path: entry.path,
      },
    });
    if (result === 'imported') imported += 1;
    else skipped += 1;
  }
  return { imported, skipped };
}

function importOpenStorylineBgms(db: Database.Database, root: string, limit: number, dataDir: string) {
  const metaPath = join(root, 'bgms', 'meta.json');
  if (!existsSync(metaPath)) return { imported: 0, skipped: 0, copied: 0 };

  const meta = JSON.parse(readFileSync(metaPath, 'utf-8')) as Array<{
    id: string;
    path: string;
    description: string;
    scene?: string[];
    genre?: string[];
    mood?: string[];
    lang?: string[];
  }>;

  let imported = 0;
  let skipped = 0;
  let copied = 0;

  for (const entry of meta.slice(0, limit)) {
    const srcPath = resolveOpenStorylinePath(root, entry.path);
    const fileUrl = copyAudioToUploads(srcPath, entry.id, dataDir);
    if (fileUrl) copied += 1;

    const result = insertLibraryItem(db, 'voice', {
      name: basename(entry.path, extname(entry.path)),
      description: entry.description,
      tags: [...(entry.scene || []).slice(0, 2), 'BGM', 'OpenStoryline'],
      file_url: fileUrl,
      payload: {
        external_id: `openstoryline:bgm:${entry.id}`,
        source: 'openstoryline',
        kind: 'bgm',
        scene: entry.scene || [],
        genre: entry.genre || [],
        mood: entry.mood || [],
        lang: entry.lang || [],
        catalog_path: entry.path,
      },
    });
    if (result === 'imported') imported += 1;
    else skipped += 1;
  }
  return { imported, skipped, copied };
}

function importOpentalkingBrand(db: Database.Database, root: string, dataDir: string) {
  const designPath = join(root, '09_设计系统', 'design.md');
  const framePath = join(root, '09_设计系统', 'frame.md');
  if (!existsSync(designPath)) return { imported: 0, skipped: 0, updated: 0 };

  const designRaw = readFileSync(designPath, 'utf-8');
  const design = parseDesignMd(designRaw);
  if (!design) return { imported: 0, skipped: 0, updated: 0 };

  const frame = existsSync(framePath) ? parseFrameMd(readFileSync(framePath, 'utf-8')) : null;
  const payload = buildBrandPackPayload(design, frame, {
    external_id: 'opentalking:brand:design_default',
    source: 'opentalking',
    category: 'general',
    logo_label: '零一',
  });

  if (payload.tokens?.typography?.fonts?.length) {
    payload.tokens.typography.fonts = enrichBrandPackFontsLocal(
      payload.tokens.typography.fonts,
      dataDir,
    );
  }

  const result = insertLibraryItem(db, 'brand', {
    name: design.name,
    description: design.description,
    tags: ['opentalking', '导购', 'general', '品牌包'],
    payload,
  }, { upsert: true });

  return {
    imported: result === 'imported' ? 1 : 0,
    skipped: result === 'skipped' ? 1 : 0,
    updated: result === 'updated' ? 1 : 0,
  };
}

function importOpentalkingBgms(db: Database.Database, root: string, dataDir: string) {
  const design = parseOpentalkingDesignLegacy(join(root, '09_设计系统', 'design.md'));
  if (!design?.bgms.length) return { imported: 0, skipped: 0 };

  const publicBgms = join(root, 'apps', 'web', 'public', 'bgms');
  let imported = 0;
  let skipped = 0;

  for (const bgm of design.bgms) {
    const fileName = basename(bgm.url);
    const srcPath = join(publicBgms, fileName);
    const externalId = `opentalking:bgm:${fileName}`;
    const fileUrl = copyAudioToUploads(srcPath, externalId, dataDir);

    const result = insertLibraryItem(db, 'voice', {
      name: bgm.name,
      description: 'opentalking 设计系统内置 BGM',
      tags: ['BGM', 'opentalking'],
      file_url: fileUrl,
      payload: {
        external_id: externalId,
        source: 'opentalking',
        kind: 'bgm',
      },
    });
    if (result === 'imported') imported += 1;
    else skipped += 1;
  }
  return { imported, skipped };
}

function copyDigitalHumanAsset(srcPath: string, dhId: string, fileName: string, dataDir: string): string {
  if (!existsSync(srcPath)) return '';
  const uploadsDir = join(dataDir, 'uploads', 'digital-humans', dhId);
  mkdirSync(uploadsDir, { recursive: true });
  const destPath = join(uploadsDir, fileName);
  if (!existsSync(destPath)) copyFileSync(srcPath, destPath);
  return `/uploads/digital-humans/${dhId}/${fileName}`;
}

function importOpentalkingDigitalHumans(db: Database.Database, root: string, dataDir: string) {
  const dhRoot = join(root, 'data', 'shopping-guide', 'digital-humans');
  if (!existsSync(dhRoot)) return { imported: 0, skipped: 0, matted: 0 };

  let imported = 0;
  let skipped = 0;
  let matted = 0;

  for (const folder of readdirSync(dhRoot, { withFileTypes: true })) {
    if (!folder.isDirectory()) continue;
    const externalId = folder.name;
    const srcDir = join(dhRoot, externalId);
    const halfBodySrc = join(srcDir, 'half_body.png');
    if (!existsSync(halfBodySrc)) continue;

    const id = externalId.startsWith('dh_') ? externalId : `dh_${externalId.slice(0, 12)}`;
    const existing = db.prepare('SELECT id FROM digital_humans WHERE id = ?').get(id) as { id: string } | undefined;
    if (existing) {
      skipped += 1;
      continue;
    }

    const halfBodyUrl = copyDigitalHumanAsset(halfBodySrc, id, 'half_body.png', dataDir);
    const voiceSrc = join(srcDir, 'voice_sample.wav');
    const voiceUrl = existsSync(voiceSrc)
      ? copyDigitalHumanAsset(voiceSrc, id, 'voice_sample.wav', dataDir)
      : '';

    const cutoutDest = join(dataDir, 'uploads', 'digital-humans', id, 'half_body_cutout.png');
    const matting = mattingDigitalHumanImage(
      join(dataDir, 'uploads', 'digital-humans', id, 'half_body.png'),
      cutoutDest,
    );
    const cutoutUrl = matting.ok ? `/uploads/digital-humans/${id}/half_body_cutout.png` : '';
    if (matting.ok) matted += 1;
    else console.warn(`[catalog] DH matting skipped for ${id}: ${matting.error || 'unknown'}`);

    db.prepare(
      `INSERT INTO digital_humans (
        id, name, half_body_photo_url, half_body_cutout_url, voice_sample_url, status
      ) VALUES (?, ?, ?, ?, ?, 'ready')`,
    ).run(
      id,
      `opentalking ${externalId}`,
      halfBodyUrl,
      cutoutUrl || cutoutUrlFromPhotoUrl(halfBodyUrl),
      voiceUrl,
    );
    imported += 1;
  }

  return { imported, skipped, matted };
}

function importOpenStorylineTtsPresets(db: Database.Database, root: string) {
  const ttsPath = join(root, 'tts', 'tts_providers.json');
  if (!existsSync(ttsPath)) return { imported: 0, skipped: 0 };

  const presets = [
    { name: 'OpenStoryline 温润男声', voice_id: 'Chinese (Mandarin)_Gentleman', provider: 'minimax' },
    { name: 'OpenStoryline 少女音色', voice_id: 'female-shaonv-jingpin', provider: 'minimax' },
    { name: 'OpenStoryline 字节女声', voice_id: 'BV001_streaming', provider: 'bytedance' },
    { name: 'OpenStoryline 字节男声', voice_id: 'BV002_streaming', provider: 'bytedance' },
  ];

  let imported = 0;
  let skipped = 0;
  for (const preset of presets) {
    const result = insertLibraryItem(db, 'voice', {
      name: preset.name,
      description: '来自 OpenStoryline tts_providers.json',
      tags: ['TTS', 'OpenStoryline'],
      payload: {
        external_id: `openstoryline:tts:${preset.voice_id}`,
        source: 'openstoryline',
        kind: 'tts',
        provider: preset.provider,
        voice_id: preset.voice_id,
        language: 'zh-CN',
      },
    });
    if (result === 'imported') imported += 1;
    else skipped += 1;
  }
  return { imported, skipped };
}

export function importExternalCatalog(db: Database.Database, options: CatalogImportOptions = {}): CatalogImportResult {
  const roots = resolveRoots(options);
  const dataDir = resolveDataDir(options);
  const scripts = existsSync(roots.openStoryline)
    ? importOpenStorylineScripts(db, roots.openStoryline)
    : { imported: 0, skipped: 0 };
  const bgms = existsSync(roots.openStoryline)
    ? importOpenStorylineBgms(db, roots.openStoryline, roots.bgmLimit, dataDir)
    : { imported: 0, skipped: 0, copied: 0 };
  const brands = existsSync(roots.opentalking)
    ? importOpentalkingBrand(db, roots.opentalking, dataDir)
    : { imported: 0, skipped: 0 };
  const opentalkingBgms = existsSync(roots.opentalking)
    ? importOpentalkingBgms(db, roots.opentalking, dataDir)
    : { imported: 0, skipped: 0 };
  const voices = existsSync(roots.openStoryline)
    ? importOpenStorylineTtsPresets(db, roots.openStoryline)
    : { imported: 0, skipped: 0 };
  const digital_humans = existsSync(roots.opentalking)
    ? importOpentalkingDigitalHumans(db, roots.opentalking, dataDir)
    : { imported: 0, skipped: 0, matted: 0 };

  return {
    scripts,
    bgms: {
      imported: bgms.imported + opentalkingBgms.imported,
      skipped: bgms.skipped + opentalkingBgms.skipped,
      copied: bgms.copied,
    },
    brands,
    voices,
    digital_humans,
    sources: { openStoryline: roots.openStoryline, opentalking: roots.opentalking },
  };
}