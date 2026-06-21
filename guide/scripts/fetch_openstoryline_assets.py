#!/usr/bin/env python3
"""按需从外部 FireRed-OpenStoryline 目录复制 BGM 音频文件到项目 uploads 目录。

该脚本幂等：已存在的文件会跳过。它只复制音频，不修改数据库。
运行方式：
    uv run python guide/scripts/fetch_openstoryline_assets.py
或指定外部 FireRed 根目录：
    OPENSTORYLINE_ROOT=/path/to/FireRed-OpenStoryline uv run python ...
"""

from __future__ import annotations

import json
import os
import shutil
import sys
from pathlib import Path


def resolve_openstoryline_root() -> Path:
    env_root = os.environ.get("OPENSTORYLINE_ROOT")
    if env_root:
        return Path(env_root).expanduser().resolve()
    # 默认回退到原用户机器上的绝对路径，兼容旧环境
    fallback = Path("/Users/wuzhu/Documents/AI 项目/FireRed-OpenStoryline")
    return fallback


def resolve_project_root() -> Path:
    script_dir = Path(__file__).resolve().parent
    return script_dir.parent


def copy_bgms(external_root: Path, project_root: Path) -> tuple[int, int, list[str]]:
    meta_path = project_root / "data/external/openstoryline/bgms/meta.json"
    if not meta_path.exists():
        return 0, 0, [f"BGM meta not found: {meta_path}"]

    uploads_dir = project_root / "data/uploads"
    uploads_dir.mkdir(parents=True, exist_ok=True)

    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    copied = 0
    skipped = 0
    errors: list[str] = []

    for entry in meta:
        catalog_path = entry.get("path", "")
        if not catalog_path:
            continue

        # meta 中路径形如 ./resource/bgms/music_0000.mp3
        normalized = catalog_path.lstrip("./").replace("resource/bgms/", "bgms/")
        src_candidates = [
            external_root / normalized,
            external_root / catalog_path.lstrip("./"),
            external_root / "bgms" / Path(normalized).name,
        ]
        src = next((p for p in src_candidates if p.exists()), src_candidates[0])

        if not src.exists():
            errors.append(f"Missing source BGM: {src}")
            continue

        safe_id = "".join(c for c in entry.get("id", "") if c.isalnum())[:16] or Path(normalized).stem
        ext = Path(normalized).suffix or ".mp3"
        dest_name = f"catalog-bgm-{safe_id}{ext}"
        dest = uploads_dir / dest_name

        if dest.exists():
            skipped += 1
            continue

        try:
            shutil.copy2(src, dest)
            copied += 1
        except Exception as exc:  # noqa: BLE001
            errors.append(f"Failed to copy {src} -> {dest}: {exc}")

    return copied, skipped, errors


def main() -> int:
    external_root = resolve_openstoryline_root()
    project_root = resolve_project_root()

    print(f"[fetch_openstoryline_assets] external_root={external_root}")
    print(f"[fetch_openstoryline_assets] project_root={project_root}")

    if not external_root.exists():
        print(f"[fetch_openstoryline_assets] WARNING: external root not found: {external_root}")
        print("[fetch_openstoryline_assets] Skipping BGM copy. Set OPENSTORYLINE_ROOT to enable.")
        return 0

    copied, skipped, errors = copy_bgms(external_root, project_root)
    print(f"[fetch_openstoryline_assets] BGM copied={copied} skipped={skipped}")
    if errors:
        print(f"[fetch_openstoryline_assets] {len(errors)} errors:")
        for err in errors[:10]:
            print(f"  - {err}")
        if len(errors) > 10:
            print(f"  ... and {len(errors) - 10} more")

    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
