"""Resolve template asset_key references to URLs (mirrors guide/shared/assetResolver.ts)."""


def resolve_overlay_asset_url(overlay: dict, asset_map: dict | None = None) -> str:
    asset_map = asset_map or {}
    direct = str(overlay.get("asset_url") or "").strip()
    if direct:
        return direct
    key = str(overlay.get("asset_key") or "").strip()
    if key and asset_map.get(key):
        return str(asset_map[key])
    return ""


def get_asset_map_from_dsl(dsl: dict) -> dict:
    global_config = dsl.get("globalConfig", {}) or {}
    meta = dsl.get("meta", {}) or {}
    asset_map = {}
    asset_map.update(meta.get("asset_map") or {})
    asset_map.update(global_config.get("asset_map") or {})
    brand_logo = str(global_config.get("brand_logo_url") or "").strip()
    if brand_logo and "logo" not in asset_map:
        asset_map["logo"] = brand_logo
    return asset_map


def resolve_segment_overlays(overlays: list | None, asset_map: dict | None = None) -> list:
    asset_map = asset_map or {}
    resolved = []
    for ov in overlays or []:
        item = dict(ov)
        url = resolve_overlay_asset_url(item, asset_map)
        if url:
            item["asset_url"] = url
        resolved.append(item)
    return resolved