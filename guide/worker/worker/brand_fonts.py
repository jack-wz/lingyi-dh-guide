"""Materialize brand-pack fonts for libass (FFmpeg) and PIL overlay rendering."""

from __future__ import annotations

import json
import os
import shutil
from typing import Any

from worker.ass_generator import _parse_font_family_name, _resolve_ass_font, _resolve_subtitle_font_family
from worker.config import DATA_DIR


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


def _brand_system_fonts_root() -> str:
    return os.path.join(DATA_DIR, "brand-system", "fonts")


def _find_brand_system_font_file(family: str) -> str:
    if not family:
        return ""
    family_dir = os.path.join(_brand_system_fonts_root(), family)
    if not os.path.isdir(family_dir):
        return ""
    for name in sorted(os.listdir(family_dir)):
        if name.lower().endswith((".ttf", ".otf", ".woff", ".woff2")):
            return os.path.join(family_dir, name)
    return ""


def _read_font_internal_name(font_path: str) -> str:
    """Read the internal family name that libass/fontconfig will match.

    Prefer fontconfig's fc-query (matches FFmpeg/libass exactly); fall back to
    PIL's ImageFont.getname() when fontconfig is unavailable. Some brand fonts
    store CJK names that PIL decodes poorly, so fc-query is authoritative.
    """
    try:
        import shutil
        import subprocess

        if shutil.which("fc-query"):
            out = subprocess.check_output(
                ["fc-query", "-f", "%{family}\\n", font_path],
                timeout=10,
                stderr=subprocess.DEVNULL,
            )
            families = out.decode("utf-8", errors="replace").strip().split(",")
            for fam in families:
                fam = fam.strip()
                if fam:
                    return fam
    except Exception:
        pass

    try:
        from PIL import ImageFont

        font = ImageFont.truetype(font_path, 24)
        name = font.getname()
        return str(name[0]) if name else ""
    except Exception:
        return ""


# Cache: DSL family → internal font name, populated lazily by prepare_brand_fonts
_FONT_NAME_MAP: dict[str, str] = {}


def get_ass_font_name(family: str) -> str:
    """Return the libass-compatible internal font name for a DSL family name.

    libass matches fonts by their internal Name-table family, NOT the filename
    or directory name. When a brand font's directory name (used in DSL) differs
    from the internal name, this mapping ensures the ASS Style line uses the
    name libass can actually resolve.
    """
    return _FONT_NAME_MAP.get(family, family)


def _copy_font_to_workdir(family: str, src: str, fonts_dir: str) -> str:
    ext = os.path.splitext(src)[1] or ".ttf"
    safe = "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in family)
    dest = os.path.join(fonts_dir, f"{safe}{ext}")
    if not os.path.exists(dest):
        shutil.copy2(src, dest)
    # Record internal name mapping so ASS generator can use it
    internal = _read_font_internal_name(dest)
    if internal:
        _FONT_NAME_MAP[family] = internal
    return dest


def _collect_subtitle_font_families(global_config: dict, segments: list[dict] | None) -> set[str]:
    families: set[str] = set()
    default_family = _resolve_ass_font(global_config)
    if default_family:
        families.add(default_family)
    subtitle_global = _parse_font_family_name(str(global_config.get("subtitle_font_family") or ""))
    if subtitle_global:
        families.add(subtitle_global)
    for seg in segments or []:
        fam = _resolve_subtitle_font_family(seg.get("subtitle") or {}, global_config)
        if fam:
            families.add(fam)
    return families


def prepare_brand_fonts(
    global_config: dict,
    work_dir: str,
    segments: list[dict] | None = None,
) -> dict[str, Any]:
    """Copy brand-pack font files into work_dir/fonts and write fonts_manifest.json."""
    fonts_dir = os.path.join(work_dir, "fonts")
    os.makedirs(fonts_dir, exist_ok=True)

    # Remove stale non-font files that FFmpeg/libass would try to load as fonts.
    font_exts = {".ttf", ".otf", ".woff", ".woff2"}
    for name in os.listdir(fonts_dir):
        path = os.path.join(fonts_dir, name)
        if os.path.isfile(path) and os.path.splitext(name)[1].lower() not in font_exts:
            try:
                os.remove(path)
            except OSError:
                pass

    family_paths: dict[str, str] = {}
    entries = _iter_brand_font_entries(global_config)
    default_family = _resolve_ass_font(global_config)
    needed_families = _collect_subtitle_font_families(global_config, segments)

    entry_by_family = {
        str(entry.get("family") or "").strip(): entry
        for entry in entries
        if str(entry.get("family") or "").strip()
    }

    for family in needed_families:
        if family in family_paths:
            continue
        entry = entry_by_family.get(family)
        if entry:
            src = _resolve_uploads_path(str(entry.get("url") or ""))
            if src:
                family_paths[family] = _copy_font_to_workdir(family, src, fonts_dir)
                continue
        catalog_src = _find_brand_system_font_file(family)
        if catalog_src:
            family_paths[family] = _copy_font_to_workdir(family, catalog_src, fonts_dir)

    manifest = {
        "default_family": default_family,
        "family_paths": family_paths,
        "fonts_dir": fonts_dir,
    }
    # Keep the manifest outside the fonts directory: FFmpeg/libass scans the
    # fontsdir and tries to load every file as a font, so a JSON file in that
    # folder causes "Error opening memory font" and can abort the filter.
    manifest_path = os.path.join(work_dir, "fonts_manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    if family_paths:
        print(f"[BrandFonts] Prepared {len(family_paths)} font(s) in {fonts_dir}")
    else:
        print("[BrandFonts] No brand font files found — using system fallbacks")

    return manifest


def load_font_manifest(work_dir: str) -> dict[str, Any]:
    path = os.path.join(work_dir, "fonts_manifest.json")
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