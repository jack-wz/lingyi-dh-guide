"""Timeline reconciliation — keep subtitles, overlays, and clips aligned to TTS."""

from __future__ import annotations

import json
import os
import re
from glob import glob
from typing import Any

from worker.ffmpeg_effects import expected_output_duration_with_xfade
from worker.utils import get_duration, has_audio_stream

_DURATION_TOLERANCE_SEC = 0.35
_ASS_DIALOGUE_RE = re.compile(
    r"^Dialogue:\s*\d+,(\d+:\d{2}:\d{2}\.\d{2}),(\d+:\d{2}:\d{2}\.\d{2}),",
    re.MULTILINE,
)


def _segment_media_duration(seg: dict, index: int, work_dir: str) -> float:
    """Prefer clip duration, then TTS wav, then stored duration_sec."""
    clip_path = seg.get("clip_path") or ""
    if clip_path and os.path.exists(clip_path):
        clip_dur = get_duration(clip_path)
        if clip_dur > 0:
            return clip_dur

    tts_path = seg.get("tts_audio_path") or seg.get("tts_path") or ""
    if not tts_path:
        tts_path = os.path.join(work_dir, f"tts_{index}.wav")
    if tts_path and os.path.exists(tts_path):
        tts_dur = get_duration(tts_path)
        if tts_dur > 0:
            return tts_dur

    return float(seg.get("duration_sec") or 5.0)


def reconcile_timeline(
    segments: list[dict],
    overlays: list[dict] | None = None,
    *,
    work_dir: str = "",
) -> dict[str, Any]:
    """Recompute segment and overlay global times from actual media durations."""
    overlays = list(overlays or [])
    cursor = 0.0
    reconciled_segments: list[dict] = []

    for i, raw_seg in enumerate(segments):
        seg = dict(raw_seg)
        duration = _segment_media_duration(seg, i, work_dir)
        seg["duration_sec"] = round(duration, 3)
        seg["start_time"] = round(cursor, 3)
        seg["end_time"] = round(cursor + duration, 3)
        reconciled_segments.append(seg)
        cursor += duration

    segment_bounds = {
        i: (seg["start_time"], seg["end_time"])
        for i, seg in enumerate(reconciled_segments)
    }

    reconciled_overlays: list[dict] = []
    for ov in overlays:
        item = dict(ov)
        seg_idx = int(item.get("segment_index", 0))
        seg_start, seg_end = segment_bounds.get(seg_idx, (0.0, 0.0))
        seg_span = max(seg_end - seg_start, 0.0)

        rel_start = float(item.get("seg_start_time", 0.0))
        ov_duration = float(item.get("duration", seg_span))
        if ov_duration <= 0:
            ov_duration = seg_span

        global_start = seg_start + rel_start
        global_end = min(global_start + ov_duration, seg_end)
        if global_end <= global_start and seg_span > 0:
            global_end = seg_end

        item["global_start_s"] = round(global_start, 3)
        item["global_end_s"] = round(global_end, 3)
        reconciled_overlays.append(item)

    return {
        "segments": reconciled_segments,
        "overlays": reconciled_overlays,
        "total_duration": round(cursor, 3),
    }


def validate_segments_for_assembly(
    segments: list[dict],
    *,
    work_dir: str = "",
    strict: bool = True,
) -> list[str]:
    """Return validation issues; raise when strict and blocking issues exist."""
    issues: list[str] = []

    for i, seg in enumerate(segments):
        text = (seg.get("narration_text") or "").strip()
        clip_path = seg.get("clip_path") or ""
        duration = float(seg.get("duration_sec") or 0)

        if not clip_path or not os.path.exists(clip_path):
            issues.append(f"segment[{i}]: missing clip_path")
            continue

        clip_dur = get_duration(clip_path)
        if clip_dur <= 0:
            issues.append(f"segment[{i}]: unreadable clip duration ({clip_path})")
            continue

        if abs(clip_dur - duration) > _DURATION_TOLERANCE_SEC:
            issues.append(
                f"segment[{i}]: duration mismatch clip={clip_dur:.2f}s "
                f"stored={duration:.2f}s"
            )

        if text:
            tts_path = (
                seg.get("tts_audio_path")
                or seg.get("tts_path")
                or os.path.join(work_dir, f"tts_{i}.wav")
            )
            has_tts_wav = bool(tts_path and os.path.exists(tts_path))
            if strict:
                if not has_tts_wav:
                    issues.append(f"segment[{i}]: narration present but TTS wav missing")
            else:
                has_muxed_audio = (
                    clip_path
                    and os.path.exists(clip_path)
                    and has_audio_stream(clip_path)
                    and get_duration(clip_path, codec_type="audio") > 0
                )
                if not has_tts_wav and not has_muxed_audio:
                    issues.append(f"segment[{i}]: narration present but TTS missing")
            if has_tts_wav:
                tts_dur = get_duration(tts_path)
                if tts_dur > 0 and abs(tts_dur - clip_dur) > _DURATION_TOLERANCE_SEC:
                    issues.append(
                        f"segment[{i}]: TTS/clip mismatch tts={tts_dur:.2f}s "
                        f"clip={clip_dur:.2f}s"
                    )

    if strict:
        blocking = issues
    else:
        blocking = [msg for msg in issues if "missing clip" in msg or "unreadable" in msg]
    if strict and blocking:
        raise RuntimeError("Segment validation failed: " + "; ".join(blocking))
    return issues


