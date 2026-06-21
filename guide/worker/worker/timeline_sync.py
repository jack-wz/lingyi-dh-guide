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
    """Audit one render job directory for timeline alignment issues."""
    job_id = os.path.basename(work_dir).removeprefix("job_")
    issues: list[str] = []
    warnings: list[str] = []

    manifest_path = os.path.join(work_dir, "segments_manifest.json")
    manifest: dict[str, Any] | None = None
    if os.path.exists(manifest_path):
        with open(manifest_path, encoding="utf-8") as f:
            manifest = json.load(f)
        segments = manifest.get("segments", [])
        for seg in segments:
            if seg.get("clip_path") and not os.path.isabs(seg["clip_path"]):
                seg["clip_path"] = os.path.join(work_dir, os.path.basename(seg["clip_path"]))
            if seg.get("tts_audio_path") and not os.path.isabs(seg["tts_audio_path"]):
                seg["tts_audio_path"] = os.path.join(
                    work_dir, os.path.basename(seg["tts_audio_path"])
                )
    else:
        warnings.append("segments_manifest.json missing — auditing from clip/tts files")
        segments = _discover_job_segments(work_dir)

    if not segments:
        issues.append("no segments found (missing clip_*.mp4)")
        return {
            "job_id": job_id,
            "status": "fail",
            "issues": issues,
            "warnings": warnings,
        }

    synced = reconcile_timeline(segments, manifest.get("overlays", []) if manifest else [], work_dir=work_dir)
    total_duration = synced["total_duration"]
    segment_issues = validate_segments_for_assembly(
        synced["segments"], work_dir=work_dir, strict=False
    )
    for msg in segment_issues:
        if "missing" in msg or "unreadable" in msg:
            issues.append(msg)
        else:
            warnings.append(msg)

    final_candidates = ["final.mp4", "final_ass_jianying.mp4", "final_jianying.mp4"]
    final_path = next(
        (os.path.join(work_dir, name) for name in final_candidates if os.path.exists(os.path.join(work_dir, name))),
        "",
    )
    final_duration = get_duration(final_path) if final_path else 0.0
    if final_path and final_duration > 0:
        expected_duration = total_duration
        transition_segments = synced["segments"]
        dsl_path = os.path.join(work_dir, "dsl.json")
        if os.path.exists(dsl_path):
            try:
                with open(dsl_path, encoding="utf-8") as f:
                    dsl = json.load(f)
                transition_segments = dsl.get("segments") or transition_segments
            except (OSError, json.JSONDecodeError, TypeError, ValueError):
                pass
        elif manifest and manifest.get("segments"):
            transition_segments = manifest["segments"]
        try:
            clip_durations = [
                _segment_media_duration(seg, i, work_dir)
                for i, seg in enumerate(synced["segments"])
            ]
            xfade_duration = expected_output_duration_with_xfade(
                clip_durations,
                transition_segments,
            )
            if xfade_duration is not None:
                expected_duration = xfade_duration
        except (TypeError, ValueError):
            pass
        if abs(final_duration - expected_duration) > _DURATION_TOLERANCE_SEC + 0.5:
            warnings.append(
                f"final video duration={final_duration:.2f}s differs from expected={expected_duration:.2f}s"
            )
    elif any(os.path.exists(os.path.join(work_dir, n)) for n in final_candidates):
        warnings.append("final video exists but duration unreadable")
    else:
        warnings.append("no final.mp4 — clips/tts only")

    ass_path = os.path.join(work_dir, "subtitles.ass")
    ass_end, ass_lines = _ass_coverage_sec(ass_path)
    if ass_lines == 0:
        warnings.append("subtitles.ass missing or empty")
    elif abs(ass_end - total_duration) > _DURATION_TOLERANCE_SEC + 0.5:
        warnings.append(
            f"subtitle coverage ends at {ass_end:.2f}s but timeline is {total_duration:.2f}s"
        )

    if manifest:
        for ov in manifest.get("overlays", []):
            seg_idx = int(ov.get("segment_index", -1))
            if seg_idx < 0 or seg_idx >= len(synced["segments"]):
                issues.append(f"overlay {ov.get('id')}: invalid segment_index={seg_idx}")
                continue
            seg_start = synced["segments"][seg_idx]["start_time"]
            seg_end = synced["segments"][seg_idx]["end_time"]
            g_start = float(ov.get("global_start_s", 0))
            g_end = float(ov.get("global_end_s", 0))
            if g_start < seg_start - _DURATION_TOLERANCE_SEC or g_end > seg_end + _DURATION_TOLERANCE_SEC:
                warnings.append(
                    f"overlay {ov.get('id')}: global [{g_start:.2f},{g_end:.2f}] "
                    f"outside segment [{seg_start:.2f},{seg_end:.2f}]"
                )

    status = "fail" if issues else ("warn" if warnings else "ok")
    return {
        "job_id": job_id,
        "status": status,
        "work_dir": work_dir,
        "segment_count": len(synced["segments"]),
        "total_duration_sec": total_duration,
        "expected_final_duration_sec": round(expected_duration, 3)
        if final_path and final_duration > 0
        else None,
        "final_duration_sec": round(final_duration, 3) if final_duration else None,
        "subtitle_lines": ass_lines,
        "subtitle_end_sec": round(ass_end, 3) if ass_lines else None,
        "has_manifest": manifest is not None,
        "issues": issues,
        "warnings": warnings,
    }


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