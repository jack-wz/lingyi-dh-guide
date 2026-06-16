#!/usr/bin/env python3
"""Verify KIE + MOSI Studio(云声) + WaveSpeed API keys."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "worker"))

from worker.config import get_kie_config, get_wavespeed_config, get_yuntts_config  # noqa: E402


def mask(key: str) -> str:
    key = key.strip()
    return f"{key[:4]}...{key[-4:]}" if len(key) > 8 else "***"


def verify_kie() -> dict:
    key, base = get_kie_config()
    url = f"{base.rstrip('/')}/api/v1/chat/credit"
    res = requests.get(url, headers={"Authorization": f"Bearer {key}"}, timeout=30)
    body = res.json() if res.headers.get("content-type", "").startswith("application/json") else {}
    ok = res.status_code == 200 and body.get("code") == 200
    return {"ok": ok, "key": mask(key), "credits": body.get("data"), "message": body.get("msg", res.reason)}


def _probe_yuntts(key: str, base: str) -> tuple[bool, bool, object]:
    """Return (auth_ok, synth_ok, message). auth_ok=True means key is recognized."""
    base = base.rstrip("/")
    headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}

    edge = requests.post(
        f"{base}/edge_tts",
        headers=headers,
        json={"text": "测试", "voice": "zh-CN-XiaoxiaoNeural"},
        timeout=60,
    )
    if edge.status_code == 200 and "audio" in edge.headers.get("content-type", ""):
        return True, True, "edge_tts ok"

    try:
        edge_body = edge.json()
    except Exception:
        edge_body = edge.text[:200]

    if edge.status_code == 401 or (isinstance(edge_body, dict) and edge_body.get("code") == "rest_invalid_api_key"):
        return False, False, edge_body

    # Key recognized but edge_tts not in plan — probe IndexTTS2 (pipeline uses this)
    idx = requests.post(
        f"{base}/indextts2_generate",
        headers=headers,
        json={"text": "测试", "voice": "zh-CN-XiaoxiaoNeural"},
        timeout=60,
    )
    if idx.status_code == 200 and "audio" in idx.headers.get("content-type", ""):
        return True, True, "indextts2_generate ok"
    try:
        idx_body = idx.json()
    except Exception:
        idx_body = idx.text[:200]

    if idx.status_code == 401 or (isinstance(idx_body, dict) and idx_body.get("code") == "rest_invalid_api_key"):
        return False, False, idx_body

    if edge.status_code == 403 or (isinstance(edge_body, dict) and edge_body.get("error") == "insufficient_privileges"):
        return True, False, {
            "auth": "key_valid",
            "edge_tts": edge_body,
            "indextts2": idx_body,
            "hint": "Key 有效；edge_tts 需会员。音色克隆/IndexTTS2 请确认账户额度与服务状态。",
        }

    # Key passed auth but upstream model error
    if idx.status_code in {500, 502, 503}:
        return True, False, {"auth": "key_valid", "indextts2": idx_body, "hint": "Key 有效，IndexTTS2 服务端暂时异常，可稍后重试"}

    return True, False, {"edge_tts": edge_body, "indextts2": idx_body}


def verify_yuntts() -> dict:
    _, base, _ = get_yuntts_config()
    candidates = []
    primary = os.getenv("YUNTTS_API_KEY", "").strip()
    backup = os.getenv("YUNTTS_API_KEY_BACKUP", "").strip()
    if primary:
        candidates.append(("primary", primary))
    if backup and backup != primary:
        candidates.append(("backup", backup))
    if not candidates:
        key, _, _ = get_yuntts_config()
        candidates.append(("config", key))

    last_msg: object = "no key"
    for label, key in candidates:
        auth_ok, synth_ok, msg = _probe_yuntts(key, base)
        if auth_ok and synth_ok:
            return {"ok": True, "key": mask(key), "source": label, "message": msg}
        if auth_ok:
            return {
                "ok": True,
                "key": mask(key),
                "source": label,
                "synth_ok": False,
                "message": msg,
                "hint": "Key 已识别；若合成失败请检查云声账户会员/额度",
            }
        last_msg = msg
    key = candidates[0][1]
    return {"ok": False, "key": mask(key), "message": last_msg, "hint": "请在 yuntts.com 用户中心重新生成 API Key"}


def verify_wavespeed() -> dict:
    key, base = get_wavespeed_config()
    url = f"{base.rstrip('/')}/api/v3/balance"
    res = requests.get(url, headers={"Authorization": f"Bearer {key}"}, timeout=30)
    body = res.json() if res.headers.get("content-type", "").startswith("application/json") else {}
    ok = res.status_code == 200
    balance = (body.get("data") or {}).get("balance") if isinstance(body.get("data"), dict) else body.get("data")
    return {"ok": ok, "key": mask(key), "balance": balance, "message": body.get("message", res.reason)}


def main() -> int:
    os.chdir(ROOT)
    results = {
        "kie": verify_kie(),
        "yuntts_mosi": verify_yuntts(),
        "wavespeed": verify_wavespeed(),
    }
    all_ok = all(v["ok"] for v in results.values())
    print(json.dumps({"ok": all_ok, "providers": results}, ensure_ascii=False, indent=2))
    return 0 if all_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())