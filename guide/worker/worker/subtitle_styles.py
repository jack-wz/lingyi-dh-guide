"""Canonical subtitle style registry — mirrors guide/shared/subtitleStyles.ts."""

from __future__ import annotations

import re
from typing import TypedDict


class SubtitleStyleRender(TypedDict, total=False):
    color: str
    bg: str
    size: str
    weight: int
    outline: str
    borderRadius: int
    padding: str


class SubtitleStyleDefinition(TypedDict):
    id: str
    name: str
    description: str
    aliases: list[str]
    render: SubtitleStyleRender


SUBTITLE_STYLE_DEFINITIONS: list[SubtitleStyleDefinition] = [
    {
        "id": "default",
        "name": "白字黑边",
        "description": "经典字幕样式",
        "aliases": ["classic-white-stroke"],
        "render": {
            "color": "#ffffff",
            "bg": "transparent",
            "size": "28px",
            "weight": 600,
            "outline": "#000000",
        },
    },
    {
        "id": "bottom-center",
        "name": "底部半透底",
        "description": "底部半透明黑色底栏",
        "aliases": ["semi-transparent-bar"],
        "render": {
            "color": "#ffffff",
            "bg": "rgba(0,0,0,0.55)",
            "size": "32px",
            "weight": 500,
            "borderRadius": 8,
            "padding": "8px 16px",
        },
    },
    {
        "id": "bold-yellow",
        "name": "醒目黄字",
        "description": "黄色文字+深色描边",
        "aliases": ["yellow-highlight"],
        "render": {
            "color": "#FFD700",
            "bg": "transparent",
            "size": "30px",
            "weight": 700,
            "outline": "#333333",
        },
    },
    {
        "id": "bold-white-stroke",
        "name": "描边大字",
        "description": "白色大号文字+粗描边",
        "aliases": ["stroke-large"],
        "render": {
            "color": "#ffffff",
            "bg": "transparent",
            "size": "36px",
            "weight": 800,
            "outline": "#000000",
        },
    },
    {
        "id": "subtitle-card",
        "name": "卡片式",
        "description": "圆角卡片包裹",
        "aliases": [],
        "render": {
            "color": "#ffffff",
            "bg": "rgba(51,51,51,0.8)",
            "size": "26px",
            "weight": 500,
            "borderRadius": 12,
            "padding": "8px 16px",
        },
    },
    {
        "id": "brand-elegant",
        "name": "品牌优雅",
        "description": "香槟金文字+暖棕描边",
        "aliases": [],
        "render": {
            "color": "#F5E6CC",
            "bg": "transparent",
            "size": "28px",
            "weight": 500,
            "outline": "#8B7355",
        },
    },
    {
        "id": "brand-blue",
        "name": "品牌蓝",
        "description": "蓝色调字幕",
        "aliases": [],
        "render": {
            "color": "#E0F2FE",
            "bg": "rgba(37,99,235,0.7)",
            "size": "26px",
            "weight": 500,
            "borderRadius": 8,
            "padding": "8px 16px",
        },
    },
    {
        "id": "gradient-glow",
        "name": "渐变发光",
        "description": "渐变文字+光晕效果",
        "aliases": [],
        "render": {
            "color": "#FDE68A",
            "bg": "transparent",
            "size": "28px",
            "weight": 700,
            "outline": "rgba(251,191,36,0.55)",
        },
    },
    {
        "id": "minimal",
        "name": "极简单行",
        "description": "无背景无描边",
        "aliases": [],
        "render": {
            "color": "rgba(255,255,255,0.9)",
            "bg": "transparent",
            "size": "24px",
            "weight": 400,
        },
    },
]

_ALIAS_TO_CANONICAL: dict[str, str] = {}
_DEFINITION_BY_ID: dict[str, SubtitleStyleDefinition] = {}


def _parse_px(size: str) -> int:
    match = re.search(r"(\d+(?:\.\d+)?)", str(size or ""))
    return round(float(match.group(1))) if match else 28


for _def in SUBTITLE_STYLE_DEFINITIONS:
    _DEFINITION_BY_ID[_def["id"]] = _def
    _ALIAS_TO_CANONICAL[_def["id"]] = _def["id"]
    for _alias in _def.get("aliases") or []:
        _ALIAS_TO_CANONICAL[_alias] = _def["id"]

_STYLE_RENDER_PX = {
    _def["id"]: _parse_px(_def["render"].get("size", "28px"))
    for _def in SUBTITLE_STYLE_DEFINITIONS
}

