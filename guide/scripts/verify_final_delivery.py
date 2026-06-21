#!/usr/bin/env python3
"""Acceptance checks for FFmpeg single-path delivery on a completed render job."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_RENDERS = ROOT / "data" / "renders"


def fail(msg: str, **extra: object) -> int:
    print(json.dumps({"status": "fail", "message": msg, **extra}, ensure_ascii=False))
    return 1


def ok(**fields: object) -> int:
    print(json.dumps({"status": "ok", **fields}, ensure_ascii=False))
    return 0


def ffprobe_streams(path: Path) -> list[dict]:
    proc = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "stream=index,codec_type,codec_name",
            "-of",
            "json",
            str(path),
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or "ffprobe failed")
    data = json.loads(proc.stdout or "{}")
    return list(data.get("streams") or [])


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify FFmpeg single-path final delivery")
    parser.add_argument("job_id")
    parser.add_argument("--renders-dir", default=os.getenv("RENDERS_DIR", str(DEFAULT_RENDERS)))
    parser.add_argument("--api", default=os.getenv("SERVER_URL", "http://127.0.0.1:3001").rstrip("/"))
    args = parser.parse_args()

    work_dir = Path(args.renders_dir) / f"job_{args.job_id}"
    final_path = work_dir / "final.mp4"
    if not final_path.is_file():
        return fail("final.mp4 missing", work_dir=str(work_dir))

    legacy = work_dir / "base_ffmpeg.mp4"
    if legacy.is_file():
        return fail("base_ffmpeg.mp4 present — dual-path delivery suspected", path=str(legacy))

    streams = ffprobe_streams(final_path)
    codec_types = [s.get("codec_type") for s in streams]
    if "subtitle" in codec_types:
        return fail("separate subtitle stream detected — expected burned-in ASS only", streams=codec_types)
    if codec_types.count("video") != 1 or codec_types.count("audio") != 1:
        return fail("expected exactly one video and one audio stream", streams=codec_types)

    logs_text = ""
    try:
        res = requests.get(f"{args.api}/api/renders/{args.job_id}/logs", timeout=30)
        if res.ok:
            payload = res.json()
            entries = payload if isinstance(payload, list) else payload.get("logs") or payload.get("items") or []
            logs_text = "\n".join(
                e if isinstance(e, str) else str(e.get("message") or e.get("text") or "")
                for e in entries
            )
    except Exception:
        pass

    transition_evidence = False
    dsl_path = work_dir / "dsl.json"
    if dsl_path.is_file():
        try:
            dsl = json.loads(dsl_path.read_text(encoding="utf-8"))
            for seg in dsl.get("segments") or []:
                trans = (seg or {}).get("transition") or {}
                if str(trans.get("type") or "none") not in ("none", ""):
                    transition_evidence = True
                    break
        except (OSError, json.JSONDecodeError, TypeError):
            pass
    if not transition_evidence:
        manifest_path = work_dir / "segments_manifest.json"
        if manifest_path.is_file():
            try:
                manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
                for seg in manifest.get("segments") or []:
                    trans = (seg or {}).get("transition") or {}
                    if str(trans.get("type") or "none") not in ("none", ""):
                        transition_evidence = True
                        break
            except (OSError, json.JSONDecodeError, TypeError):
                pass

    if logs_text:
        if "hf_style_pass" in logs_text.lower() or "hf style pass" in logs_text.lower():
            return fail("worker logs mention hf_style_pass on delivery path")
        if "xfade" in logs_text.lower() or "transitions" in logs_text.lower():
            transition_evidence = True

    if not transition_evidence:
        return fail("no xfade/transition evidence in logs, dsl.json, or segments_manifest")

    duration_proc = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(final_path),
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    duration = float((duration_proc.stdout or "0").strip() or 0)

    return ok(
        job_id=args.job_id,
        final_mp4=str(final_path),
        duration_sec=round(duration, 3),
        streams=codec_types,
        size_bytes=final_path.stat().st_size,
    )


if __name__ == "__main__":
    raise SystemExit(main())