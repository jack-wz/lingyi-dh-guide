import type Database from 'better-sqlite3';
import { hydrateBrandPackInDsl, type BrandPackRow } from '../../shared/hydrateBrandPack.js';

export function loadBrandPackRow(db: Database.Database, packId: string): BrandPackRow | null {
  if (!packId) return null;
  const row = db
    .prepare("SELECT id, payload_json FROM library_items WHERE id = ? AND category = 'brand'")
    .get(packId) as { id: string; payload_json?: string } | undefined;
  if (!row) return null;
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(String(row.payload_json || '{}'));
  } catch {
    payload = {};
  }
  return { id: row.id, payload };
}

export function hydrateDslBrandPack<T extends { globalConfig?: Record<string, unknown> }>(
  dsl: T,
  db: Database.Database,
): T {
  const packId = String(dsl.globalConfig?.brand_pack_id || '').trim();
  if (!packId) return dsl;
  const row = loadBrandPackRow(db, packId);
  return hydrateBrandPackInDsl(dsl, row);
}