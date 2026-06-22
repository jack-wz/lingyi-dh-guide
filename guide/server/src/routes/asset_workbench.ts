import { Router, Request, Response } from 'express';
import { getDb } from '../db/database.js';

const router = Router();

const ASSET_CATEGORIES = ['scene', 'product', 'person', 'logo', 'sticker', 'lottie', 'voice', 'bgm', 'subtitle_style', 'other'] as const;
type AssetCategory = typeof ASSET_CATEGORIES[number];

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
  const { category, source, search } = req.query;
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
  const offset = Math.max(0, Number(req.query.offset || 0));

  const where: string[] = [];
  const params: any[] = [];
  if (category && category !== 'all') { where.push('type LIKE ?'); params.push(`%${category}%`); }
  if (search) { where.push('name LIKE ?'); params.push(`%${search}%`); }
  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

  const totalRow = db.prepare(`SELECT COUNT(*) AS c FROM assets ${whereClause}`).get(...params) as { c: number };
  const items = db.prepare(`SELECT * FROM assets ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);

  const enriched = items.map((asset: any) => ({
    ...asset,
    inferred_category: inferCategory(asset),
  }));

  const categories = ASSET_CATEGORIES.reduce((acc, cat) => {
    acc[cat] = enriched.filter((a: any) => a.inferred_category === cat).length;
    return acc;
  }, {} as Record<string, number>);

  res.json({
    items: enriched,
    total: totalRow.c,
    limit,
    offset,
    categories,
    available_categories: ASSET_CATEGORIES,
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
