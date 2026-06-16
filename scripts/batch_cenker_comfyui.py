#!/usr/bin/env python3
"""批量调用 GPU 上 ComfyUI 的 cenker 三件套工作流（全 API 节点）。"""

from __future__ import annotations

import argparse
import json
import sys
import time
import uuid
from copy import deepcopy
from pathlib import Path
from typing import Any

import httpx

ROOT = Path(__file__).resolve().parents[1]
WORKFLOW_DIR = ROOT / "workflows" / "selfhost" / "cenker"

WORKFLOW_FILES = {
    "scene": "01_scene_kie.json",
    "tts": "02_tts_yuntts.json",
    "avatar": "03_avatar_infinitetalk.json",
    "full": "04_digital_human_full.json",
}

# node_id -> input field for text / upload params
WORKFLOW_PATCHES: dict[str, dict[str, dict[str, str]]] = {
    "scene": {
        "10": {"scene_image": "image"},
        "11": {"human_face": "image"},
        "12": {"prompt": "value"},
    },
    "tts": {
        "20": {"voice_sample": "audio"},
        "21": {"text": "value"},
    },
    "avatar": {
        "30": {"face_image": "image"},
        "31": {"speech_audio": "audio"},
    },
    "full": {
        "1": {"scene_image": "image"},
        "2": {"human_face": "image"},
        "3": {"prompt": "value"},
        "5": {"voice_sample": "audio"},
        "6": {"text": "value"},
    },
}


def load_jobs(path: Path) -> list[dict[str, Any]]:
    jobs: list[dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        jobs.append(json.loads(line))
    return jobs


def upload_image(client: httpx.Client, base: str, file_path: str) -> str:
    with open(file_path, "rb") as handle:
        resp = client.post(
            f"{base}/upload/image",
            files={"image": (Path(file_path).name, handle, "application/octet-stream")},
            timeout=120.0,
        )
    resp.raise_for_status()
    data = resp.json()
    name = data.get("name")
    if not name:
        raise RuntimeError(f"upload/image failed: {data}")
    return name


def upload_audio(client: httpx.Client, base: str, file_path: str) -> str:
    with open(file_path, "rb") as handle:
        resp = client.post(
            f"{base}/upload/audio",
            files={"audio": (Path(file_path).name, handle, "application/octet-stream")},
            timeout=120.0,
        )
    resp.raise_for_status()
    data = resp.json()
    name = data.get("name")
    if not name:
        raise RuntimeError(f"upload/audio failed: {data}")
    return name


def patch_workflow(
    workflow: dict[str, Any],
    workflow_key: str,
    job: dict[str, Any],
    uploads: dict[str, str],
) -> dict[str, Any]:
    patched = deepcopy(workflow)
    mapping = WORKFLOW_PATCHES[workflow_key]
    for node_id, fields in mapping.items():
        node = patched[node_id]
        for param, input_field in fields.items():
            if param in uploads:
                node["inputs"][input_field] = uploads[param]
            elif param in job:
                node["inputs"][input_field] = job[param]
    return patched


def wait_history(
    client: httpx.Client,
    base: str,
    prompt_id: str,
    poll: float,
    timeout: float,
) -> dict[str, Any]:
    deadline = time.time() + timeout
    while time.time() < deadline:
        resp = client.get(f"{base}/history/{prompt_id}", timeout=30.0)
        resp.raise_for_status()
        data = resp.json()
        if prompt_id not in data:
            time.sleep(poll)
            continue
        entry = data[prompt_id]
        status = entry.get("status", {})
        if status.get("status_str") == "error":
            msgs = status.get("messages") or []
            err = "\n".join(
                body.get("exception_message", "")
                for kind, body in msgs
                if kind == "execution_error"
            )
            raise RuntimeError(err or "ComfyUI execution error")
        if "outputs" in entry:
            return entry
        time.sleep(poll)
    raise TimeoutError(f"ComfyUI timeout: {prompt_id}")


def run_job(client: httpx.Client, base: str, job: dict[str, Any], args: argparse.Namespace) -> dict[str, Any]:
    workflow_key = job.get("workflow", args.workflow)
    if workflow_key not in WORKFLOW_FILES:
        raise ValueError(f"Unknown workflow '{workflow_key}'")

    workflow_path = WORKFLOW_DIR / WORKFLOW_FILES[workflow_key]
    workflow = json.loads(workflow_path.read_text(encoding="utf-8"))
    uploads: dict[str, str] = {}

    patch_map = WORKFLOW_PATCHES[workflow_key]
    needed_uploads: set[str] = set()
    for fields in patch_map.values():
        for param, input_field in fields.items():
            if input_field in {"image", "audio"}:
                needed_uploads.add(param)

    for param in needed_uploads:
        path = job.get(param)
        if not path:
            raise ValueError(f"Job missing upload param '{param}' for workflow '{workflow_key}'")
        if not Path(path).exists():
            raise FileNotFoundError(path)
        if param in {"voice_sample", "speech_audio"}:
            uploads[param] = upload_audio(client, base, path)
        else:
            uploads[param] = upload_image(client, base, path)

    prompt = patch_workflow(workflow, workflow_key, job, uploads)
    client_id = str(uuid.uuid4())
    resp = client.post(
        f"{base}/prompt",
        json={"prompt": prompt, "client_id": client_id},
        timeout=60.0,
    )
    resp.raise_for_status()
    prompt_id = resp.json().get("prompt_id")
    if not prompt_id:
        raise RuntimeError(f"No prompt_id: {resp.text}")

    history = wait_history(client, base, prompt_id, args.poll, args.timeout)
    return {
        "workflow": workflow_key,
        "prompt_id": prompt_id,
        "outputs": history.get("outputs", {}),
        "status": "completed",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="批量跑 cenker ComfyUI 工作流")
    parser.add_argument("--comfyui", default="http://127.0.0.1:8188", help="ComfyUI 地址")
    parser.add_argument("--jobs", type=Path, required=True, help="JSONL 任务文件，每行一个 job")
    parser.add_argument(
        "--workflow",
        default="full",
        choices=list(WORKFLOW_FILES),
        help="默认工作流（job 未指定 workflow 时使用）",
    )
    parser.add_argument("--poll", type=float, default=5.0)
    parser.add_argument("--timeout", type=float, default=1800.0)
    parser.add_argument("--out", type=Path, default=Path("cenker_batch_results.jsonl"))
    args = parser.parse_args()

    if not args.jobs.exists():
        parser.error(f"jobs file not found: {args.jobs}")

    jobs = load_jobs(args.jobs)
    if not jobs:
        parser.error("jobs file is empty")

    base = args.comfyui.rstrip("/")
    results: list[dict[str, Any]] = []

    with httpx.Client() as client:
        client.get(f"{base}/system_stats", timeout=10.0).raise_for_status()
        for i, job in enumerate(jobs, 1):
            label = job.get("id") or job.get("text", "")[:24] or f"job-{i}"
            print(f"[{i}/{len(jobs)}] {label}")
            record = {"job": job}
            try:
                record.update(run_job(client, base, job, args))
                print(f"  ✅ prompt_id={record['prompt_id']}")
            except Exception as exc:  # noqa: BLE001
                record["status"] = "failed"
                record["error"] = str(exc)
                print(f"  ❌ {exc}")
            results.append(record)

    args.out.write_text(
        "\n".join(json.dumps(r, ensure_ascii=False) for r in results) + "\n",
        encoding="utf-8",
    )
    print(f"结果写入 {args.out}")
    failed = sum(1 for r in results if r.get("status") != "completed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())