import { Router, Request, Response } from 'express';
import { getDb } from '../db/database.js';

const router = Router();

const ASSET_CATEGORIES = ['scene', 'product', 'person', 'logo', 'sticker', 'lottie', 'voice', 'bgm', 'subtitle_style', 'other'] as const;
type AssetCategory = typeof ASSET_CATEGORIES[number];

const GROUP_CATEGORY_MAP: Record<string, AssetCategory[]> = {
  brand_role: ['person', 'logo', 'sticker', 'voice'],
  product_scene: ['scene', 'product'],
  script_audio: ['voice', 'bgm', 'subtitle_style', 'other'],
  template_motion: ['lottie', 'subtitle_style', 'other'],
};
export { GROUP_CATEGORY_MAP };

function inferCategory(asset: any): AssetCategory {
  const type = String(asset.type || '').toLowerCase();
  const name = String(asset.name || '').toLowerCase();
  const metadata = typeof asset.metadata === 'string' ? JSON.parse(asset.metadata || '{}') : (asset.metadata || {});

  if (type === 'image' && (name.includes('产品') || name.includes('product') || metadata.category === 'product')) return 'product';
  if (type === 'image' && (name.includes('人物') || name.includes('person') || name.includes('数字人'))) return 'person';
  if (type === 'image' && (name.includes('logo') || name.includes('品牌'))) return 'logo';
  if (type === 'image' && (name.includes('贴纸') || name.includes('sticker'))) return 'sticker';
  if (type === 'lottie' || name.includes('lottie')) return 'lottie';
  if (type === 'audio' && (name.includes('voice') || name.includes('配音') || name.includes('语音'))) return 'voice';
  if (type === 'audio' && (name.includes('bgm') || name.includes('music') || name.includes('背景'))) return 'bgm';
  if (type === 'image' && (name.includes('场景') || name.includes('scene'))) return 'scene';
  if (name.includes('字幕') || name.includes('subtitle')) return 'subtitle_style';
  return 'other';
}

router.get('/workbench', (req: Request, res: Response) => {
  const db = getDb();
  const { category, search } = req.query;
  const scope = String(req.query.scope || 'all'); // enterprise | project | all
  const group = String(req.query.group || '');     // one of GROUP_CATEGORY_MAP keys
  const kind = String(req.query.kind || '');       // raw type filter
  const usageStatus = String(req.query.usage_status || '');
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
  const offset = Math.max(0, Number(req.query.offset || 0));

  const wantsPostFilter = Boolean(
    (category && category !== 'all') || group || scope !== 'all' || kind || usageStatus,
  );

  // Build the base SQL only on search/name (text-LIKE on type/kind is replaced by post-filter).
  const where: string[] = [];
  const params: any[] = [];
  if (search) { where.push('name LIKE ?'); params.push(`%${search}%`); }
  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

  // When a post-filter is requested, fetch a wider candidate pool (so inferred-category
  // filtering happens in JS over real rows), then paginate in memory.
  const fetchCap = wantsPostFilter ? 1000 : limit;
  const rows = db.prepare(`SELECT * FROM assets ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, fetchCap, 0) as any[];

  const enriched = rows.map((asset: any) => ({
    ...asset,
    inferred_category: inferCategory(asset),
  }));

  const parseMeta = (asset: any): Record<string, unknown> => {
    if (typeof asset.metadata === 'string') {
      try { return JSON.parse(asset.metadata || '{}'); } catch { return {}; }
    }
    return asset.metadata || {};
  };

  let filtered = enriched;
  if (category && category !== 'all') {
    filtered = filtered.filter((a: any) => a.inferred_category === String(category));
  }
  if (group && GROUP_CATEGORY_MAP[group]) {
    const cats = new Set(GROUP_CATEGORY_MAP[group]);
    filtered = filtered.filter((a: any) => cats.has(a.inferred_category));
  }
  if (kind) {
    filtered = filtered.filter((a: any) => String(a.type || '').toLowerCase().includes(String(kind).toLowerCase()));
  }
  if (scope && scope !== 'all') {
    filtered = filtered.filter((a: any) => {
      const meta = parseMeta(a);
      const hasProject = Boolean(meta.project_id);
      return scope === 'project' ? hasProject : !hasProject;
    });
  }
  if (usageStatus) {
    filtered = filtered.filter((a: any) => String(parseMeta(a).usage_status || '') === String(usageStatus));
  }

  const total = filtered.length;
  const page = filtered.slice(offset, offset + limit);

  const categories = ASSET_CATEGORIES.reduce((acc, cat) => {
    acc[cat] = enriched.filter((a: any) => a.inferred_category === cat).length;
    return acc;
  }, {} as Record<string, number>);

  res.json({
    items: page,
    total,
    limit,
    offset,
    categories,
    available_categories: ASSET_CATEGORIES,
    available_groups: Object.keys(GROUP_CATEGORY_MAP).map((id) => ({ id, categories: GROUP_CATEGORY_MAP[id] })),
  });
});

router.get('/workbench/stats', (_req: Request, res: Response) => {
  const db = getDb();
  const total = (db.prepare('SELECT COUNT(*) AS c FROM assets').get() as any).c;
  const byType = db.prepare('SELECT type, COUNT(*) as count FROM assets GROUP BY type').all() as any[];
  const recent = db.prepare('SELECT * FROM assets ORDER BY created_at DESC LIMIT 5').all();
  res.json({
    total,
    by_type: byType.reduce((acc, row) => { acc[row.type] = row.count; return acc; }, {} as Record<string, number>),
    recent: recent.map((a: any) => ({ ...a, inferred_category: inferCategory(a) })),
  });
});

export default router;
