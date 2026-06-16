#!/usr/bin/env python3
"""批量对历史 render job 重组装：短语字幕 + TTS 对齐时间轴 + 剪映贴纸层。"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

_SCRIPTS_DIR = Path(__file__).resolve().parent
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from reassemble_lib import DEFAULT_TEMPLATE_ID, reassemble_job


def _needs_reassemble(item: dict, *, min_segments: int) -> bool:
    if item.get("status") == "ok":
        return False
    if item.get("segment_count", 0) < min_segments:
        return False
    if any("no segments found" in msg for msg in item.get("issues", [])):
        return False

    warnings = item.get("warnings", [])
    signals = (
        "subtitle coverage ends",
        "segments_manifest.json missing",
        "subtitles.ass missing",
        "no final.mp4",
    )
    return any(any(sig in warning for sig in signals) for warning in warnings)


def main() -> int:
    parser = argparse.ArgumentParser(description="Batch reassemble render jobs")
    parser.add_argument("--template-id", default=DEFAULT_TEMPLATE_ID)
    parser.add_argument("--audit", default="", help="Path to render_jobs_audit.json")
    parser.add_argument("--job", action="append", default=[], help="Explicit job id(s)")
    parser.add_argument("--min-segments", type=int, default=4)
    parser.add_argument("--needs-fix", action="store_true", help="Only jobs flagged by audit")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--output-name", default="final.mp4")
    parser.add_argument("--json-out", default="")
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[1]
    audit_path = Path(args.audit) if args.audit else root / "data/render_jobs_audit.json"

    targets: list[str] = list(args.job)
    if not targets:
        if not audit_path.exists():
            print(f"audit file not found: {audit_path}", file=sys.stderr)
            return 1
        audit = json.loads(audit_path.read_text(encoding="utf-8"))
        for item in audit.get("jobs", []):
            if args.needs_fix and not _needs_reassemble(item, min_segments=args.min_segments):
                continue
            if not args.needs_fix and item.get("segment_count", 0) < args.min_segments:
                continue
            if item.get("status") == "fail" and item.get("segment_count", 0) == 0:
                continue
            targets.append(item["job_id"])

    targets = sorted(set(targets))
    if not targets:
        print("No jobs selected.")
        return 0

    print(f"Selected {len(targets)} job(s), template={args.template_id}")
    if args.dry_run:
        for job_id in targets:
            print(f"  would reassemble: {job_id}")
        return 0

    sys.path.insert(0, str(root / "worker"))
    from worker.timeline_sync import audit_render_job

    results: list[dict] = []
    failed = 0
    for job_id in targets:
        print(f"\n=== Reassemble {job_id} ===")
        try:
            outcome = reassemble_job(
                job_id,
                args.template_id,
                root=root,
                output_name=args.output_name,
            )
            post = audit_render_job(str(root / "data/renders" / f"job_{job_id}"))
            outcome["post_audit_status"] = post["status"]
            outcome["post_warnings"] = post.get("warnings", [])
            results.append(outcome)
            print(json.dumps(outcome, ensure_ascii=False))
        except Exception as exc:
            failed += 1
            err = {"ok": False, "job_id": job_id, "error": str(exc)}
            results.append(err)
            print(json.dumps(err, ensure_ascii=False), file=sys.stderr)

    summary = {
        "completed_at": datetime.now(timezone.utc).isoformat(),
        "template_id": args.template_id,
        "selected": len(targets),
        "succeeded": sum(1 for r in results if r.get("ok")),
        "failed": failed,
        "results": results,
    }
    if args.json_out:
        out_path = Path(args.json_out)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"\nBatch report: {out_path}")

    print(
        f"\nBatch done: {summary['succeeded']} ok, {summary['failed']} failed "
        f"(total {summary['selected']})"
    )
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())