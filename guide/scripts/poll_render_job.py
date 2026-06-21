#!/usr/bin/env python3
"""Poll a render job until completed/failed/cancelled (lightweight ?summary=1)."""

from __future__ import annotations

import argparse
import json
import os
import sys
import time

import requests


def log(event: str, **fields: object) -> None:
    print(json.dumps({"event": event, **fields}, ensure_ascii=False), flush=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="Poll render job status")
    parser.add_argument("job_id", nargs="?", default=os.getenv("JOB_ID", "").strip())
    parser.add_argument("--api", default=os.getenv("SERVER_URL", "http://127.0.0.1:3001").rstrip("/"))
    parser.add_argument("--timeout", type=int, default=int(os.getenv("SMOKE_POLL_TIMEOUT_SEC", "3600")))
    parser.add_argument("--interval", type=int, default=int(os.getenv("SMOKE_POLL_INTERVAL_SEC", "15")))
    args = parser.parse_args()
    if not args.job_id:
        print("usage: poll_render_job.py <job_id>", file=sys.stderr)
        return 2

    session = requests.Session()
    deadline = time.monotonic() + args.timeout
    last = None
    while time.monotonic() < deadline:
        try:
            res = session.get(
                f"{args.api}/api/renders/{args.job_id}",
                params={"summary": "1"},
                timeout=30,
            )
            res.raise_for_status()
            job = res.json()
        except Exception as exc:
            log("poll_error", job_id=args.job_id, detail=str(exc))
            return 1

        status = job.get("status")
        stage = job.get("stage")
        progress = job.get("progress")
        key = (status, stage, progress)
        if key != last:
            log(
                "render_status",
                job_id=args.job_id,
                status=status,
                stage=stage,
                progress=progress,
                output_url=job.get("output_url"),
            )
            last = key

        if status == "completed":
            log("poll_ok", job_id=args.job_id, output_url=job.get("output_url"))
            return 0
        if status in {"failed", "cancelled"}:
            log(
                "poll_failed",
                job_id=args.job_id,
                status=status,
                error_message=job.get("error_message"),
            )
            return 1
        time.sleep(args.interval)

    log("poll_timeout", job_id=args.job_id, timeout_sec=args.timeout)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())