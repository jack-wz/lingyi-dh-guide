"""Stage4 self-audit skill mechanism — pluggable render diagnostics.

A "skill" is a small, focused audit check that receives the same execution
context and returns structured findings. The runner aggregates findings into
the legacy `audit_render_job` dict shape and writes a dedicated
`diagnostics.json` report for tooling/debugging.
"""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass, field
from glob import glob
from typing import Any, Protocol

from worker import timeline_sync
from worker.ffmpeg_effects import expected_output_duration_with_xfade

_DURATION_TOLERANCE_SEC = 0.35
_ASS_DIALOGUE_RE = re.compile(
    r"^Dialogue:\s*\d+,(\d+:\d{2}:\d{2}\.\d{2}),(\d+:\d{2}:\d{2}\.\d{2}),",
    re.MULTILINE,
)


class AuditSkill(Protocol):
    """A single self-audit check."""

    name: str

    def run(self, ctx: "AuditContext") -> "AuditFinding":
        ...


@dataclass
class AuditContext:
    """Shared context passed to every skill."""

    work_dir: str
    segments: list[dict[str, Any]] = field(default_factory=list)
    overlays: list[dict[str, Any]] = field(default_factory=list)
    global_config: dict[str, Any] = field(default_factory=dict)
    dsl: dict[str, Any] = field(default_factory=dict)
    synced_segments: list[dict[str, Any]] = field(default_factory=list)
    synced_overlays: list[dict[str, Any]] = field(default_factory=list)
    total_duration: float = 0.0


@dataclass
class AuditFinding:
    """Result of one skill execution."""

    skill: str
    status: str  # "ok" | "warn" | "fail"
    issues: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    diagnostics: dict[str, Any] = field(default_factory=dict)


def _segment_media_duration(seg: dict, index: int, work_dir: str) -> float:
    """Prefer clip duration, then TTS wav, then stored duration_sec."""
    clip_path = seg.get("clip_path") or ""
    if clip_path and os.path.exists(clip_path):
        clip_dur = timeline_sync.get_duration(clip_path)
        if clip_dur > 0:
            return clip_dur

    tts_path = seg.get("tts_audio_path") or seg.get("tts_path") or ""
    if not tts_path:
        tts_path = os.path.join(work_dir, f"tts_{index}.wav")
    if tts_path and os.path.exists(tts_path):
        tts_dur = timeline_sync.get_duration(tts_path)
        if tts_dur > 0:
            return tts_dur

    return float(seg.get("duration_sec") or 5.0)


def _ass_time_to_sec(value: str) -> float:
    match = re.match(r"^(\d+):(\d{2}):(\d{2})\.(\d{2})$", value.strip())
    if not match:
        return 0.0
    h, m, s, cs = (int(x) for x in match.groups())
    return h * 3600 + m * 60 + s + cs / 100.0


def _ass_coverage_sec(ass_path: str) -> tuple[float, int]:
    if not os.path.exists(ass_path):
        return 0.0, 0
    with open(ass_path, encoding="utf-8-sig") as f:
        content = f.read()
    ends = [_ass_time_to_sec(m.group(2)) for m in _ASS_DIALOGUE_RE.finditer(content)]
    return (max(ends) if ends else 0.0, len(ends))


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
                "duration_sec": timeline_sync.get_duration(clip_path) if os.path.exists(clip_path) else 0,
                "narration_text": "",
            }
        )
    segments.sort(key=lambda s: s.get("clip_path", ""))
    return segments


