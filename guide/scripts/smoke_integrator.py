#!/usr/bin/env python3
"""Integrator smoke: health → diagnostics → create render → poll until completed."""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

import requests

DEFAULT_TEMPLATE = "517a1920-6376-47ef-871b-9badbaa16b53"
ROOT = Path(__file__).resolve().parents[1]


def log(event: str, **fields: object) -> None:
    payload = {"event": event, **fields}
    print(json.dumps(payload, ensure_ascii=False), flush=True)


def fail(msg: str, code: int = 1, **extra: object) -> int:
    log("error", message=msg, **extra)
    return code


def main() -> int:
    parser = argparse.ArgumentParser(description="Guide integrator smoke test")
    parser.add_argument("--api", default=os.getenv("SERVER_URL", "http://127.0.0.1:8000").rstrip("/"))
    parser.add_argument("--template-id", default=os.getenv("SMOKE_TEMPLATE_ID", DEFAULT_TEMPLATE))
    parser.add_argument("--timeout", type=int, default=int(os.getenv("SMOKE_POLL_TIMEOUT_SEC", "3600")))
    parser.add_argument("--poll-interval", type=int, default=int(os.getenv("SMOKE_POLL_INTERVAL_SEC", "10")))
    parser.add_argument(
        "--submit-only",
        action="store_true",
        default=os.getenv("SUBMIT_ONLY", "").strip() in {"1", "true", "yes"},
    )
    args = parser.parse_args()
    t0 = time.monotonic()

    api = args.api
    session = requests.Session()

    try:
        health = session.get(f"{api}/api/guide/health", timeout=15)
        health.raise_for_status()
        log("health_ok", body=health.json())
    except Exception as exc:
        return fail(
            f"Guide API not reachable at {api}",
            hint="Run ./start_platform.sh from repo root",
            detail=str(exc),
        )

    try:
        diag = session.get(f"{api}/api/config/diagnostics", timeout=30)
        diag.raise_for_status()
        body = diag.json()
        blockers = (body.get("pipelines") or {}).get("standard", {}).get("blockers") or []
        if blockers:
            return fail("Pipeline blockers present", blockers=blockers, hint="Fix ffmpeg or see guide/docs/INTEGRATOR_QUICKSTART.md §3")
        log("diagnostics_ok", warnings=(body.get("pipelines") or {}).get("standard", {}).get("warnings"))
    except Exception as exc:
        return fail("Failed to load /api/config/diagnostics", detail=str(exc))

    payload = {
        "template_id": args.template_id,
        "pipeline_key": "template_editor",
        "input_mode": "template",
    }
    try:
        created = session.post(f"{api}/api/renders", json=payload, timeout=30)
        if created.status_code != 201:
            try:
                err_body = created.json()
            except Exception:
                err_body = created.text[:500]
            return fail(
                "POST /api/renders failed",
                status=created.status_code,
                body=err_body,
                hint="Check template_id exists: GET /api/templates",
            )
        job = created.json()
        job_id = job.get("id")
        if not job_id:
            return fail("Create response missing id", body=job)
        log("render_created", job_id=job_id, template_id=args.template_id)
    except Exception as exc:
        return fail("POST /api/renders error", detail=str(exc))

    elapsed_setup = round(time.monotonic() - t0, 2)
    if args.submit_only:
        log(
            "smoke_submit_only_ok",
            job_id=job_id,
            TTHW_ELAPSED_SEC=elapsed_setup,
            hint="Poll manually: GET /api/renders/{id}",
        )
        return 0

    deadline = time.monotonic() + args.timeout
    last_status = None
    while time.monotonic() < deadline:
        try:
            res = session.get(f"{api}/api/renders/{job_id}", timeout=30)
            res.raise_for_status()
            job = res.json()
        except Exception as exc:
            return fail("Poll failed", job_id=job_id, detail=str(exc))

        status = job.get("status")
        stage = job.get("stage")
        progress = job.get("progress")
        if status != last_status:
            log("render_status", job_id=job_id, status=status, stage=stage, progress=progress)
            last_status = status

        if status == "completed":
            output_url = job.get("output_url")
            elapsed = round(time.monotonic() - t0, 2)
            log(
                "smoke_ok",
                job_id=job_id,
                output_url=output_url,
                TTHW_ELAPSED_SEC=elapsed,
            )
            print(f"TTHW_ELAPSED_SEC={elapsed}", flush=True)
            return 0

        if status in {"failed", "cancelled"}:
            return fail(
                f"Render {status}",
                job_id=job_id,
                error_message=job.get("error_message"),
                hint=f"GET {api}/api/renders/{job_id}/logs",
            )

        time.sleep(args.poll_interval)

    return fail(
        "Poll timeout waiting for completed render",
        job_id=job_id,
        timeout_sec=args.timeout,
        hint="Increase SMOKE_POLL_TIMEOUT_SEC or use SUBMIT_ONLY=1",
    )


if __name__ == "__main__":
    raise SystemExit(main())