"""FFmpeg-native mapping for HF-style transitions and global overlays (single delivery path)."""

from __future__ import annotations

HF_TRANSITION_TYPES = frozenset({
    "hf-dissolve",
    "hf-push",
    "hf-push-left",
    "hf-push-right",
    "hf-push-up",
    "hf-push-down",
    "hf-wipe",
    "hf-wipe-left",
    "hf-wipe-right",
    "hf-zoom",
    "hf-circle-reveal",
})

HF_GLOBAL_OVERLAY_TYPES = frozenset({
    "hf-grain",
    "hf-vignette",
    "hf-light-leak",
    "hf-motion-blur",
    "hf-color-grade",
})

_XFADE_MAP: dict[str, str] = {
    "hf-dissolve": "fade",
    "hf-push": "slideleft",
    "hf-push-left": "slideleft",
    "hf-push-right": "slideright",
    "hf-push-up": "slideup",
    "hf-push-down": "slidedown",
    "hf-wipe": "wipeleft",
    "hf-wipe-left": "wipeleft",
    "hf-wipe-right": "wiperight",
    "hf-zoom": "zoomin",
    "hf-circle-reveal": "circleopen",
    "fade": "fade",
}


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def segment_boundary_xfade(
    seg: dict,
    *,
    transitions_enabled: bool,
) -> tuple[str | None, float]:
    """Return FFmpeg xfade transition name and duration after this segment."""
    if not transitions_enabled:
        return None, 0.0
    trans = seg.get("transition") or {}
    trans_type = str(trans.get("type") or "none").strip()
    if trans_type in ("none", ""):
        return None, 0.0
    xfade = _XFADE_MAP.get(trans_type)
    if not xfade:
        return None, 0.0
    duration = _clamp(float(trans.get("duration") or 0.5), 0.12, 1.2)
    return xfade, duration


def dsl_uses_ffmpeg_transitions(
    segments: list[dict],
    *,
    transitions_enabled: bool = True,
) -> bool:
    if not transitions_enabled:
        return False
    for index, seg in enumerate(segments):
        if index >= len(segments) - 1:
            break
        name, _ = segment_boundary_xfade(seg, transitions_enabled=True)
        if name:
            return True
    return False


def build_video_xfade_filters(
    base_count: int,
    clip_durations: list[float],
    segments: list[dict],
    *,
    transitions_enabled: bool = True,
) -> tuple[list[str], str] | None:
    """Chain scaled clip labels v0..vN-1 with xfade. None => use concat instead."""
    if base_count <= 1:
        return None

    boundaries: list[tuple[str | None, float]] = []
    for index in range(base_count - 1):
        seg = segments[index] if index < len(segments) else {}
        boundaries.append(segment_boundary_xfade(seg, transitions_enabled=transitions_enabled))

    if not any(name for name, _ in boundaries):
        return None

    filters: list[str] = []
    current = "v0"
    cumulative = float(clip_durations[0])

    for index in range(1, base_count):
        xfade_name, trans_dur = boundaries[index - 1]
        prev_dur = float(clip_durations[index - 1])
        next_dur = float(clip_durations[index])

        if not xfade_name:
            xfade_name = "fade"
            trans_dur = 0.06
        else:
            trans_dur = _clamp(trans_dur, 0.12, min(prev_dur, next_dur) * 0.45)

        offset = max(0.0, cumulative - trans_dur)
        out_label = f"vx{index}"
        filters.append(
            f"[{current}][v{index}]xfade=transition={xfade_name}:duration={trans_dur}:offset={offset}[{out_label}]"
        )
        current = out_label
        cumulative = offset + next_dur

    return filters, current


def expected_output_duration_with_xfade(
    clip_durations: list[float],
    segments: list[dict],
    *,
    transitions_enabled: bool = True,
) -> float | None:
    """Expected final duration when xfade chain is active; None if concat path."""
    base_count = len(clip_durations)
    if base_count <= 1:
        return None
    boundaries: list[tuple[str | None, float]] = []
    for index in range(base_count - 1):
        seg = segments[index] if index < len(segments) else {}
        boundaries.append(segment_boundary_xfade(seg, transitions_enabled=transitions_enabled))
    if not any(name for name, _ in boundaries):
        return None

    cumulative = float(clip_durations[0])
    for index in range(1, base_count):
        xfade_name, trans_dur = boundaries[index - 1]
        prev_dur = float(clip_durations[index - 1])
        next_dur = float(clip_durations[index])
        if not xfade_name:
            trans_dur = 0.06
        else:
            trans_dur = _clamp(trans_dur, 0.12, min(prev_dur, next_dur) * 0.45)
        offset = max(0.0, cumulative - trans_dur)
        cumulative = offset + next_dur
    return cumulative


def build_global_overlay_filters(
    input_label: str,
    global_config: dict,
) -> tuple[list[str], str]:
    """Apply HF global overlay types via FFmpeg video filters."""
    overlays = (global_config or {}).get("hf_overlays") or []
    filters: list[str] = []
    current = input_label

    for index, item in enumerate(overlays):
        if item.get("enabled") is False:
            continue
        overlay_type = str(item.get("type") or "").strip()
        if overlay_type not in HF_GLOBAL_OVERLAY_TYPES:
            continue

        out_label = f"gfx{index}"
        if overlay_type == "hf-vignette":
            intensity = _clamp(float(item.get("intensity") or 0.7), 0.2, 0.95)
            angle = 0.45 + intensity * 0.35
            filters.append(f"[{current}]vignette=angle={angle:.3f}:mode=forward[{out_label}]")
        elif overlay_type == "hf-grain":
            opacity = _clamp(float(item.get("opacity") or 0.15), 0.03, 0.35)
            strength = max(1, int(opacity * 120))
            filters.append(f"[{current}]noise=alls={strength}:allf=t+u[{out_label}]")
        elif overlay_type == "hf-color-grade":
            warmth = _clamp(float(item.get("grade_warmth") or 0.58), 0.0, 1.0)
            strength = _clamp(float(item.get("grade_strength") or 0.28), 0.05, 0.55)
            saturation = _clamp(float(item.get("grade_saturation") or 1.08), 0.85, 1.35)
            gamma_r = 1.0 + (warmth - 0.5) * strength
            gamma_b = 1.0 - (warmth - 0.5) * strength * 0.85
            filters.append(
                f"[{current}]eq=gamma_r={gamma_r:.3f}:gamma_b={gamma_b:.3f}:saturation={saturation:.3f}[{out_label}]"
            )
        elif overlay_type == "hf-light-leak":
            leak = _clamp(float(item.get("leak_intensity") or 0.45), 0.1, 0.85)
            filters.append(
                f"[{current}]eq=brightness={leak * 0.08:.3f}:saturation={1.0 + leak * 0.12:.3f}[{out_label}]"
            )
        elif overlay_type == "hf-motion-blur":
            blur = _clamp(float(item.get("blur_intensity") or 0.35), 0.1, 0.65)
            direction = str(item.get("direction") or "horizontal")
            if direction == "vertical":
                filters.append(f"[{current}]gblur=sigma={blur * 6:.2f}[{out_label}]")
            else:
                filters.append(
                    f"[{current}]split[a][b];[a]gblur=sigma={blur * 5:.2f}[c];[b][c]blend=all_mode=addition:all_opacity={blur * 0.35:.2f}[{out_label}]"
                )
        else:
            continue
        current = out_label

    return filters, current