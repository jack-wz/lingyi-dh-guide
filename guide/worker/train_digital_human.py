#!/usr/bin/env python3
"""Train digital human: MOSI Studio voice clone + KIE multi-angle persona."""

from __future__ import annotations

import argparse
import os
import sys

import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from worker.ai_clients.yuntts_client import YunTTSClient
from worker.config import SERVER_URL, UPLOADS_DIR
from worker.persona_builder import build_persona_assets
from worker.utils import ensure_dir


def _resolve_local_upload(url: str) -> str:
    if not url:
        return ""
    if url.startswith("/uploads/"):
        return os.path.join(UPLOADS_DIR, url.replace("/uploads/", "", 1))
    return url


def _api(method: str, path: str, **kwargs):
    base = os.getenv("SERVER_URL", SERVER_URL).rstrip("/")
    res = requests.request(method, f"{base}{path}", timeout=120, **kwargs)
    res.raise_for_status()
    return res.json()


def train(digital_human_id: str) -> int:
    dh = _api("GET", f"/api/digital-humans/{digital_human_id}")
    name = dh.get("name") or digital_human_id
    print(f"[Train] Start cenker training for {name} ({digital_human_id})")

    voice_path = _resolve_local_upload(dh.get("voice_sample_url", ""))
    if not voice_path or not os.path.exists(voice_path):
        _fail(digital_human_id, f"声音样本不存在: {voice_path}")
        return 1

    for field in ("face_photo_url", "half_body_photo_url", "full_body_photo_url"):
        if not dh.get(field):
            _fail(digital_human_id, f"缺少素材字段: {field}")
            return 1

    try:
        print("[Train] MOSI Studio / 云声配音 — 克隆音色...")
        tts = YunTTSClient()
        voice_id = tts.clone_voice(voice_path, name=f"dh_{digital_human_id[:8]}")
        if not voice_id:
            raise RuntimeError("音色克隆失败，请检查 YunTTS API Key 与样本时长(5-30s)")

        print("[Train] KIE gpt-image-2 — 多角度形象构建...")
        manifest = build_persona_assets(
            digital_human_id=digital_human_id,
            face_photo_url=dh["face_photo_url"],
            half_body_photo_url=dh["half_body_photo_url"],
            full_body_photo_url=dh["full_body_photo_url"],
            server_base_url=os.getenv("SERVER_URL", SERVER_URL),
            on_progress=lambda msg: print(f"[Train] {msg}"),
        )

        image_model_id = f"cenker-persona:{digital_human_id}"
        _api(
            "POST",
            f"/api/digital-humans/{digital_human_id}/training-status",
            json={
                "status": "ready",
                "voice_clone_id": voice_id,
                "image_model_id": image_model_id,
                "provider_job_id": f"cenker:{digital_human_id}",
            },
        )
        print(f"[Train] Done voice_id={voice_id} persona={manifest.get('angles', {})}")
        return 0
    except Exception as exc:
        _fail(digital_human_id, str(exc))
        return 1


def _fail(digital_human_id: str, message: str) -> None:
    print(f"[Train] FAILED: {message}")
    try:
        _api(
            "POST",
            f"/api/digital-humans/{digital_human_id}/training-status",
            json={
                "status": "failed",
                "error_message": message,
                "provider_job_id": f"cenker:{digital_human_id}",
            },
        )
    except Exception as exc:
        print(f"[Train] Could not report failure: {exc}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--id", required=True, help="Digital human id")
    args = parser.parse_args()
    ensure_dir(UPLOADS_DIR)
    return train(args.id)


if __name__ == "__main__":
    raise SystemExit(main())