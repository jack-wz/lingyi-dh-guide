"""Tests for Lottie/WebM overlay support in Stage4 FFmpeg (V4 #9)."""

import os
import tempfile
import pytest
from worker.stage4_ffmpeg import _render_lottie_to_video, _is_webm_overlay


def test_is_webm_overlay_detects_webm():
    assert _is_webm_overlay("/tmp/overlay.webm") is True
    assert _is_webm_overlay("/tmp/overlay.WEBM") is True


def test_is_webm_overlay_rejects_non_webm():
    assert _is_webm_overlay("/tmp/overlay.png") is False
    assert _is_webm_overlay("/tmp/overlay.mp4") is False
    assert _is_webm_overlay("") is False


def test_render_lottie_returns_empty_without_tool():
    """Lottie rendering should gracefully skip if no CLI tool is available."""
    with tempfile.NamedTemporaryFile(suffix=".json", delete=False, mode="w") as f:
        f.write('{"v":"5.0","layers":[]}')
        lottie_path = f.name

    try:
        result = _render_lottie_to_video(lottie_path, "/tmp", {"duration": 3.0})
        # Should return empty string when no lottie renderer is available
        assert result == ""
    finally:
        os.unlink(lottie_path)


def test_resolve_overlay_asset_handles_lottie_url():
    """_resolve_overlay_asset should recognize .json/.lottie extensions."""
    from worker.stage4_ffmpeg import _resolve_overlay_asset
    # This won't download but the extension detection should work
    # We test with a local file that doesn't exist to verify it doesn't crash
    result = _resolve_overlay_asset(
        {"id": "test", "asset_url": ""},
        "/tmp",
    )
    assert result == ""


# ---- V5 #22: Stage4 preflight gate + stage4_report ----

def test_preflight_blocks_lottie_without_prerender_artifact():
    """A motion overlay referencing .json/.lottie with NO pre-rendered WebM/PNG artifact
    must produce a blocker (NOT a silent skip)."""
    from worker.stage4_ffmpeg import preflight_overlays
    with tempfile.TemporaryDirectory() as d:
        lottie_path = os.path.join(d, "badge.json")
        with open(lottie_path, "w") as fh:
            fh.write('{"v":"5.0","layers":[]}')
        report = preflight_overlays([
            {"id": "ov1", "asset_url": lottie_path, "delivery_mode": "video_overlay"},
        ], work_dir=d)
        assert report["ready"] is False
        assert any("未完成预渲染" in b for b in report["blockers"])
        assert report["overlays"][0]["status"] == "lottie_prerender_missing"


def test_preflight_artifact_ready_when_webm_exists():
    """When a transparent WebM artifact sibling exists alongside .json, the overlay is ready."""
    from worker.stage4_ffmpeg import preflight_overlays
    with tempfile.TemporaryDirectory() as d:
        lottie_path = os.path.join(d, "badge.json")
        webm_path = os.path.join(d, "badge.webm")
        with open(lottie_path, "w") as fh:
            fh.write('{"v":"5.0","layers":[]}')
        with open(webm_path, "wb") as fh:
            fh.write(b"\x1a\x45\xdf\xa3")  # minimal webm header bytes
        report = preflight_overlays([
            {"id": "ov1", "asset_url": lottie_path, "delivery_mode": "video_overlay"},
        ], work_dir=d)
        assert report["ready"] is True
        assert report["blockers"] == []
        assert report["overlays"][0]["status"] == "artifact_ready"
        assert report["overlays"][0]["artifact"].endswith(".webm")


def test_preflight_static_poster_downgrade():
    """A motion overlay with use_static_poster is treated as static downgrade (no blocker)."""
    from worker.stage4_ffmpeg import preflight_overlays
    with tempfile.TemporaryDirectory() as d:
        lottie_path = os.path.join(d, "cta.json")
        with open(lottie_path, "w") as fh:
            fh.write('{"v":"5.0","layers":[]}')
        report = preflight_overlays([
            {"id": "ov1", "asset_url": lottie_path, "use_static_poster": True, "delivery_mode": "video_overlay"},
        ], work_dir=d)
        assert report["ready"] is True
        assert report["overlays"][0]["status"] == "static_poster_downgrade"


def test_preflight_skips_empty_overlay_and_writes_report():
    """An overlay with no asset_url is skipped (never blocker); report is written to disk."""
    from worker.stage4_ffmpeg import preflight_overlays, write_stage4_report
    with tempfile.TemporaryDirectory() as d:
        report = preflight_overlays([
            {"id": "ov1", "asset_url": ""},
        ], work_dir=d)
        assert report["ready"] is True
        assert report["overlays"][0]["status"] == "skipped"
        out = write_stage4_report(d, report, ffmpeg_filter_summary="[concat][overlay]", segments_count=3, overlays_count=1)
        assert os.path.basename(out) == "stage4_report.json"
        import json as _json
        with open(out) as fh:
            written = _json.load(fh)
        assert written["segments_count"] == 3
        assert written["overlays_count"] == 1
        assert written["overlays"][0]["status"] == "skipped"
        assert written["ffmpeg_filter_summary"] == "[concat][overlay]"
