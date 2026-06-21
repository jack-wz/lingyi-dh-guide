import type Database from 'better-sqlite3';
import {
  isLookPresetRegistryStale,
  migrateLookPresetPayload,
  parseLookPresetPayload,
} from '../../shared/lookPreset.js';
import { seedLookPresets } from './look-preset-seed.js';

export interface LookPresetSyncResult {
  seed: 'inserted' | 'updated' | 'skipped';
  migrated: number;
  updated_ids: string[];
}

export function syncAllLookPresets(db: Database.Database): LookPresetSyncResult {
  const seedResult = seedLookPresets(db);
  const updatedIdSet = new Set(seedResult.touched_ids);
  const rows = db.prepare(
    `SELECT id, payload_json FROM library_items WHERE category = 'look_preset'`,
  ).all() as Array<{ id: string; payload_json: string }>;

  const update = db.prepare(
    `UPDATE library_items SET payload_json = ?, updated_at = ? WHERE id = ?`,
  );
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

  for (const row of rows) {
    if (updatedIdSet.has(row.id)) continue;
    const raw = JSON.parse(row.payload_json || '{}') as Record<string, unknown>;
    if (!isLookPresetRegistryStale(String(raw.registry_version || ''))) continue;
    const parsed = parseLookPresetPayload(raw);
    if (!parsed) continue;
    const { payload: next, migrated } = migrateLookPresetPayload(parsed);
    if (!migrated) continue;
    update.run(JSON.stringify(next), now, row.id);
    updatedIdSet.add(row.id);
  }

  return {
    seed: seedResult.status,
    migrated: updatedIdSet.size,
    updated_ids: [...updatedIdSet],
  };
}