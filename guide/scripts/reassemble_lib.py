"""Shared helpers for reassembling existing clips with a video template."""

from __future__ import annotations

import json
import os
import sqlite3
import sys
from pathlib import Path
from typing import Any

import requests

API = os.getenv("SERVER_URL", "http://127.0.0.1:8000").rstrip("/")
DEFAULT_TEMPLATE_ID = "517a1920-6376-47ef-871b-9badbaa16b53"


def load_template_dsl(template_id: str, root: Path) -> dict[str, Any]:
    """Load template DSL from API, falling back to local templates.db."""
    try:
        resp = requests.get(f"{API}/api/templates/{template_id}", timeout=30)
        if resp.ok:
            data = resp.json()
            dsl = data.get("dsl_json") or data.get("dsl")
            if dsl:
                return dsl
    except Exception as exc:
        print(f"[reassemble] API template fetch failed: {exc}")

    db_path = root / "data/templates.db"
    if db_path.exists():
        conn = sqlite3.connect(db_path)
        try:
            row = conn.execute(
                "SELECT dsl_json FROM templates WHERE id = ?",
                (template_id,),
            ).fetchone()
        finally:
            conn.close()
        if row and row[0]:
            return json.loads(row[0])

    raise RuntimeError(f"template not found: {template_id}")


def reassemble_job(
    job_id: str,
    template_id: str,
    *,
    root: Path | None = None,
    output_name: str = "final.mp4",
    ass_only: bool = True,
) -> dict[str, Any]:
    """Reassemble one job directory with phrase-level ASS + reconciled overlays."""
    root = root or Path(__file__).resolve().parents[1]
    work_dir = root / "data/renders" / f"job_{job_id}"
    if not work_dir.exists():
        raise FileNotFoundError(f"work dir not found: {work_dir}")

    dsl = load_template_dsl(template_id, root)
    if ass_only:
        for seg in dsl.get("segments", []):
            seg["objects"] = [
                o for o in (seg.get("objects") or []) if o.get("type") != "subtitle"
            ]

    sys_path = str(root / "worker")
    if sys_path not in sys.path:
        sys.path.insert(0, sys_path)

    from worker.stage1_parser import parse_template
    from worker.stage4_ffmpeg import assemble_final_video
    from worker.timeline_sync import reconcile_timeline

    parsed = parse_template(dsl, {})
    template_segments = parsed["segments"]
    clip_count = len(list(work_dir.glob("clip_*.mp4")))
    if clip_count < len(template_segments):
        raise RuntimeError(
            f"job {job_id}: only {clip_count} clips, template expects {len(template_segments)}"
        )

    segments: list[dict[str, Any]] = []
    for i, seg in enumerate(template_segments):
        clip = work_dir / f"clip_{i}.mp4"
        if not clip.exists():
            raise FileNotFoundError(f"missing clip: {clip}")
        tts = work_dir / f"tts_{i}.wav"
        segments.append({
            "clip_path": str(clip.resolve()),
            "tts_audio_path": str(tts.resolve()) if tts.exists() else "",
            "duration_sec": seg.get("duration_sec", 10),
            "narration_text": seg.get("narration_text", ""),
            "subtitle": seg.get("subtitle", {}),
        })

    synced = reconcile_timeline(
        segments, parsed.get("overlays", []), work_dir=str(work_dir.resolve())
    )
    out = work_dir / output_name
    assemble_final_video(
        synced["segments"],
        synced["overlays"],
        dsl.get("globalConfig", {}),
        str(work_dir.resolve()),
        str(out.resolve()),
        None,
    )
    return {
        "ok": True,
        "job_id": job_id,
        "output": str(out),
        "bytes": out.stat().st_size,
        "total_duration_sec": synced["total_duration"],
    }