class SegmentValidationSkill:
    """Validate clip existence/duration/TTS alignment."""

    name = "segment_validation"

    def run(self, ctx: AuditContext) -> AuditFinding:
        issues: list[str] = []
        warnings: list[str] = []
        work_dir = ctx.work_dir

        for i, seg in enumerate(ctx.synced_segments):
            text = (seg.get("narration_text") or "").strip()
            clip_path = seg.get("clip_path") or ""
            duration = float(seg.get("duration_sec") or 0)

            if not clip_path or not os.path.exists(clip_path):
                issues.append(f"segment[{i}]: missing clip_path")
                continue

            clip_dur = timeline_sync.get_duration(clip_path)
            if clip_dur <= 0:
                issues.append(f"segment[{i}]: unreadable clip duration ({clip_path})")
                continue

            if abs(clip_dur - duration) > _DURATION_TOLERANCE_SEC:
                warnings.append(
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
                if not has_tts_wav:
                    has_muxed_audio = (
                        timeline_sync.has_audio_stream(clip_path)
                        and timeline_sync.get_duration(clip_path, codec_type="audio") > 0
                    )
                    if not has_muxed_audio:
                        warnings.append(f"segment[{i}]: narration present but TTS missing")
                else:
                    tts_dur = timeline_sync.get_duration(tts_path)
                    if tts_dur > 0 and abs(tts_dur - clip_dur) > _DURATION_TOLERANCE_SEC:
                        warnings.append(
                            f"segment[{i}]: TTS/clip mismatch tts={tts_dur:.2f}s "
                            f"clip={clip_dur:.2f}s"
                        )

        return AuditFinding(
            skill=self.name,
            status="fail" if issues else ("warn" if warnings else "ok"),
            issues=issues,
            warnings=warnings,
            diagnostics={"segment_count": len(ctx.synced_segments)},
        )


class FinalDurationSkill:
    """Compare final output duration with expected timeline (+ transitions)."""

    name = "final_duration"

    def run(self, ctx: AuditContext) -> AuditFinding:
        issues: list[str] = []
        warnings: list[str] = []

        final_candidates = ["final.mp4", "final_ass_jianying.mp4", "final_jianying.mp4"]
        final_path = next(
            (
                os.path.join(ctx.work_dir, name)
                for name in final_candidates
                if os.path.exists(os.path.join(ctx.work_dir, name))
            ),
            "",
        )
        final_duration = timeline_sync.get_duration(final_path) if final_path else 0.0
        expected_duration = ctx.total_duration

        if final_path and final_duration > 0:
            transition_segments = ctx.synced_segments
            dsl = ctx.dsl
            if dsl and dsl.get("segments"):
                transition_segments = dsl["segments"]
            try:
                clip_durations = [
                    _segment_media_duration(seg, i, ctx.work_dir)
                    for i, seg in enumerate(ctx.synced_segments)
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
                    f"final video duration={final_duration:.2f}s differs from "
                    f"expected={expected_duration:.2f}s"
                )
        elif any(os.path.exists(os.path.join(ctx.work_dir, n)) for n in final_candidates):
            warnings.append("final video exists but duration unreadable")
        else:
            warnings.append("no final.mp4 — clips/tts only")

        return AuditFinding(
            skill=self.name,
            status="fail" if issues else ("warn" if warnings else "ok"),
            issues=issues,
            warnings=warnings,
            diagnostics={
                "final_duration_sec": round(final_duration, 3) if final_duration else None,
                "expected_duration_sec": round(expected_duration, 3),
                "final_path": final_path,
            },
        )


class SubtitleCoverageSkill:
    """Check ASS subtitle coverage against total timeline duration."""

    name = "subtitle_coverage"

    def run(self, ctx: AuditContext) -> AuditFinding:
        ass_path = os.path.join(ctx.work_dir, "subtitles.ass")
        ass_end, ass_lines = _ass_coverage_sec(ass_path)
        warnings: list[str] = []

        if ass_lines == 0:
            warnings.append("subtitles.ass missing or empty")
        elif abs(ass_end - ctx.total_duration) > _DURATION_TOLERANCE_SEC + 0.5:
            warnings.append(
                f"subtitle coverage ends at {ass_end:.2f}s but timeline is {ctx.total_duration:.2f}s"
            )

        return AuditFinding(
            skill=self.name,
            status="warn" if warnings else "ok",
            issues=[],
            warnings=warnings,
            diagnostics={
                "subtitle_lines": ass_lines,
                "subtitle_end_sec": round(ass_end, 3) if ass_lines else None,
            },
        )


class OverlayBoundsSkill:
    """Verify every overlay stays within its parent segment time bounds."""

    name = "overlay_bounds"

    def run(self, ctx: AuditContext) -> AuditFinding:
        issues: list[str] = []
        warnings: list[str] = []

        for ov in ctx.synced_overlays:
            seg_idx = int(ov.get("segment_index", -1))
            if seg_idx < 0 or seg_idx >= len(ctx.synced_segments):
                issues.append(f"overlay {ov.get('id')}: invalid segment_index={seg_idx}")
                continue
            seg_start = ctx.synced_segments[seg_idx]["start_time"]
            seg_end = ctx.synced_segments[seg_idx]["end_time"]
            g_start = float(ov.get("global_start_s", 0))
            g_end = float(ov.get("global_end_s", 0))
            if g_start < seg_start - _DURATION_TOLERANCE_SEC or g_end > seg_end + _DURATION_TOLERANCE_SEC:
                warnings.append(
                    f"overlay {ov.get('id')}: global [{g_start:.2f},{g_end:.2f}] "
                    f"outside segment [{seg_start:.2f},{seg_end:.2f}]"
                )

        return AuditFinding(
            skill=self.name,
            status="fail" if issues else ("warn" if warnings else "ok"),
            issues=issues,
            warnings=warnings,
            diagnostics={"overlay_count": len(ctx.synced_overlays)},
        )


class FrameTemplateLensSkill:
    """Detect missing lens variables for bound frame templates."""

    name = "frame_template_lens"

    def run(self, ctx: AuditContext) -> AuditFinding:
        issues: list[str] = []
        dsl = ctx.dsl
        if not dsl:
            return AuditFinding(skill=self.name, status="ok")

        brand_pack = (dsl.get("globalConfig") or {}).get("brand_pack") or {}
        frames = brand_pack.get("frames") or []
        if not frames:
            return AuditFinding(skill=self.name, status="ok")

        variables = dsl.get("variables") or {}
        frame_map = {f.get("id"): f for f in frames if f.get("id")}

        for i, seg in enumerate(ctx.synced_segments):
            frame_id = seg.get("frame_template_id")
            if not frame_id:
                continue
            frame = frame_map.get(frame_id)
            if not frame:
                continue
            required = frame.get("variables") or []
            if not required:
                continue
            missing = [v for v in required if not str(variables.get(v, "")).strip()]
            if missing:
                frame_name = frame.get("name") or frame_id
                issues.append(
                    f"segment[{i}] bound frame '{frame_name}' missing variables: {', '.join(missing)}"
                )

        return AuditFinding(
            skill=self.name,
            status="fail" if issues else "ok",
            issues=issues,
            warnings=[],
            diagnostics={"bound_frame_count": sum(1 for s in ctx.synced_segments if s.get("frame_template_id"))},
        )


DEFAULT_SKILLS: list[AuditSkill] = [
    SegmentValidationSkill(),
    FinalDurationSkill(),
    SubtitleCoverageSkill(),
    OverlayBoundsSkill(),
    FrameTemplateLensSkill(),
]


def _load_manifest(work_dir: str) -> tuple[list[dict], list[dict]]:
    """Load segments/overlays from manifest or discover from disk."""
    manifest_path = os.path.join(work_dir, "segments_manifest.json")
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
        return segments, manifest.get("overlays", [])
    return _discover_job_segments(work_dir), []


def _load_dsl(work_dir: str) -> dict[str, Any]:
    """Load the audit DSL snapshot if available."""
    dsl_path = os.path.join(work_dir, "dsl.json")
    if os.path.exists(dsl_path):
        try:
            with open(dsl_path, encoding="utf-8") as f:
                return json.load(f)
        except (OSError, json.JSONDecodeError, TypeError, ValueError):
            pass
    return {}


def run_stage4_audit(
    work_dir: str,
    skills: list[AuditSkill] | None = None,
) -> dict[str, Any]:
    """Run all audit skills and return a result compatible with `audit_render_job`.

    Also writes `diagnostics.json` to the work directory with per-skill findings.
    """
    from worker.timeline_sync import reconcile_timeline

    skills = skills or DEFAULT_SKILLS
    segments, overlays = _load_manifest(work_dir)
    if not segments:
        job_id = os.path.basename(work_dir).removeprefix("job_")
        return {
            "job_id": job_id,
            "status": "fail",
            "work_dir": work_dir,
            "segment_count": 0,
            "total_duration_sec": 0.0,
            "expected_final_duration_sec": None,
            "final_duration_sec": None,
            "subtitle_lines": 0,
            "subtitle_end_sec": None,
            "has_manifest": os.path.exists(os.path.join(work_dir, "segments_manifest.json")),
            "issues": ["no segments found (missing clip_*.mp4)"],
            "warnings": [],
            "diagnostics_path": None,
        }

    dsl = _load_dsl(work_dir)
    synced = reconcile_timeline(segments, overlays, work_dir=work_dir)

    ctx = AuditContext(
        work_dir=work_dir,
        segments=segments,
        overlays=overlays,
        global_config=dsl.get("globalConfig") or {},
        dsl=dsl,
        synced_segments=synced["segments"],
        synced_overlays=synced["overlays"],
        total_duration=synced["total_duration"],
    )

    findings: list[AuditFinding] = []
    all_issues: list[str] = []
    all_warnings: list[str] = []
    for skill in skills:
        finding = skill.run(ctx)
        findings.append(finding)
        all_issues.extend(finding.issues)
        all_warnings.extend(finding.warnings)

    status = "fail" if all_issues else ("warn" if all_warnings else "ok")

    job_id = os.path.basename(work_dir).removeprefix("job_")

    diagnostics = {
        "version": 1,
        "job_id": job_id,
        "work_dir": work_dir,
        "status": status,
        "segment_count": len(synced["segments"]),
        "total_duration_sec": synced["total_duration"],
        "skills": [
            {
                "name": f.skill,
                "status": f.status,
                "issues": f.issues,
                "warnings": f.warnings,
                "diagnostics": f.diagnostics,
            }
            for f in findings
        ],
        "issues": all_issues,
        "warnings": all_warnings,
    }

    diag_path = os.path.join(work_dir, "diagnostics.json")
    try:
        with open(diag_path, "w", encoding="utf-8") as f:
            json.dump(diagnostics, f, ensure_ascii=False, indent=2)
    except OSError:
        pass

    final_finding = next((f for f in findings if f.skill == "final_duration"), None)
    return {
        "job_id": job_id,
        "status": status,
        "work_dir": work_dir,
        "segment_count": len(synced["segments"]),
        "total_duration_sec": synced["total_duration"],
        "expected_final_duration_sec": (
            final_finding.diagnostics.get("expected_duration_sec") if final_finding else None
        ),
        "final_duration_sec": (
            final_finding.diagnostics.get("final_duration_sec") if final_finding else None
        ),
        "subtitle_lines": next(
            (
                f.diagnostics.get("subtitle_lines")
                for f in findings
                if f.skill == "subtitle_coverage"
            ),
            None,
        ),
        "subtitle_end_sec": next(
            (
                f.diagnostics.get("subtitle_end_sec")
                for f in findings
                if f.skill == "subtitle_coverage"
            ),
            None,
        ),
        "has_manifest": os.path.exists(os.path.join(work_dir, "segments_manifest.json")),
        "issues": all_issues,
        "warnings": all_warnings,
        "diagnostics_path": diag_path,
    }
