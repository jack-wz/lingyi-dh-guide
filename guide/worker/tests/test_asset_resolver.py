from worker.asset_resolver import (
    get_asset_map_from_dsl,
    resolve_overlay_asset_url,
    resolve_segment_overlays,
)


def test_resolve_overlay_prefers_asset_url():
    assert resolve_overlay_asset_url({"asset_url": "http://a/logo.png"}, {"logo": "http://b"}) == "http://a/logo.png"


def test_resolve_overlay_uses_asset_key():
    assert resolve_overlay_asset_url({"asset_key": "logo"}, {"logo": "http://cdn/logo.png"}) == "http://cdn/logo.png"


def test_get_asset_map_merges_global_and_meta():
    dsl = {
        "globalConfig": {"asset_map": {"logo": "http://a/logo.png"}, "brand_logo_url": "http://brand/logo.png"},
        "meta": {"asset_map": {"sticker": "http://a/sticker.gif"}},
    }
    asset_map = get_asset_map_from_dsl(dsl)
    assert asset_map["logo"] == "http://a/logo.png"
    assert asset_map["sticker"] == "http://a/sticker.gif"


def test_resolve_segment_overlays():
    overlays = [{"id": "ov1", "asset_key": "logo"}]
    resolved = resolve_segment_overlays(overlays, {"logo": "http://cdn/logo.png"})
    assert resolved[0]["asset_url"] == "http://cdn/logo.png"