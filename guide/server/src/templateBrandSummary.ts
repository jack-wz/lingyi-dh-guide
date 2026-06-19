import type Database from 'better-sqlite3';

export interface TemplateBrandSummary {
  brand_pack_id?: string;
  brand_pack_name?: string;
}

/** SQLite expression: template has no brand_pack_id in meta or globalConfig. */
export const SQL_BRAND_UNBOUND = `(
  COALESCE(
    NULLIF(TRIM(json_extract(dsl_json, '$.meta.brand_pack_id')), ''),
    NULLIF(TRIM(json_extract(dsl_json, '$.globalConfig.brand_pack_id')), ''),
    ''
  ) = ''
)`;

/** SQLite expression: template matches a brand_pack_id in meta or globalConfig. */
export const SQL_BRAND_PACK_MATCH = `(
  json_extract(dsl_json, '$.meta.brand_pack_id') = ?
  OR json_extract(dsl_json, '$.globalConfig.brand_pack_id') = ?
)`;

export function extractBrandPackIdFromDslJson(dslJson: string): string {
  try {
    const dsl = JSON.parse(dslJson) as {
      meta?: { brand_pack_id?: string };
      globalConfig?: { brand_pack_id?: string };
    };
    return String(dsl.meta?.brand_pack_id || dsl.globalConfig?.brand_pack_id || '').trim();
  } catch {
    return '';
  }
}

export function enrichTemplateRowsWithBrandSummary(
  rows: Array<Record<string, unknown>>,
  db: Database.Database,
): Array<Record<string, unknown>> {
  const brandIds = new Set<string>();
  const summaries = rows.map((row) => {
    const dslJson = String(row.dsl_json || '');
    const brand_pack_id = extractBrandPackIdFromDslJson(dslJson) || undefined;
    if (brand_pack_id) brandIds.add(brand_pack_id);
    return { row, brand_pack_id };
  });

  const nameById = new Map<string, string>();
  if (brandIds.size > 0) {
    const stmt = db.prepare("SELECT id, name FROM library_items WHERE category = 'brand' AND id = ?");
    for (const id of brandIds) {
      const hit = stmt.get(id) as { id: string; name: string } | undefined;
      if (hit?.name) nameById.set(id, hit.name);
    }
  }

  return summaries.map(({ row, brand_pack_id }) => ({
    ...row,
    brand_pack_id,
    brand_pack_name: brand_pack_id ? nameById.get(brand_pack_id) : undefined,
  }));
}