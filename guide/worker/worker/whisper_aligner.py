"""Optional Whisper ASR alignment for phrase-level ASS subtitles."""

from __future__ import annotations

import os
import re
from typing import Any

_ASR_SEGMENT = dict[str, Any]
_PHRASE_TIMING = tuple[str, float, float]

_PUNCT_RE = re.compile(r"[\s\.,，。！？!？、；;:'\"“”‘’（）()\[\]【】\-—…]+")


def normalize_subtitle_text(text: str) -> str:
    return _PUNCT_RE.sub("", (text or "").strip().lower())


def is_whisper_available() -> bool:
    try:
        import faster_whisper  # noqa: F401
        return True
    except ImportError:
        return False


def transcribe_audio(audio_path: str, *, model_name: str = "base") -> list[_ASR_SEGMENT] | None:
    """Transcribe audio with word timestamps when faster-whisper is installed."""
    if not audio_path or not os.path.exists(audio_path):
        return None
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print("[Whisper] faster-whisper not installed; using heuristic subtitle timing")
        return None

    device = os.getenv("WHISPER_DEVICE", "cpu")
    compute_type = os.getenv("WHISPER_COMPUTE_TYPE", "int8")
    print(f"[Whisper] Transcribing {audio_path} with model={model_name} device={device}")
    model = WhisperModel(model_name, device=device, compute_type=compute_type)
    segments, _info = model.transcribe(
        audio_path,
        word_timestamps=True,
        vad_filter=True,
    )

    out: list[_ASR_SEGMENT] = []
    for seg in segments:
        words: list[dict[str, float | str]] = []
        if seg.words:
            for word in seg.words:
                token = (word.word or "").strip()
                if not token:
                    continue
                words.append({"text": token, "start": float(word.start), "end": float(word.end)})
        out.append({
            "start": float(seg.start),
            "end": float(seg.end),
            "text": (seg.text or "").strip(),
            "words": words,
        })
    return out or None


def _flatten_words(asr_segments: list[_ASR_SEGMENT]) -> list[dict[str, float | str]]:
    words: list[dict[str, float | str]] = []
    for seg in asr_segments:
        seg_words = seg.get("words") or []
        if seg_words:
            words.extend(seg_words)
            continue
        text = normalize_subtitle_text(str(seg.get("text", "")))
        if not text:
            continue
        start = float(seg.get("start", 0.0))
        end = float(seg.get("end", start))
        span = max(end - start, 0.05)
        for idx, ch in enumerate(text):
            words.append({
                "text": ch,
                "start": start + span * idx / max(len(text), 1),
                "end": start + span * (idx + 1) / max(len(text), 1),
            })
    return words