def write_segments_manifest(
    segments: list[dict],
    overlays: list[dict],
    work_dir: str,
    *,
    extra: dict | None = None,
) -> str:
    """Persist per-job timing audit file for batch QA."""
    manifest = {
        "version": 1,
        "total_duration_sec": round(
            sum(float(s.get("duration_sec") or 0) for s in segments), 3
        ),
        "segments": [
            {
                "index": i,
                "narration_text": seg.get("narration_text", ""),
                "duration_sec": seg.get("duration_sec"),
                "start_time": seg.get("start_time"),
                "end_time": seg.get("end_time"),
                "clip_path": seg.get("clip_path"),
                "tts_audio_path": seg.get("tts_audio_path") or seg.get("tts_path"),
                "transition": seg.get("transition"),
            }
            for i, seg in enumerate(segments)
        ],
        "overlays": [
            {
                "id": ov.get("id"),
                "segment_index": ov.get("segment_index"),
                "global_start_s": ov.get("global_start_s"),
                "global_end_s": ov.get("global_end_s"),
            }
            for ov in overlays
        ],
    }
    if extra:
        manifest.update(extra)

    path = os.path.join(work_dir, "segments_manifest.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    return path


def _ass_time_to_sec(value: str) -> float:
    match = re.match(r"^(\d+):(\d{2}):(\d{2})\.(\d{2})$", value.strip())
    if not match:
        return 0.0
    h, m, s, cs = (int(x) for x in match.groups())
    return h * 3600 + m * 60 + s + cs / 100.0


def _discover_job_segments(work_dir: str) -> list[dict]:
    """Build segment list from on-disk clip/tts files when manifest is absent."""
    clip_paths = sorted(glob(os.path.join(work_dir, "clip_*.mp4")))
    segments: list[dict] = []
    for clip_path in clip_paths:
        base = os.path.basename(clip_path)
        index = int(base.replace("clip_", "").replace(".mp4", ""))
        tts_path = os.path.join(work_dir, f"tts_{index}.wav")
        segments.append(
            {
                "clip_path": clip_path,
                "tts_audio_path": tts_path if os.path.exists(tts_path) else "",
                "duration_sec": get_duration(clip_path) if os.path.exists(clip_path) else 0,
                "narration_text": "",
            }
        )
    segments.sort(key=lambda s: s.get("clip_path", ""))
    return segments


def _ass_coverage_sec(ass_path: str) -> tuple[float, int]:
    if not os.path.exists(ass_path):
        return 0.0, 0
    with open(ass_path, encoding="utf-8-sig") as f:
        content = f.read()
    ends = [_ass_time_to_sec(m.group(2)) for m in _ASS_DIALOGUE_RE.finditer(content)]
    return (max(ends) if ends else 0.0, len(ends))


def audit_render_job(work_dir: str) -> dict[str, Any]:
    """Audit one render job directory for timeline alignment issues.

    Delegates to the Stage4 self-audit skill runner and preserves the legacy
    return shape for callers.
    """
    from worker.stage4_audit import run_stage4_audit

    return run_stage4_audit(work_dir)


def validate_job_after_assembly(
    work_dir: str,
    *,
    job_id: str | None = None,
    strict: bool = False,
    enabled: bool = True,
) -> dict[str, Any] | None:
    """Post-assembly gate: audit TTS/clip/subtitle alignment; raise on failure."""
    if not enabled:
        print("[TimelineValidate] skipped (disabled)")
        return None

    label = job_id or os.path.basename(work_dir).removeprefix("job_")
    result = audit_render_job(work_dir)
    print(
        f"[TimelineValidate] job={label} status={result['status']} "
        f"segments={result.get('segment_count', 0)} "
        f"duration={result.get('total_duration_sec')}s"
    )
    for issue in result.get("issues", []):
        print(f"[TimelineValidate] ERROR: {issue}")
    for warning in result.get("warnings", []):
        print(f"[TimelineValidate] warn: {warning}")

    if result["status"] == "fail":
        joined = "; ".join(result.get("issues") or ["unknown timeline error"])
        raise RuntimeError(f"Timeline validation failed for job {label}: {joined}")
    if strict and result.get("warnings"):
        joined = "; ".join(result["warnings"])
        raise RuntimeError(f"Timeline validation warnings (strict) for job {label}: {joined}")
    return result