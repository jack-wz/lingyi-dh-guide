import type Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { LOOK_PRESET_SEEDS } from '../../shared/lookPreset.js';

function seedPayloadMatches(stored: Record<string, unknown>, seedPayload: Record<string, unknown>): boolean {
  const keys = [
    'subtitle_style_id',
    'transition_type',
    'transition_duration',
    'pipeline_required',
    'registry_version',
    'hf_overlays',
  ] as const;
  return keys.every((key) => JSON.stringify(stored[key] ?? null) === JSON.stringify(seedPayload[key] ?? null));
}

export function seedLookPresets(db: Database.Database): {
  status: 'inserted' | 'updated' | 'skipped';
  touched_ids: string[];
} {
  const insert = db.prepare(
    `INSERT INTO library_items (id, category, name, description, tags, file_url, parent_id, payload_json)
     VALUES (?, 'look_preset', ?, ?, ?, '', '', ?)`,
  );
  const update = db.prepare(
    `UPDATE library_items
     SET name = ?, description = ?, tags = ?, payload_json = ?, updated_at = ?
     WHERE id = ?`,
  );
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

  let inserted = 0;
  let updated = 0;
  const touchedIds: string[] = [];
  for (const seed of LOOK_PRESET_SEEDS) {
    const existing = db.prepare(
      `SELECT id, name, description, tags, payload_json
       FROM library_items
       WHERE category = 'look_preset'
         AND json_extract(payload_json, '$.seed_id') = ?`,
    ).get(seed.seed_id) as {
      id: string;
      name: string;
      description: string;
      tags: string;
      payload_json: string;
    } | undefined;

    if (!existing) {
      const id = uuidv4();
      insert.run(
        id,
        seed.name,
        seed.description,
        JSON.stringify(seed.tags),
        JSON.stringify(seed.payload),
      );
      inserted += 1;
      touchedIds.push(id);
      continue;
    }

    const storedPayload = JSON.parse(existing.payload_json || '{}') as Record<string, unknown>;
    const needsUpdate = existing.name !== seed.name
      || existing.description !== seed.description
      || !seedPayloadMatches(storedPayload, seed.payload as Record<string, unknown>);

    if (needsUpdate) {
      update.run(
        seed.name,
        seed.description,
        JSON.stringify(seed.tags),
        JSON.stringify(seed.payload),
        now,
        existing.id,
      );
      updated += 1;
      touchedIds.push(existing.id);
    }
  }

  if (inserted > 0) return { status: 'inserted', touched_ids: touchedIds.filter(Boolean) };
  if (updated > 0) return { status: 'updated', touched_ids: touchedIds };
  return { status: 'skipped', touched_ids: [] };
}