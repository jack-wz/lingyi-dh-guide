#!/usr/bin/env python3
"""Video Template Worker - polls server for render jobs and executes pipeline."""

import time
import json
import asyncio
import os
import socket
import traceback
import requests

from worker.config import SERVER_URL, get_pipeline_config, set_job_config_snapshot
from worker.context import PipelineContext
from worker.pipelines import pipeline_registry

# Import pipelines to trigger registration
import worker.pipelines.standard  # noqa: F401
import worker.pipelines.digital_human  # noqa: F401
import worker.pipelines.ai_full_auto  # noqa: F401
import worker.pipelines.template_editor  # noqa: F401
import worker.pipelines.asset_driven  # noqa: F401
import worker.pipelines.avatar_talk  # noqa: F401

WORKER_ID = f"{socket.gethostname()}-{os.getpid()}"
HEARTBEAT_TIMEOUT_MS = int(os.getenv("RENDER_HEARTBEAT_TIMEOUT_MS", str(10 * 60 * 1000)))
TIMEOUT_MAINTENANCE_INTERVAL = float(os.getenv("RENDER_TIMEOUT_SWEEP_INTERVAL", "30"))


def poll_job():
    """Poll server for a queued render job."""
    try:
        res = requests.get(f"{SERVER_URL}/api/renders/next", params={"worker_id": WORKER_ID}, timeout=10)
        if res.status_code == 200:
            return res.json()
        return None
    except Exception:
        return None


def run_timeout_maintenance(timeout_ms=HEARTBEAT_TIMEOUT_MS):
    """Ask the server to fail jobs whose worker heartbeat has gone stale."""
    try:
        res = requests.post(
            f"{SERVER_URL}/api/renders/maintenance/timeouts",
            json={"timeout_ms": timeout_ms},
            timeout=10,
        )
        if res.status_code == 200:
            payload = res.json()
            timed_out = int(payload.get("timed_out") or 0)
            if timed_out:
                print(f"[Worker] Timeout maintenance failed {timed_out} stale job(s)")
            return True
        print(f"[Worker] Timeout maintenance returned HTTP {res.status_code}")
    except Exception as e:
        print(f"[Worker] Timeout maintenance failed: {e}")
    return False


def update_job(job_id, **kwargs):
    """Update render job status on server."""
    try:
        kwargs.setdefault("worker_id", WORKER_ID)
        requests.patch(
            f"{SERVER_URL}/api/renders/{job_id}",
            json=kwargs, timeout=10
        )
    except Exception as e:
        print(f"[Worker] Failed to update job: {e}")


class JobCancelled(RuntimeError):
    """Raised when the server asks the worker to stop a job."""


def heartbeat(job_id):
    """Send heartbeat and return whether cancellation was requested."""
    try:
        res = requests.post(
            f"{SERVER_URL}/api/renders/{job_id}/heartbeat",
            json={"worker_id": WORKER_ID},
            timeout=10,
        )
        if res.status_code == 200:
            return bool(res.json().get("cancel_requested"))
    except Exception as e:
        print(f"[Worker] Heartbeat failed: {e}")
    return False


def post_log(job_id, message, level="info"):
    """Post a log entry for a render job."""
    try:
        requests.post(
            f"{SERVER_URL}/api/renders/{job_id}/logs",
            json={"level": level, "message": message}, timeout=10
        )
    except Exception:
        pass


