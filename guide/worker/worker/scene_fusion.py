"""KIE scene + digital-human image fusion helpers (URL order + prompt roles)."""

from __future__ import annotations

from worker.config import get_scene_fusion_input_order


def build_scene_fusion_input_urls(scene_url: str, digital_human_url: str) -> list[str]:
    """Build KIE gpt-image-2 input_urls; order must match prompt 图1/图2 labels."""
    scene = (scene_url or "").strip()
    dh = (digital_human_url or "").strip()
    if not scene:
        return []
    order = get_scene_fusion_input_order()
    if order == "human_first":
        urls: list[str] = []
        if dh:
            urls.append(dh)
        urls.append(scene)
        return urls
    urls = [scene]
    if dh:
        urls.append(dh)
    return urls


def scene_fusion_role_prefix(order: str | None = None) -> str:
    """Prompt prefix aligned with input_urls indices (图1=input_urls[0], 图2=input_urls[1])."""
    resolved = (order or get_scene_fusion_input_order()).strip().lower()
    if resolved == "human_first":
        return (
            "【input_urls[0]·图1·数字人资源库形象】输出人物的身份来源；五官、发型、服装必须与图1保持完全一致。"
            "【input_urls[1]·图2·编辑器资产库分镜场景】画面构图、镜头视角、景别、背景环境与人物姿势的参考来源。"
            "生成要求：以图2的场景与姿势为框架，将图1数字人自然置入并替换画面中的人物，不得保留图2原人物的面部特征。"
        )
    return (
        "【input_urls[0]·图1·编辑器资产库分镜场景】画面构图、镜头视角、景别、背景环境与人物姿势的参考来源；"
        "图1中原始人物仅提供姿势与场景，其面部身份必须被替换。"
        "【input_urls[1]·图2·数字人资源库形象】输出人物的身份来源；五官、发型、服装必须与图2保持完全一致。"
        "生成要求：在图1的场景与姿势框架内，用图2数字人替换画面人物，不得保留图1原人物的面部特征。"
    )


def describe_fusion_urls(scene_url: str, digital_human_url: str) -> str:
    """Human-readable log line for Stage2 KieFusion."""
    urls = build_scene_fusion_input_urls(scene_url, digital_human_url)
    order = get_scene_fusion_input_order()
    parts: list[str] = []
    for idx, url in enumerate(urls):
        label = "场景" if (
            (order == "scene_first" and idx == 0)
            or (order == "human_first" and idx == 1)
        ) else "数字人"
        parts.append(f"input_urls[{idx}]·{label}={url[:72]}…")
    return " ".join(parts)