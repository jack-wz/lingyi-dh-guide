"""Editor preview TTS synthesis and word-timing alignment."""

from __future__ import annotations

import uuid
from pathlib import Path
from typing import Any

from worker.tts_adapter import tts_registry
from worker.utils import get_duration
from worker.whisper_aligner import attach_hf_word_timings, transcribe_audio


def synthesize_preview_audio(
    text: str,
    output_path: str,
    *,
    voice_id: str = "",
    voice_sample: str = "",
) -> tuple[str, str]:
    text = (text or "").strip()
    if not text:
        raise ValueError("text is required")

    tts = tts_registry.get("yuntts")
    if voice_id:
        path = tts.synthesize(text, voice_id, output_path)
        if path:
            return path, "yuntts"

    path = tts.synthesize_fallback(text, output_path, voice_sample)
    if not path:
        raise RuntimeError("TTS synthesis failed")
    return path, "edge"


def build_preview_alignment(
    text: str,
    audio_path: str,
    *,
    aligner: str = "whisper",
) -> dict[str, Any]:
    duration = float(get_duration(audio_path) or 0.0)
    if duration <= 0:
        raise RuntimeError(f"Could not read audio duration: {audio_path}")

    seg: dict[str, Any] = {
        "narration_text": text,
        "subtitle": {"hf_params": {}},
    }
    asr = transcribe_audio(audio_path) if aligner == "whisper" else None
    attach_hf_word_timings(
        seg,
        duration=duration,
        asr_segments=asr,
        aligner="whisper" if asr else "heuristic",
    )
    hf_params = seg.get("subtitle", {}).get("hf_params", {})
    return {
        "duration_sec": round(duration, 3),
        "word_timings": hf_params.get("word_timings") or [],
        "word_timing_source": hf_params.get("word_timing_source") or "heuristic",
    }


def run_preview_request(payload: dict[str, Any]) -> dict[str, Any]:
    text = str(payload.get("text") or "").strip()
    if not text:
        raise ValueError("text is required")

    output_dir = Path(str(payload.get("output_dir") or "")).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    voice_id = str(payload.get("voice_id") or "").strip()
    voice_sample = str(payload.get("voice_sample") or "").strip()
    aligner = str(payload.get("aligner") or "whisper").strip().lower()
    if aligner not in {"whisper", "heuristic"}:
        aligner = "whisper"

    stem = str(payload.get("file_stem") or f"preview-{uuid.uuid4().hex[:12]}")
    output_path = str(output_dir / f"{stem}.wav")

    audio_path, provider = synthesize_preview_audio(
        text,
        output_path,
        voice_id=voice_id,
        voice_sample=voice_sample,
    )
    alignment = build_preview_alignment(text, audio_path, aligner=aligner)
    filename = Path(audio_path).name
    return {
        "audio_filename": filename,
        "audio_path": audio_path,
        "tts_provider": provider,
        **alignment,
    }