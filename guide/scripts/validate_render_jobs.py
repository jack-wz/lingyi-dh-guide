#!/usr/bin/env python3
"""批量校验 renders/job_* 目录的 TTS / clip / 字幕 / 贴纸时间轴对齐情况。"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate render job timeline alignment")
    parser.add_argument(
        "--renders-dir",
        default="",
        help="Path to guide/data/renders (default: auto-detect)",
    )
    parser.add_argument("--job", action="append", default=[], help="Only audit specific job id(s)")
    parser.add_argument("--json-out", default="", help="Write full report JSON to this path")
    parser.add_argument("--fail-on-warn", action="store_true", help="Exit 1 when warnings exist")
    parser.add_argument(
        "--allow-empty",
        action="store_true",
        help="Exit 0 when no job directories exist (CI without local renders)",
    )
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[1]
    renders_dir = Path(args.renders_dir) if args.renders_dir else root / "data/renders"
    if not renders_dir.exists():
        print(f"renders dir not found: {renders_dir}", file=sys.stderr)
        return 1

    sys.path.insert(0, str(root / "worker"))
    from worker.timeline_sync import audit_render_job

    job_dirs: list[Path] = []
    if args.job:
        for job_id in args.job:
            path = renders_dir / f"job_{job_id}"
            if path.exists():
                job_dirs.append(path)
            else:
                print(f"skip missing job: {job_id}")
    else:
        job_dirs = sorted(
            p for p in renders_dir.iterdir()
            if p.is_dir() and p.name.startswith("job_")
        )

    if not job_dirs:
        print(f"No job directories under {renders_dir}")
        if args.allow_empty:
            print("allow-empty: skipping audit (CI ok)")
            return 0
        return 1

    results = [audit_render_job(str(path)) for path in job_dirs]
    summary = {
        "audited_at": datetime.now(timezone.utc).isoformat(),
        "renders_dir": str(renders_dir),
        "total_jobs": len(results),
        "ok": sum(1 for r in results if r["status"] == "ok"),
        "warn": sum(1 for r in results if r["status"] == "warn"),
        "fail": sum(1 for r in results if r["status"] == "fail"),
        "jobs": results,
    }

    for item in results:
        flag = {"ok": "✓", "warn": "!", "fail": "✗"}.get(item["status"], "?")
        dur = item.get("total_duration_sec")
        dur_text = f"{dur:.1f}s" if isinstance(dur, (int, float)) else "—"
        print(f"[{flag}] {item['job_id']}  segments={item.get('segment_count', 0)}  timeline={dur_text}")
        for msg in item.get("issues", []):
            print(f"    ERROR: {msg}")
        for msg in item.get("warnings", []):
            print(f"    warn: {msg}")

    print(
        f"\nSummary: {summary['ok']} ok, {summary['warn']} warn, {summary['fail']} fail "
        f"(total {summary['total_jobs']})"
    )

    if args.json_out:
        out_path = Path(args.json_out)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"Report written: {out_path}")

    if summary["fail"] > 0:
        return 1
    if args.fail_on_warn and summary["warn"] > 0:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())