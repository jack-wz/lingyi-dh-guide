"""ASS subtitle generator — phrase-level timing aligned to TTS segment duration."""

from __future__ import annotations

import re
from typing import Iterable

# ASS time format: H:MM:SS.cc (centiseconds)
_TIME_RE = re.compile(r"^(\d+):(\d{2}):(\d{2})\.(\d{2})$")
_MAJOR_BREAKS = "。！？!?"
_MINOR_BREAKS = "，、；,:"
_DEFAULT_MAX_CHARS = 14
_MIN_PHRASE_SEC = 0.65
_INTER_PHRASE_GAP_SEC = 0.12
_FADE_IN_MS = 380
_FADE_OUT_MS = 280


def _sec_to_ass(seconds: float) -> str:
    if seconds < 0:
        seconds = 0
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    cs = int(round((seconds % 1) * 100))
    if cs >= 100:
        cs = 0
        s += 1
        if s >= 60:
            s = 0
            m += 1
            if m >= 60:
                m = 0
                h += 1
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


def _ass_to_sec(ass_time: str) -> float:
    match = _TIME_RE.match(ass_time.strip())
    if not match:
        return 0.0
    h, m, s, cs = (int(x) for x in match.groups())
    return h * 3600 + m * 60 + s + cs / 100.0


def _escape_ass_text(text: str) -> str:
    return text.replace("\\", "\\\\").replace("{", "\\{").replace("}", "\\}").replace("\n", "\\N")


def _normalize_phrase(text: str) -> str:
    return re.sub(r"\s+", "", text.strip())


def split_narration_phrases(text: str, max_chars: int = _DEFAULT_MAX_CHARS) -> list[str]:
    """Split narration into display phrases by punctuation and length."""
    text = _normalize_phrase(text)
    if not text:
        return []

    if len(text) <= max_chars:
        return [text]

    sentences: list[str] = []
    buf = ""
    for ch in text:
        buf += ch
        if ch in _MAJOR_BREAKS:
            if buf.strip():
                sentences.append(buf.strip())
            buf = ""
    if buf.strip():
        sentences.append(buf.strip())

    if not sentences:
        sentences = [text]

    phrases: list[str] = []
    for sentence in sentences:
        phrases.extend(_split_sentence(sentence, max_chars))

    merged: list[str] = []
    for phrase in phrases:
        if merged and len(merged[-1]) < 5 and len(merged[-1]) + len(phrase) <= max_chars:
            merged[-1] += phrase
        else:
            merged.append(phrase)
    return [p for p in merged if p]


def _split_sentence(sentence: str, max_chars: int) -> list[str]:
    if len(sentence) <= max_chars:
        return [sentence]

    parts: list[str] = []
    buf = ""
    for ch in sentence:
        buf += ch
        if ch in _MINOR_BREAKS and len(buf.strip()) >= 4:
            parts.append(buf.strip())
            buf = ""
    if buf.strip():
        parts.append(buf.strip())

    if not parts:
        parts = [sentence]

    out: list[str] = []
    for part in parts:
        out.extend(_hard_split(part, max_chars))
    return out


