#!/usr/bin/env python3
"""从 08_剪辑工程 导入剪映风格模板（字幕花字 + 贴纸 + Logo + BGM）。"""

from __future__ import annotations

import json
import os
import sys
import time
from copy import deepcopy
from pathlib import Path

import requests

API = os.getenv("SERVER_URL", "http://127.0.0.1:8000").rstrip("/")
GUIDE_DIRECT = os.getenv("GUIDE_INTERNAL_URL", "http://127.0.0.1:3001").rstrip("/")
PLATFORM = Path("/Users/wuzhu/Documents/AI 产品/数字人/零一数字人导购平台")
TEMPLATE_PATH = Path(__file__).resolve().parents[1] / "data/templates/feifei_jianying_v1.template.json"


def upload_file(path: Path) -> str:
    last_err: Exception | None = None
    for base in (API, GUIDE_DIRECT):
        for attempt in range(3):
            try:
                with path.open("rb") as handle:
                    res = requests.post(
                        f"{base}/api/uploads",
                        files={"file": (path.name, handle, "application/octet-stream")},
                        timeout=180,
                    )
                res.raise_for_status()
                return res.json()["url"]
            except Exception as exc:
                last_err = exc
                time.sleep(1 + attempt)
    raise RuntimeError(f"upload failed: {path} -> {last_err}")


def resolve_template(raw: dict) -> dict:
    sources = raw.pop("asset_sources", {})
    clip_root = PLATFORM / sources.get("clip_root", "")
    scene_root = PLATFORM / sources.get("scene_root", "")
    files = sources.get("files", {})

    uploaded: dict[str, str] = {}
    for key, rel in files.items():
        if key.startswith("scene_"):
            path = scene_root / rel
        else:
            path = clip_root / rel
        if not path.exists():
            raise FileNotFoundError(path)
        uploaded[key] = upload_file(path)

    dsl = deepcopy(raw)
    dsl["globalConfig"]["bgm_url"] = uploaded.get("bgm", "")
    dsl["globalConfig"]["brand_logo_url"] = uploaded.get("logo", "")
    dsl["meta"]["coverUrl"] = uploaded.get("scene_1", "")

    scene_keys = ["scene_1", "scene_2", "scene_3", "scene_4"]
    for i, seg in enumerate(dsl.get("segments", [])):
        if i < len(scene_keys):
            seg["scene_image_url"] = uploaded[scene_keys[i]]
        for ov in seg.get("overlays", []):
            asset_key = ov.pop("asset_key", "")
            if asset_key:
                ov["asset_url"] = uploaded[asset_key]
        seg.setdefault("layout", "avatar-center")
        seg.setdefault("overlays", seg.get("overlays") or [])
        seg.setdefault("objects", seg.get("objects") or [])

    return dsl, uploaded


def main() -> int:
    raw = json.loads(TEMPLATE_PATH.read_text(encoding="utf-8"))
    dsl, uploaded = resolve_template(raw)

    meta = dsl["meta"]
    res = requests.post(
        f"{API}/api/templates",
        json={
            "name": meta["name"],
            "type": meta.get("type", "母婴奶粉"),
            "description": meta.get("description", ""),
        },
        timeout=60,
    )
    res.raise_for_status()
    template_id = res.json()["id"]
    dsl["meta"]["id"] = template_id

    put = requests.put(
        f"{API}/api/templates/{template_id}",
        json={"dsl_json": dsl},
        timeout=60,
    )
    put.raise_for_status()

    saved = requests.get(f"{API}/api/templates/{template_id}", timeout=30).json()
    seg_count = len((saved.get("dsl_json") or {}).get("segments") or [])
    out = {
        "template_id": template_id,
        "name": meta["name"],
        "segments": seg_count,
        "uploaded": uploaded,
        "template_url": f"{API}/api/templates/{template_id}",
    }
    out_path = Path(__file__).resolve().parents[1] / "data/feifei_jianying_template.json"
    out_path.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(out, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())