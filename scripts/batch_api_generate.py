#!/usr/bin/env python3
"""批量调用 Pixelle-Video API 生成短视频（纯 API 模式）。"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Any

import httpx

DEFAULT_API = "http://127.0.0.1:8000"
DEFAULT_MEDIA = "api/dashscope/wan2.6-t2i"
DEFAULT_TEMPLATE = "1080x1920/image_default.html"


def submit_job(client: httpx.Client, base_url: str, topic: str, args: argparse.Namespace) -> str:
    payload: dict[str, Any] = {
        "text": topic,
        "mode": args.mode,
        "n_scenes": args.scenes,
        "frame_template": args.template,
        "media_workflow": args.media_workflow,
    }
    if args.title_prefix:
        payload["title"] = f"{args.title_prefix}{topic[:30]}"

    resp = client.post(f"{base_url}/api/video/generate/async", json=payload, timeout=60.0)
    resp.raise_for_status()
    data = resp.json()
    task_id = data.get("task_id")
    if not task_id:
        raise RuntimeError(f"未返回 task_id: {data}")
    return task_id


def wait_task(client: httpx.Client, base_url: str, task_id: str, poll_sec: float, timeout_sec: float) -> dict[str, Any]:
    deadline = time.time() + timeout_sec
    while time.time() < deadline:
        resp = client.get(f"{base_url}/api/tasks/{task_id}", timeout=30.0)
        resp.raise_for_status()
        data = resp.json()
        status = data.get("status")
        if status in {"completed", "failed", "cancelled"}:
            return data
        time.sleep(poll_sec)
    raise TimeoutError(f"任务超时: {task_id}")


def load_topics(path: Path | None, inline: list[str]) -> list[str]:
    topics = list(inline)
    if path:
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#"):
                topics.append(line)
    return topics


def main() -> int:
    parser = argparse.ArgumentParser(description="批量提交 Pixelle-Video 异步视频任务")
    parser.add_argument("topics", nargs="*", help="主题列表，也可配合 --file")
    parser.add_argument("--file", type=Path, help="每行一个主题的文本文件")
    parser.add_argument("--api", default=DEFAULT_API, help="API 根地址")
    parser.add_argument("--media-workflow", default=DEFAULT_MEDIA, help="媒体工作流，如 api/dashscope/wan2.6-t2i")
    parser.add_argument("--template", default=DEFAULT_TEMPLATE, help="HTML 模板路径")
    parser.add_argument("--mode", choices=["generate", "fixed"], default="generate")
    parser.add_argument("--scenes", type=int, default=5)
    parser.add_argument("--title-prefix", default="")
    parser.add_argument("--poll", type=float, default=5.0, help="轮询间隔（秒）")
    parser.add_argument("--timeout", type=float, default=1800.0, help="单任务超时（秒）")
    parser.add_argument("--out", type=Path, default=Path("batch_results.jsonl"), help="结果 JSONL 输出")
    args = parser.parse_args()

    topics = load_topics(args.file, args.topics)
    if not topics:
        parser.error("请提供至少一个主题（参数或 --file）")

    base_url = args.api.rstrip("/")
    results: list[dict[str, Any]] = []

    with httpx.Client() as client:
        health = client.get(f"{base_url}/health", timeout=10.0)
        health.raise_for_status()

        for i, topic in enumerate(topics, 1):
            print(f"[{i}/{len(topics)}] 提交: {topic}")
            record: dict[str, Any] = {"topic": topic}
            try:
                task_id = submit_job(client, base_url, topic, args)
                record["task_id"] = task_id
                print(f"  task_id={task_id}，等待完成…")
                task = wait_task(client, base_url, task_id, args.poll, args.timeout)
                record.update(task)
                if task.get("status") == "completed":
                    print(f"  ✅ {task.get('result', {}).get('video_url', '完成')}")
                else:
                    print(f"  ❌ {task.get('status')}: {task.get('error')}")
            except Exception as exc:  # noqa: BLE001
                record["error"] = str(exc)
                print(f"  ❌ {exc}")
            results.append(record)

    args.out.write_text(
        "\n".join(json.dumps(r, ensure_ascii=False) for r in results) + "\n",
        encoding="utf-8",
    )
    print(f"结果已写入 {args.out}")
    failed = sum(1 for r in results if r.get("status") != "completed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())