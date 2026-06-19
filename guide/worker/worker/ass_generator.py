"""ASS subtitle generator — phrase-level timing aligned to TTS segment duration."""

from __future__ import annotations

import re
from typing import Iterable

from worker.subtitle_styles import (
    build_ass_style_line,
    get_style_render_px,
    is_hyperframes_subtitle_style,
    normalize_subtitle_style_id,
    resolve_ass_subtitle_style_id,
)

# ASS time format: H:MM:SS.cc (centiseconds)
_TIME_RE = re.compile(r"^(\d+):(\d{2}):(\d{2})\.(\d{2})$")
_MAJOR_BREAKS = "。！？!?"
_MINOR_BREAKS = "，、；,:"
_DEFAULT_MAX_CHARS = 14
_MIN_PHRASE_SEC = 0.65
_INTER_PHRASE_GAP_SEC = 0.12
_FADE_IN_MS = 380
_FADE_OUT_MS = 280
_SUBTITLE_FONT_MIN = 32
_SUBTITLE_FONT_MAX = 120
_SUBTITLE_FONT_DEFAULT = 72

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


def _format_karaoke_from_word_timings(
    phrase: str,
    phrase_start: float,
    phrase_end: float,
    seg_start: float,
    word_timings: list[dict],
) -> str | None:
    """Build ASS karaoke tags from segment-local word timings when available."""
    if not word_timings:
        return None

    local_start = phrase_start - seg_start
    local_end = phrase_end - seg_start
    units: list[dict] = []
    for item in word_timings:
        text = str(item.get("text", "")).strip()
        if not text:
            continue
        start = float(item.get("start", 0.0))
        end = float(item.get("end", start))
        if end <= local_start or start >= local_end:
            continue
        clip_start = max(start, local_start)
        clip_end = min(end, local_end)
        if clip_end <= clip_start:
            clip_end = clip_start + 0.05
        units.append({"text": text, "start": clip_start, "end": clip_end})

    if len(units) < 2:
        return None

    parts: list[str] = []
    for unit in units:
        dur_cs = max(1, round((unit["end"] - unit["start"]) * 100))
        parts.append(rf"{{\k{dur_cs}}}{_escape_ass_text(unit['text'])}")
    return "".join(parts) if parts else None


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


def _clamp_subtitle_font_size(value: int) -> int:
    return max(_SUBTITLE_FONT_MIN, min(_SUBTITLE_FONT_MAX, int(value)))


def _resolve_subtitle_font_size(
    subtitle_cfg: dict,
    global_config: dict,
    *,
    style_id: str = "default",
    canvas_h: int = 1920,
) -> int:
    """Resolve ASS Fontsize from per-segment override, global default, or style preset."""
    override = subtitle_cfg.get("font_size")
    if override is not None:
        try:
            size = int(override)
            if size > 0:
                return _clamp_subtitle_font_size(size)
        except (TypeError, ValueError):
            pass

    global_size = global_config.get("subtitle_font_size")
    if global_size is not None:
        try:
            size = int(global_size)
            if size > 0:
                return _clamp_subtitle_font_size(size)
        except (TypeError, ValueError):
            pass

    canonical = normalize_subtitle_style_id(style_id)
    px = get_style_render_px(canonical)
    scaled = round(px * (canvas_h / 1080) * 1.8)
    return _clamp_subtitle_font_size(max(_SUBTITLE_FONT_DEFAULT, scaled))


def _parse_font_family_name(raw: str) -> str:
    if not raw:
        return ""
    return str(raw).split(",")[0].strip().strip("'\"")


def _resolve_subtitle_font_family(subtitle_cfg: dict, global_config: dict) -> str:
    """Segment font_family → global subtitle_font_family → default_font_family."""
    for source in (
        subtitle_cfg.get("font_family"),
        global_config.get("subtitle_font_family"),
        global_config.get("default_font_family"),
    ):
        parsed = _parse_font_family_name(str(source or ""))
        if parsed:
            return parsed
    return "PingFang SC"


def _resolve_ass_font(global_config: dict) -> str:
    """Brand default font for overlays; subtitles use _resolve_subtitle_font_family."""
    return _resolve_subtitle_font_family({}, global_config)


def _resolve_ass_alignment(position: str) -> int:
    pos = str(position or "bottom").strip().lower()
    if pos == "top":
        return 8
    if pos == "center":
        return 5
    return 2


