"""Tests for subtitle realignment with actual DH clip durations (V4 #8)."""

import pytest
from worker.ass_generator import _segment_timeline
from worker.timeline_sync import reconcile_timeline


def test_segment_timeline_uses_reconciled_times():
    """Subtitle timeline should use start_time/end_time from reconcile_timeline."""
    segments = [
        {"id": "s1", "narration_text": "hello", "duration_sec": 5.0, "clip_path": "", "tts_audio_path": ""},
        {"id": "s2", "narration_text": "world", "duration_sec": 5.0, "clip_path": "", "tts_audio_path": ""},
    ]
    # Simulate reconcile_timeline output with actual durations
    reconciled = reconcile_timeline(segments, work_dir="/tmp/nonexistent")
    for seg in reconciled["segments"]:
        seg["duration_sec"] = seg["duration_sec"]  # already set by reconcile
        seg["start_time"] = seg["start_time"]
        seg["end_time"] = seg["end_time"]

    timeline = _segment_timeline(reconciled["segments"])
    assert len(timeline) == 2
    # First segment starts at 0
    assert timeline[0][1] == 0.0
    # Second segment starts where first ended
    assert timeline[1][1] == timeline[0][2]
    # Total duration matches sum of actual durations
    assert timeline[1][2] == reconciled["total_duration"]


def test_segment_timeline_fallback_without_reconciled_times():
    """Without start_time/end_time, fall back to duration_sec."""
    segments = [
        {"id": "s1", "narration_text": "hello", "duration_sec": 7.0},
        {"id": "s2", "narration_text": "world", "duration_sec": 3.0},
    ]
    timeline = _segment_timeline(segments)
    assert timeline[0] == (segments[0], 0.0, 7.0)
    assert timeline[1] == (segments[1], 7.0, 10.0)


def test_segment_timeline_handles_zero_duration():
    """Zero or negative duration defaults to 5.0."""
    segments = [
        {"id": "s1", "narration_text": "hello", "duration_sec": 0},
    ]
    timeline = _segment_timeline(segments)
    assert timeline[0][2] - timeline[0][1] == 5.0


def test_reconcile_timeline_uses_tts_duration():
    """reconcile_timeline should use TTS wav duration when clip is absent."""
    import tempfile
    import wave
    import os

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        wav_path = f.name

    # Create a 1-second WAV file
    with wave.open(wav_path, "w") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(16000)
        wav.writeframes(b"\x00\x00" * 16000)

    try:
        segments = [{"id": "s1", "narration_text": "test", "duration_sec": 10.0, "tts_path": wav_path}]
        result = reconcile_timeline(segments, work_dir="/tmp/nonexistent")
        # Actual TTS duration is ~1s, not the DSL's 10s
        assert result["segments"][0]["duration_sec"] <= 1.5
        assert result["total_duration"] <= 1.5
    finally:
        os.unlink(wav_path)