def process_job(job):
    """Process a render job using the appropriate pipeline."""
    job_id = job["id"]
    print(f"[Worker] Processing job {job_id}")

    # Parse job data
    template_dsl = job.get("template_dsl", {})
    if isinstance(template_dsl, str):
        try:
            template_dsl = json.loads(template_dsl)
        except Exception:
            template_dsl = {}
    variables = {}
    try:
        variables = json.loads(job.get("variables_json", "{}"))
    except Exception:
        pass
    provider_config_snapshot = {}
    try:
        provider_config_snapshot = json.loads(job.get("provider_config_snapshot") or "{}")
    except Exception:
        provider_config_snapshot = {}

    digital_human = {}
    dh_id = job.get("digital_human_id")
    if dh_id:
        try:
            dh_res = requests.get(f"{SERVER_URL}/api/digital-humans/{dh_id}", timeout=10)
            if dh_res.status_code == 200:
                digital_human = dh_res.json()
        except Exception:
            pass

    # Determine pipeline type. The API stores this explicitly; only fall back for older jobs.
    pipeline_key = job.get("pipeline_key") or "standard"
    if not job.get("pipeline_key") and digital_human and digital_human.get("status") == "ready":
        pipeline_key = "digital_human"

    post_log(job_id, f"使用流水线: {pipeline_key}", level="info")
    post_log(job_id, f"输入模式: {job.get('input_mode') or 'template'}", level="info")

    # Create context
    import os
    from worker.config import RENDERS_DIR
    work_dir = os.path.join(RENDERS_DIR, f"job_{job_id}")

    ctx = PipelineContext(
        task_id=job_id,
        dsl=template_dsl,
        variables=variables,
        digital_human=digital_human,
        work_dir=work_dir,
        server_base_url=SERVER_URL,
        on_progress=lambda stage, progress, msg="": _handle_progress(job_id, stage, progress, msg),
    )

    set_job_config_snapshot(provider_config_snapshot)
    try:
        pipeline = pipeline_registry.get(pipeline_key)
        if heartbeat(job_id):
            raise JobCancelled("任务已取消")
        output_path = asyncio.run(pipeline(ctx))
        if heartbeat(job_id):
            raise JobCancelled("任务已取消")

        output_url = f"/renders/job_{job_id}/final.mp4"
        update_job(job_id, status="completed", stage="completed", progress=100, output_url=output_url)
        post_log(job_id, f"任务完成! 输出: {output_url}", level="info")
        print(f"[Worker] Job {job_id} completed!")

    except JobCancelled as e:
        update_job(job_id, status="cancelled", stage="cancelled", progress=0, error_message=str(e))
        post_log(job_id, f"任务已取消: {e}", level="warn")
    except Exception as e:
        from worker.errors import format_worker_error

        error_msg = format_worker_error(e)
        print(f"[Worker] Job {job_id} failed: {error_msg}")
        traceback.print_exc()
        update_job(job_id, status="failed", stage="failed", error_message=error_msg)
        post_log(job_id, f"任务失败: {error_msg}", level="error")
    finally:
        set_job_config_snapshot({})


def _handle_progress(job_id, stage, progress, message):
    """Handle progress callbacks from pipeline."""
    if heartbeat(job_id):
        raise JobCancelled("任务已取消")
    update_job(job_id, stage=stage, progress=progress, heartbeat=True)
    if message:
        post_log(job_id, message)


def main():
    pipeline_cfg = get_pipeline_config()
    poll_interval = pipeline_cfg["poll_interval"]
    print(f"[Worker] Starting {WORKER_ID}... polling {SERVER_URL} every {poll_interval}s (hot-reload from config.json)")
    print(f"[Worker] Available pipelines: {', '.join(p['key'] for p in pipeline_registry.list_pipelines())}")

    from worker.config import KIE_API_KEY, YUNTTS_API_KEY, WAVESPEED_API_KEY
    print(f"[Worker] API Keys: KIE={'yes' if KIE_API_KEY else 'no'}, YunTTS={'yes' if YUNTTS_API_KEY else 'no'}, WaveSpeed={'yes' if WAVESPEED_API_KEY else 'no'}")

    last_timeout_maintenance = 0.0
    while True:
        poll_interval = get_pipeline_config()["poll_interval"]
        now = time.monotonic()
        maintenance_interval = max(TIMEOUT_MAINTENANCE_INTERVAL, float(poll_interval))
        if now - last_timeout_maintenance >= maintenance_interval:
            run_timeout_maintenance()
            last_timeout_maintenance = now

        job = poll_job()
        if job:
            process_job(job)
        else:
            time.sleep(poll_interval)


if __name__ == "__main__":
    main()
