"""Paths for guide-platform static asset directories."""

from __future__ import annotations

from pathlib import Path

GUIDE_DATA = Path(__file__).resolve().parents[2] / "guide" / "data"
UPLOADS_DIR = GUIDE_DATA / "uploads"
RENDERS_DIR = GUIDE_DATA / "renders"
BRAND_FONTS_DIR = GUIDE_DATA / "brand-system" / "fonts"

UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
RENDERS_DIR.mkdir(parents=True, exist_ok=True)
BRAND_FONTS_DIR.mkdir(parents=True, exist_ok=True)