HF_ASS_FALLBACKS: dict[str, str] = {
    "hf-caption-highlight": "bold-yellow",
    "hf-caption-pill": "subtitle-card",
    "hf-caption-neon": "gradient-glow",
    "hf-caption-editorial": "brand-elegant",
    "hf-caption-gradient": "gradient-glow",
}


def normalize_subtitle_style_id(style_id: str) -> str:
    raw = str(style_id or "").strip()
    if not raw:
        return "default"
    return _ALIAS_TO_CANONICAL.get(raw, raw)


def get_subtitle_style_definition(style_id: str) -> SubtitleStyleDefinition | None:
    canonical = normalize_subtitle_style_id(style_id)
    return _DEFINITION_BY_ID.get(canonical)


def is_hyperframes_subtitle_style(style_id: str) -> bool:
    raw = str(style_id or "").strip()
    return raw in HF_ASS_FALLBACKS


def resolve_ass_subtitle_style_id(style_id: str) -> str:
    raw = str(style_id or "").strip()
    if raw in HF_ASS_FALLBACKS:
        return HF_ASS_FALLBACKS[raw]
    return normalize_subtitle_style_id(style_id)


def get_ass_subtitle_fallback_name(style_id: str) -> str | None:
    fallback_id = HF_ASS_FALLBACKS.get(str(style_id or "").strip())
    if not fallback_id:
        return None
    definition = get_subtitle_style_definition(fallback_id)
    return definition.get("name") if definition else None


def parse_subtitle_render_size_px(size: str) -> int:
    return _parse_px(size)


def get_style_render_px(style_id: str) -> int:
    canonical = normalize_subtitle_style_id(style_id)
    return _STYLE_RENDER_PX.get(canonical, 28)


def _parse_css_color(value: str) -> tuple[int, int, int, int]:
    """Parse #hex or rgba() into RGBA 0-255."""
    raw = str(value or "").strip()
    if not raw or raw.lower() == "transparent":
        return (0, 0, 0, 0)

    if raw.startswith("#"):
        hexv = raw[1:]
        if len(hexv) == 3:
            hexv = "".join(ch * 2 for ch in hexv)
        if len(hexv) == 6:
            return (int(hexv[0:2], 16), int(hexv[2:4], 16), int(hexv[4:6], 16), 255)

    rgba_match = re.match(
        r"rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)",
        raw,
        re.I,
    )
    if rgba_match:
        r, g, b = (int(rgba_match.group(i)) for i in range(1, 4))
        alpha = float(rgba_match.group(4) if rgba_match.group(4) is not None else 1.0)
        return (r, g, b, max(0, min(255, round(alpha * 255))))

    return (255, 255, 255, 255)


def rgba_to_ass_color(value: str, *, default_alpha: int = 0) -> str:
    """Convert CSS color to ASS &HAABBGGRR (alpha 00=opaque in PrimaryColour)."""
    r, g, b, a = _parse_css_color(value)
    if a == 0 and default_alpha:
        a = default_alpha
    # ASS uses inverted alpha for PrimaryColour: 00 = opaque
    ass_alpha = 255 - a if a else 0
    return f"&H{ass_alpha:02X}{b:02X}{g:02X}{r:02X}"


def build_ass_style_line(
    name: str,
    font: str,
    font_size: int,
    style_id: str,
    *,
    primary_override: str | None = None,
    secondary_override: str | None = None,
    alignment: int = 2,
    margin_v: int = 120,
) -> str:
    """Build one ASS Style: line from registry definition."""
    definition = get_subtitle_style_definition(style_id)
    render = (definition or {}).get("render") or {}
    primary = rgba_to_ass_color(primary_override or render.get("color", "#ffffff"))
    secondary = rgba_to_ass_color(secondary_override or render.get("color", "#ffffff"), default_alpha=180)
    outline_color = rgba_to_ass_color(render.get("outline", "#000000"))
    bg = render.get("bg", "transparent")
    has_box = bg and str(bg).lower() != "transparent"
    back_colour = rgba_to_ass_color(bg, default_alpha=140) if has_box else "&H80000000"
    border_style = 3 if has_box else 1
    weight = int(render.get("weight") or 600)
    bold = -1 if weight >= 700 else 0
    outline_w = 4 if weight >= 800 else (3 if render.get("outline") else 2)
    shadow = 2 if has_box else 1
    align = max(1, min(9, int(alignment)))
    margin = max(0, int(margin_v))
    return (
        f"Style: {name},{font},{font_size},{primary},{secondary},{outline_color},{back_colour},"
        f"{bold},0,0,0,100,100,0,0,{border_style},{outline_w},{shadow},{align},10,10,{margin},1"
    )