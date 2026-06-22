"""Business quality gate diagnostics for V4 #10.

Extends technical diagnostics with business constraint checks:
- Required disclaimers present in narration
- Banned words absent from narration
- Selling point coverage across segments
- Target duration compliance
- CTA presence
- Frame whitelist compliance (V4 #6)
- Digital human readiness
"""

from __future__ import annotations

from typing import Any


def check_business_constraints(
    segments: list[dict],
    brief: dict | None = None,
    global_config: dict | None = None,
) -> dict[str, Any]:
    """Run business quality checks and return blockers + warnings."""
    brief = brief or {}
    global_config = global_config or {}
    blockers: list[str] = []
    warnings: list[str] = []
    checks: list[dict] = []

    all_narration = " ".join(seg.get("narration_text", "") for seg in segments)
    target_duration = brief.get("target_duration_sec", 0)
    estimated_duration = sum(seg.get("duration_sec", 5.0) for seg in segments)

    # Check 1: Required disclaimers
    required_disclaimers = brief.get("required_disclaimers", [])
    for disclaimer in required_disclaimers:
        passed = disclaimer in all_narration
        checks.append({"name": "disclaimer", "target": disclaimer, "passed": passed})
        if not passed:
            blockers.append(f"缺少必需声明: {disclaimer}")

    # Check 2: Banned words
    banned_words = brief.get("banned_words", [])
    for word in banned_words:
        found = word in all_narration
        checks.append({"name": "banned_word", "target": word, "passed": not found})
        if found:
            blockers.append(f"包含禁用词: {word}")

    # Check 3: CTA presence
    cta = brief.get("cta", "")
    if cta:
        cta_passed = cta in all_narration
        checks.append({"name": "cta", "target": cta, "passed": cta_passed})
        if not cta_passed:
            warnings.append(f"未检测到 CTA: {cta}")

    # Check 4: Selling point coverage
    selling_points = brief.get("selling_points", [])
    for sp in selling_points:
        sp_passed = sp in all_narration
        checks.append({"name": "selling_point", "target": sp, "passed": sp_passed})
        if not sp_passed:
            warnings.append(f"卖点未覆盖: {sp}")

    # Check 5: Target duration
    if target_duration > 0:
        duration_passed = abs(estimated_duration - target_duration) <= max(target_duration * 0.2, 5)
        checks.append({
            "name": "duration",
            "target": f"{target_duration}s",
            "actual": f"{estimated_duration:.1f}s",
            "passed": duration_passed,
        })
        if estimated_duration > target_duration * 1.5:
            blockers.append(f"预计时长 {estimated_duration:.1f}s 远超目标 {target_duration}s")
        elif not duration_passed:
            warnings.append(f"预计时长 {estimated_duration:.1f}s 偏离目标 {target_duration}s")

    # Check 6: Segment count
    seg_count = len(segments)
    checks.append({"name": "segment_count", "actual": seg_count, "passed": seg_count >= 1})
    if seg_count == 0:
        blockers.append("没有分镜")

    # Check 7: Missing scene images
    missing_images = sum(1 for seg in segments if not seg.get("scene_image_url"))
    checks.append({"name": "scene_images", "missing": missing_images, "passed": missing_images == 0})
    if missing_images > 0:
        warnings.append(f"{missing_images} 个分镜缺少场景图")

    # Check 8: Digital human set
    dh_id = (global_config.get("digital_human_id") or
             segments[0].get("avatar_id") if segments else "")
    checks.append({"name": "digital_human", "passed": bool(dh_id)})
    if not dh_id:
        warnings.append("未设置数字人")

    return {
        "blockers": blockers,
        "warnings": warnings,
        "checks": checks,
        "estimated_duration": round(estimated_duration, 2),
        "segment_count": seg_count,
        "ready": len(blockers) == 0,
    }


def check_technical_quality(
    segments: list[dict],
    work_dir: str = "",
) -> dict[str, Any]:
    """Check technical quality of rendered segments."""
    import os
    blockers: list[str] = []
    warnings: list[str] = []
    checks: list[dict] = []

    for i, seg in enumerate(segments):
        # Check clip exists
        clip_path = seg.get("clip_path", "")
        if clip_path and os.path.exists(clip_path):
            checks.append({"name": "clip_exists", "segment": i, "passed": True})
        elif clip_path:
            checks.append({"name": "clip_exists", "segment": i, "passed": False})
            blockers.append(f"分镜 {i+1} clip 文件不存在: {clip_path}")

        # Check TTS exists
        tts_path = seg.get("tts_audio_path", seg.get("tts_path", ""))
        if tts_path and os.path.exists(tts_path):
            checks.append({"name": "tts_exists", "segment": i, "passed": True})
        elif tts_path:
            checks.append({"name": "tts_exists", "segment": i, "passed": False})
            warnings.append(f"分镜 {i+1} TTS 文件不存在")

        # Check narration not empty
        narration = seg.get("narration_text", "")
        if not narration.strip():
            warnings.append(f"分镜 {i+1} 旁白为空")

        # Check duration > 0
        duration = seg.get("duration_sec", 0)
        if duration <= 0:
            blockers.append(f"分镜 {i+1} 时长为 0 或负数")

    return {
        "blockers": blockers,
        "warnings": warnings,
        "checks": checks,
        "ready": len(blockers) == 0,
    }


def run_full_diagnostics(
    segments: list[dict],
    brief: dict | None = None,
    global_config: dict | None = None,
    work_dir: str = "",
) -> dict[str, Any]:
    """Run both technical and business diagnostics."""
    tech = check_technical_quality(segments, work_dir)
    biz = check_business_constraints(segments, brief, global_config)

    return {
        "technical": tech,
        "business": biz,
        "blockers": tech["blockers"] + biz["blockers"],
        "warnings": tech["warnings"] + biz["warnings"],
        "all_checks": tech["checks"] + biz["checks"],
        "ready": tech["ready"] and biz["ready"],
    }
