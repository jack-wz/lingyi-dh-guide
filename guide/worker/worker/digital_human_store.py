"""Persist digital-human fields back to the guide API from the worker."""

from __future__ import annotations

import os

import requests

from worker.config import SERVER_URL


def persist_voice_clone_id(
    digital_human_id: str,
    voice_clone_id: str,
    server_base_url: str = "",
) -> bool:
    """Write voice_clone_id to the digital human record (best-effort)."""
    dh_id = (digital_human_id or "").strip()
    voice_id = (voice_clone_id or "").strip()
    if not dh_id or not voice_id:
        return False

    base = (server_base_url or os.getenv("SERVER_URL", SERVER_URL)).rstrip("/")
    try:
        res = requests.put(
            f"{base}/api/digital-humans/{dh_id}",
            json={"voice_clone_id": voice_id},
            timeout=30,
        )
        if res.status_code == 200:
            print(f"[DigitalHuman] Persisted voice_clone_id={voice_id} for {dh_id}")
            return True
        print(
            f"[DigitalHuman] Persist voice_clone_id failed HTTP {res.status_code}: "
            f"{res.text[:200]}"
        )
    except Exception as exc:
        print(f"[DigitalHuman] Persist voice_clone_id error: {exc}")
    return False