def _resolve_margin_v(position: str, canvas_h: int) -> int:
    pos = str(position or "bottom").strip().lower()
    scale = max(0.6, min(1.4, float(canvas_h) / 1920.0))
    if pos == "top":
        return max(40, round(80 * scale))
    if pos == "center":
        return 0
    return max(60, round(120 * scale))


def _resolve_hf_karaoke_secondary_color(canonical_style: str) -> str | None:
    from worker.subtitle_styles import get_subtitle_style_definition

    definition = get_subtitle_style_definition(canonical_style)
    render = (definition or {}).get("render") or {}
    color = str(render.get("color") or "").strip()
    return color or None


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
    base_font_size = _resolve_subtitle_font_size({}, global_config, canvas_h=canvas_h)
    default_animation = "fadeIn"

    style_defs: list[str] = []
    style_registry: dict[str, str] = {}
    events: list[str] = []
    timeline = _segment_timeline(segments)

    def _style_name_for(
        canonical_style: str,
        font_size: int,
        font_name: str,
        *,
        primary_override: str | None = None,
        secondary_override: str | None = None,
        alignment: int = 2,
        margin_v: int = 120,
    ) -> str:
        key = (
            f"{canonical_style}_{font_size}_{font_name}_{primary_override or ''}_"
            f"{secondary_override or ''}_{alignment}_{margin_v}"
        )
        if key in style_registry:
            return style_registry[key]
        name = f"Style_{len(style_registry)}"
        style_defs.append(
            build_ass_style_line(
                name,
                font_name,
                font_size,
                canonical_style,
                primary_override=primary_override,
                secondary_override=secondary_override,
                alignment=alignment,
                margin_v=margin_v,
            )
        )
        style_registry[key] = name
        return name

    for seg, seg_start, seg_end in timeline:
        text = (seg.get("narration_text") or "").strip()
        if not text:
            continue

        subtitle_cfg = seg.get("subtitle") or {}
        if subtitle_cfg.get("enabled") is False:
            continue

        style_key = subtitle_cfg.get("style_id") or subtitle_cfg.get("style", "default")
        canonical_style = resolve_ass_subtitle_style_id(style_key)
        ass_degraded_hf = is_hyperframes_subtitle_style(style_key)
        animation = subtitle_cfg.get("animation", default_animation)
        max_chars = int(subtitle_cfg.get("max_chars_per_line") or max_chars_per_phrase)
        hf_params = subtitle_cfg.get("hf_params") or {}
        word_timings = hf_params.get("word_timings") or []
        primary_override = str(hf_params.get("accent_color") or global_config.get("brand_color") or "").strip() or None
        secondary_override = None
        if ass_degraded_hf and primary_override:
            secondary_override = _resolve_hf_karaoke_secondary_color(canonical_style)

        subtitle_position = str(subtitle_cfg.get("position") or "bottom")
        ass_alignment = _resolve_ass_alignment(subtitle_position)
        margin_v = _resolve_margin_v(subtitle_position, int(canvas_h))

        seg_font_size = _resolve_subtitle_font_size(
            subtitle_cfg,
            global_config,
            style_id=canonical_style,
            canvas_h=canvas_h,
        )

        seg_font = _resolve_subtitle_font_family(subtitle_cfg, global_config)
        use_style = _style_name_for(
            canonical_style,
            seg_font_size,
            seg_font,
            primary_override=primary_override if ass_degraded_hf else None,
            secondary_override=secondary_override if ass_degraded_hf and word_timings else None,
            alignment=ass_alignment,
            margin_v=margin_v,
        )

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
            karaoke_body = None
            if ass_degraded_hf and word_timings:
                karaoke_body = _format_karaoke_from_word_timings(
                    phrase,
                    start,
                    end,
                    seg_start,
                    word_timings,
                )
            body = karaoke_body or _format_phrase_text(phrase, animation, end - start)
            dialogue_text = f"{prefix}{body}"
            events.append(
                f"Dialogue: 0,{_sec_to_ass(start)},{_sec_to_ass(end)},"
                f"{use_style},,0,0,0,,{dialogue_text}"
            )

    if not style_defs:
        style_defs.append(build_ass_style_line("Default", ass_font, base_font_size, "default"))

    header = f"""[Script Info]
Title: Guide Platform Subtitles
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

    with open(output_path, "w", encoding="utf-8-sig") as f:
        f.write(header)
        f.write("\n".join(events))
        if events:
            f.write("\n")

    return output_path