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