def align_phrases_to_asr(
    phrases: list[str],
    asr_segments: list[_ASR_SEGMENT],
    seg_start: float,
    seg_end: float,
) -> list[_PHRASE_TIMING] | None:
    """Map display phrases to ASR word timestamps inside a segment window."""
    if not phrases or not asr_segments:
        return None

    words = _flatten_words(asr_segments)
    if not words:
        return None

    transcript = "".join(normalize_subtitle_text(str(w.get("text", ""))) for w in words)
    expected = "".join(normalize_subtitle_text(p) for p in phrases)
    if not transcript or not expected:
        return None

    # Allow minor ASR drift; still attempt alignment when overlap is reasonable.
    overlap = sum(1 for ch in expected if ch in set(transcript))
    if overlap / max(len(expected), 1) < 0.45:
        print(f"[Whisper] ASR transcript mismatch ({overlap}/{len(expected)} chars overlap)")
        return None

    timings: list[_PHRASE_TIMING] = []
    cursor = 0
    for phrase in phrases:
        target = normalize_subtitle_text(phrase)
        if not target:
            continue

        start_idx = transcript.find(target, cursor)
        if start_idx < 0:
            # Greedy forward match when punctuation/spacing caused drift.
            start_idx = cursor
            matched = 0
            scan = cursor
            while scan < len(transcript) and matched < len(target):
                if transcript[scan] == target[matched]:
                    if matched == 0:
                        start_idx = scan
                    matched += 1
                scan += 1
            if matched < max(3, len(target) // 2):
                return None
            end_idx = start_idx + matched
        else:
            end_idx = start_idx + len(target)

        if start_idx >= len(words):
            return None
        end_idx = min(end_idx, len(transcript))
        word_start = min(start_idx, len(words) - 1)
        word_end = min(max(end_idx - 1, word_start), len(words) - 1)

        start = float(words[word_start]["start"])
        end = float(words[word_end]["end"])
        if end <= start:
            end = start + 0.35
        timings.append((phrase, seg_start + start, min(seg_start + end, seg_end)))
        cursor = end_idx

    if timings:
        timings[-1] = (timings[-1][0], timings[-1][1], seg_end)
    return timings or None


def resolve_subtitle_aligner(config: dict[str, Any] | None = None) -> str:
    cfg = config or {}
    pipeline = cfg.get("pipeline") if isinstance(cfg.get("pipeline"), dict) else {}
    env_mode = os.getenv("SUBTITLE_ALIGNER", "").strip().lower()
    if env_mode in {"whisper", "heuristic"}:
        return env_mode
    mode = str((pipeline or {}).get("subtitle_aligner", "whisper")).strip().lower()
    return mode if mode in {"whisper", "heuristic"} else "whisper"


def split_caption_display_units(text: str) -> list[str]:
    """Mirror shared/captionWordTimings.ts splitCaptionWords for karaoke units."""
    trimmed = (text or "").strip()
    if not trimmed:
        return []
    if re.search(r"[\u4e00-\u9fff]", trimmed):
        parts = [p.strip() for p in re.split(r"(?<=[，。！？、；：,.!?])", trimmed) if p.strip()]
        if len(parts) > 1:
            return parts
        return [ch for ch in trimmed if not ch.isspace()]
    return [p for p in trimmed.split() if p]


def build_heuristic_word_timings(units: list[str], duration: float, *, lead_in: float = 0.25) -> list[dict[str, float | str]]:
    if not units:
        return []
    window = max(0.4, float(duration) - lead_in - 0.1)
    slice_sec = max(0.05, window / len(units))
    timings: list[dict[str, float | str]] = []
    for index, text in enumerate(units):
        start = lead_in + index * slice_sec
        end = min(float(duration), start + slice_sec * 0.85)
        timings.append({"text": text, "start": round(start, 3), "end": round(end, 3)})
    return timings


def attach_hf_word_timings(
    seg: dict[str, Any],
    *,
    duration: float,
    asr_segments: list[_ASR_SEGMENT] | None = None,
    aligner: str = "heuristic",
) -> None:
    """Populate subtitle.hf_params.word_timings for HyperFrames karaoke captions."""
    text = (seg.get("narration_text") or "").strip()
    if not text:
        return

    units = split_caption_display_units(text)
    if not units:
        return

    timings: list[dict[str, float | str]] | None = None
    source = "heuristic"
    if asr_segments:
        local = align_phrases_to_asr(units, asr_segments, 0.0, duration)
        if local:
            timings = [
                {"text": phrase, "start": round(start, 3), "end": round(end, 3)}
                for phrase, start, end in local
            ]
            source = "whisper"

    if not timings:
        timings = build_heuristic_word_timings(units, duration)

    subtitle = seg.setdefault("subtitle", {})
    hf_params = subtitle.setdefault("hf_params", {})
    hf_params["word_timings"] = timings
    hf_params["word_timing_source"] = source if aligner == "whisper" and source == "whisper" else source


def apply_whisper_subtitle_timings(
    segments: list[dict],
    *,
    work_dir: str = "",
    config: dict[str, Any] | None = None,
) -> str:
    """Attach per-segment subtitle_phrase_timings when Whisper alignment succeeds."""
    from worker.ass_generator import allocate_phrase_timings, split_narration_phrases

    mode = resolve_subtitle_aligner(config)
    if mode == "heuristic":
        cursor = 0.0
        for seg in segments:
            duration = float(seg.get("duration_sec") or 5.0)
            seg_start = float(seg.get("start_time", cursor))
            seg_end = float(seg.get("end_time", seg_start + duration))
            cursor = seg_end
            text = (seg.get("narration_text") or "").strip()
            if not text:
                continue
            subtitle_cfg = seg.get("subtitle") or {}
            max_chars = int(subtitle_cfg.get("max_chars_per_line") or 14)
            phrases = split_narration_phrases(text, max_chars=max_chars)
            fallback = allocate_phrase_timings(phrases, seg_start, seg_end - seg_start)
            seg["subtitle_phrase_timings"] = [
                {"text": phrase, "start": round(start, 3), "end": round(end, 3)}
                for phrase, start, end in fallback
            ]
            seg["subtitle_aligner"] = "heuristic"
            attach_hf_word_timings(seg, duration=duration, asr_segments=None, aligner="heuristic")
        return "heuristic"

    pipeline = (config or {}).get("pipeline", {}) if isinstance((config or {}).get("pipeline"), dict) else {}
    model_name = str(pipeline.get("whisper_model", os.getenv("WHISPER_MODEL", "base")))
    aligned = 0

    cursor = 0.0
    for index, seg in enumerate(segments):
        duration = float(seg.get("duration_sec") or 5.0)
        seg_start = float(seg.get("start_time", cursor))
        seg_end = float(seg.get("end_time", seg_start + duration))
        cursor = seg_end

        text = (seg.get("narration_text") or "").strip()
        if not text:
            continue

        subtitle_cfg = seg.get("subtitle") or {}
        max_chars = int(subtitle_cfg.get("max_chars_per_line") or 14)
        phrases = split_narration_phrases(text, max_chars=max_chars)

        tts_path = seg.get("tts_audio_path") or seg.get("tts_path") or ""
        if not tts_path and work_dir:
            candidate = os.path.join(work_dir, f"tts_{index}.wav")
            if os.path.exists(candidate):
                tts_path = candidate

        asr_segments = transcribe_audio(tts_path, model_name=model_name) if tts_path else None
        timings = None
        if asr_segments:
            local_timings = align_phrases_to_asr(phrases, asr_segments, 0.0, duration)
            if local_timings:
                timings = [(phrase, seg_start + (start - 0.0), seg_start + (end - 0.0)) for phrase, start, end in local_timings]
                timings[-1] = (timings[-1][0], timings[-1][1], seg_end)

        if timings:
            seg["subtitle_phrase_timings"] = [
                {"text": phrase, "start": round(start, 3), "end": round(end, 3)}
                for phrase, start, end in timings
            ]
            seg["subtitle_aligner"] = "whisper"
            attach_hf_word_timings(seg, duration=duration, asr_segments=asr_segments, aligner="whisper")
            aligned += 1
            continue

        fallback = allocate_phrase_timings(phrases, seg_start, seg_end - seg_start)
        seg["subtitle_phrase_timings"] = [
            {"text": phrase, "start": round(start, 3), "end": round(end, 3)}
            for phrase, start, end in fallback
        ]
        seg["subtitle_aligner"] = "heuristic"
        attach_hf_word_timings(seg, duration=duration, asr_segments=None, aligner="heuristic")

    result = "whisper" if aligned else "heuristic"
    print(f"[Whisper] Subtitle alignment: {aligned}/{len(segments)} segments via ASR")
    return result