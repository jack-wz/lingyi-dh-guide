"""Materialize brand-pack fonts for libass (FFmpeg) and PIL overlay rendering."""

from __future__ import annotations

import json
import os
import shutil
from typing import Any

from worker.ass_generator import _resolve_ass_font


def _resolve_uploads_path(url: str) -> str:
    if not url:
        return ""
    if url.startswith("/uploads/"):
        from worker.config import UPLOADS_DIR

        local = os.path.join(UPLOADS_DIR, url[len("/uploads/") :])
        return local if os.path.exists(local) else ""
    if os.path.isabs(url) and os.path.exists(url):
        return url
    return ""


def _iter_brand_font_entries(global_config: dict) -> list[dict[str, Any]]:
    brand_pack = global_config.get("brand_pack") or {}
    tokens = brand_pack.get("tokens") or {}
    typography = tokens.get("typography") or {}
    fonts = typography.get("fonts") or []
    return [f for f in fonts if isinstance(f, dict)]


def prepare_brand_fonts(global_config: dict, work_dir: str) -> dict[str, Any]:
    """Copy brand font files into work_dir/fonts and write manifest.json."""
    fonts_dir = os.path.join(work_dir, "fonts")
    os.makedirs(fonts_dir, exist_ok=True)

    family_paths: dict[str, str] = {}
    entries = _iter_brand_font_entries(global_config)
    default_family = _resolve_ass_font(global_config)

    for entry in entries:
        family = str(entry.get("family") or "").strip()
        if not family:
            continue
        src = _resolve_uploads_path(str(entry.get("url") or ""))
        if not src:
            continue
        ext = os.path.splitext(src)[1] or ".ttf"
        safe = "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in family)
        dest = os.path.join(fonts_dir, f"{safe}{ext}")
        if not os.path.exists(dest):
            shutil.copy2(src, dest)
        family_paths[family] = dest

    if default_family and default_family not in family_paths:
        for entry in entries:
            if str(entry.get("family") or "").strip() == default_family:
                src = _resolve_uploads_path(str(entry.get("url") or ""))
                if src:
                    ext = os.path.splitext(src)[1] or ".ttf"
                    safe = "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in default_family)
                    dest = os.path.join(fonts_dir, f"{safe}{ext}")
                    if not os.path.exists(dest):
                        shutil.copy2(src, dest)
                    family_paths[default_family] = dest
                break

    manifest = {
        "default_family": default_family,
        "family_paths": family_paths,
        "fonts_dir": fonts_dir,
    }
    with open(os.path.join(fonts_dir, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    if family_paths:
        print(f"[BrandFonts] Prepared {len(family_paths)} font(s) in {fonts_dir}")
    else:
        print("[BrandFonts] No brand font files found — using system fallbacks")

    return manifest


def load_font_manifest(work_dir: str) -> dict[str, Any]:
    path = os.path.join(work_dir, "fonts", "manifest.json")
    if not os.path.exists(path):
        return {"default_family": "PingFang SC", "family_paths": {}, "fonts_dir": os.path.join(work_dir, "fonts")}
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def resolve_brand_font_path(work_dir: str, family: str | None = None) -> str:
    manifest = load_font_manifest(work_dir)
    family_paths = manifest.get("family_paths") or {}
    if family and family in family_paths:
        return str(family_paths[family])
    default = manifest.get("default_family") or ""
    if default and default in family_paths:
        return str(family_paths[default])
    return ""