def _hard_split(text: str, max_chars: int) -> list[str]:
    if len(text) <= max_chars:
        return [text]

    chunks: list[str] = []
    rest = text
    while len(rest) > max_chars:
        window = rest[:max_chars]
        split_at = max_chars
        for sep in _MINOR_BREAKS:
            idx = window.rfind(sep)
            if idx >= max(3, max_chars // 3):
                split_at = idx + 1
                break
        chunk = rest[:split_at].strip()
        if chunk:
            chunks.append(chunk)
        rest = rest[split_at:].strip()
    if rest:
        chunks.append(rest)
    return chunks or [text]


def allocate_phrase_timings(
    phrases: Iterable[str],
    seg_start: float,
    seg_duration: float,
    *,
    inter_gap: float = _INTER_PHRASE_GAP_SEC,
    min_phrase_sec: float = _MIN_PHRASE_SEC,
) -> list[tuple[str, float, float]]:
    """Allocate phrase windows inside a segment, weighted by character count."""
    phrase_list = list(phrases)
    if not phrase_list:
        return []

    if len(phrase_list) == 1:
        return [(phrase_list[0], seg_start, seg_start + seg_duration)]

    weights = [max(len(p), 1) for p in phrase_list]
    total_weight = sum(weights)
    gaps = inter_gap * (len(phrase_list) - 1)
    usable = max(seg_duration - gaps, min_phrase_sec * len(phrase_list))

    timings: list[tuple[str, float, float]] = []
    cursor = seg_start
    for i, (phrase, weight) in enumerate(zip(phrase_list, weights)):
        dur = max(usable * (weight / total_weight), min_phrase_sec)
        if i == len(phrase_list) - 1:
            end = seg_start + seg_duration
        else:
            end = cursor + dur
        timings.append((phrase, cursor, end))
        cursor = end + inter_gap

    if timings:
        last_phrase, last_start, _ = timings[-1]
        timings[-1] = (last_phrase, last_start, seg_start + seg_duration)
    return timings


def _animation_prefix(animation: str) -> str:
    if animation == "fadeIn":
        return rf"{{\fad({_FADE_IN_MS},{_FADE_OUT_MS})}}"
    if animation == "scaleIn":
        return (
            r"{\fscx70\fscy70\alpha&HFF&"
            r"\t(0,320,\fscx100\fscy100\alpha&H00&)"
            rf"\fad(120,{_FADE_OUT_MS})}}"
        )
    if animation == "typewriter":
        return ""
    if animation == "none":
        return rf"{{\fad(180,{_FADE_OUT_MS})}}"
    return rf"{{\fad({_FADE_IN_MS},{_FADE_OUT_MS})}}"


def _format_phrase_text(text: str, animation: str, phrase_dur_sec: float) -> str:
    escaped = _escape_ass_text(text)
    if animation != "typewriter" or len(text) <= 1:
        return escaped

    total_cs = max(int(round(phrase_dur_sec * 100)), len(text) * 6)
    per_char = max(total_cs // len(text), 5)
    parts: list[str] = []
    for ch in text:
        parts.append(rf"{{\k{per_char}}}{_escape_ass_text(ch)}")
    return "".join(parts)


def _segment_timeline(segments: list[dict]) -> list[tuple[dict, float, float]]:
    """Build a cumulative timeline from actual per-segment durations (post-TTS)."""
    cursor = 0.0
    timeline: list[tuple[dict, float, float]] = []
    for seg in segments:
        duration = float(seg.get("duration_sec") or 5.0)
        if duration <= 0:
            duration = 5.0
        timeline.append((seg, cursor, cursor + duration))
        cursor += duration
    return timeline


def _resolve_ass_font(global_config: dict) -> str:
    """Use brand pack default font when present; ASS Fontname is a single family."""
    raw = global_config.get("default_font_family") or ""
    if not raw:
        return "PingFang SC"
    first = str(raw).split(",")[0].strip().strip("'\"")
    return first or "PingFang SC"


def generate_ass(
    segments: list[dict],
    global_config: dict,
    output_path: str,
    *,
    max_chars_per_phrase: int = _DEFAULT_MAX_CHARS,
) -> str:
    """Generate ASS subtitle file with phrase-level timing and entrance animations."""
    canvas_w = global_config.get("canvas_width", 1080)
    canvas_h = global_config.get("canvas_height", 1920)
    ass_font = _resolve_ass_font(global_config)

    default_style = {
        "font": ass_font,
        "size": 48,
        "color": "#FFFFFF",
        "highlight_color": "#FFD700",
        "position": "bottom",
        "animation": "fadeIn",
        "max_chars_per_line": max_chars_per_phrase,
    }

    style_name = "Default"
    style_defs = [
        f"Style: {style_name},{default_style['font']},{default_style['size']},"
        f"&H00FFFFFF,&H000000FF,&H00000000,&H80000000,"
        f"0,0,0,0,100,100,0,0,1,3,2,2,10,10,120,1",
        "Style: Highlight,"
        f"{default_style['font']},{default_style['size'] + 4},"
        f"&H0000D7FF,&H000000FF,&H00000000,&H80000000,"
        f"0,0,0,0,100,100,0,0,1,4,2,2,10,10,120,1",
    ]

    header = f"""[Script Info]
Title: Pixelle-Video Subtitles
ScriptType: v4.00+
PlayResX: {canvas_w}
PlayResY: {canvas_h}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
{chr(10).join(style_defs)}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""

    events: list[str] = []
    timeline = _segment_timeline(segments)

    for seg, seg_start, seg_end in timeline:
        text = (seg.get("narration_text") or "").strip()
        if not text:
            continue

        subtitle_cfg = seg.get("subtitle") or {}
        style_key = subtitle_cfg.get("style", "default")
        animation = subtitle_cfg.get("animation", default_style["animation"])
        max_chars = int(subtitle_cfg.get("max_chars_per_line") or max_chars_per_phrase)

        style = default_style.copy()
        if style_key == "yellow-highlight":
            style["highlight_color"] = "#FFD700"
            use_style = "Highlight"
        else:
            use_style = style_name

        phrases = split_narration_phrases(text, max_chars=max_chars)
        preset_timings = seg.get("subtitle_phrase_timings") or []
        if preset_timings:
            phrase_timings = [
                (
                    str(item.get("text", "")),
                    float(item.get("start", seg_start)),
                    float(item.get("end", seg_end)),
                )
                for item in preset_timings
                if str(item.get("text", "")).strip()
            ]
        else:
            phrase_timings = allocate_phrase_timings(phrases, seg_start, seg_end - seg_start)

        for phrase, start, end in phrase_timings:
            if end <= start:
                end = start + _MIN_PHRASE_SEC
            prefix = _animation_prefix(animation)
            body = _format_phrase_text(phrase, animation, end - start)
            dialogue_text = f"{prefix}{body}"
            events.append(
                f"Dialogue: 0,{_sec_to_ass(start)},{_sec_to_ass(end)},"
                f"{use_style},,0,0,0,,{dialogue_text}"
            )

    with open(output_path, "w", encoding="utf-8-sig") as f:
        f.write(header)
        f.write("\n".join(events))
        if events:
            f.write("\n")

    return output_path