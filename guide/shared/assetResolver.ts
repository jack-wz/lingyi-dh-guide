/** Resolve template asset_key references to URLs (shared by editor, server, worker). */

export type AssetMap = Record<string, string>;

export interface OverlayLike {
  asset_url?: string;
  asset_key?: string;
  [key: string]: unknown;
}

export function resolveOverlayAssetUrl(
  overlay: OverlayLike,
  assetMap: AssetMap = {},
): string {
  const direct = String(overlay.asset_url || '').trim();
  if (direct) return direct;
  const key = String(overlay.asset_key || '').trim();
  if (key && assetMap[key]) return assetMap[key];
  return '';
}

export function resolveSegmentOverlays<T extends OverlayLike>(
  overlays: T[] | undefined,
  assetMap: AssetMap = {},
): T[] {
  if (!Array.isArray(overlays)) return [];
  return overlays.map((ov) => {
    const resolved = resolveOverlayAssetUrl(ov, assetMap);
    if (!resolved) return ov;
    return { ...ov, asset_url: resolved };
  });
}

type AssetMapDsl = {
  globalConfig?: { asset_map?: AssetMap; brand_logo_url?: string };
  meta?: { asset_map?: AssetMap };
};

export function getAssetMapFromDsl(dsl: unknown): AssetMap {
  const source = (dsl || {}) as AssetMapDsl;
  const gc = source.globalConfig || {};
  const meta = source.meta || {};
  const map: AssetMap = { ...(meta.asset_map || {}), ...(gc.asset_map || {}) };
  if (gc.brand_logo_url && !map.logo) {
    map.logo = gc.brand_logo_url;
  }
  return map;
}