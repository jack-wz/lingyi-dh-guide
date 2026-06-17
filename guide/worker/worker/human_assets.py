"""Resolve digital-human reference photos to local segment asset paths."""

from __future__ import annotations

import os

from worker.config import UPLOADS_DIR, RENDERS_DIR
from worker.utils import download_file


def _resolve_local(url: str) -> str:
    if not url:
        return ""
    if os.path.isabs(url) and os.path.exists(url):
        return url
    if url.startswith("/uploads/"):
        local = os.path.join(UPLOADS_DIR, url[len("/uploads/"):])
        if os.path.exists(local):
            return local
    if url.startswith("/renders/"):
        local = os.path.join(RENDERS_DIR, url[len("/renders/"):])
        if os.path.exists(local):
            return local
    return ""


def _is_stage2_generated_scene(scene_path: str, work_dir: str) -> bool:
    """True when Stage2 saved a KIE-fused or generated scene under work_dir."""
    if not scene_path or not work_dir:
        return False
    try:
        rel = os.path.relpath(scene_path, work_dir)
    except ValueError:
        return False
    return not rel.startswith("..") and os.path.basename(rel).startswith("scene_")


def _download_asset(url: str, work_dir: str, basename: str, server_base_url: str) -> str:
    if not url:
        return ""

    local = _resolve_local(url)
    if local:
        return local

    if url.startswith(("http://", "https://")):
        target = os.path.join(work_dir, basename)
        try:
            download_file(url, target)
            return target if os.path.exists(target) else ""
        except Exception as exc:
            print(f"[HumanAssets] Download failed for {url}: {exc}")
            return ""

    if server_base_url and url.startswith("/"):
        full = f"{server_base_url.rstrip('/')}{url}"
        target = os.path.join(work_dir, basename)
        try:
            download_file(full, target)
            return target if os.path.exists(target) else ""
        except Exception as exc:
            print(f"[HumanAssets] Download from server failed for {full}: {exc}")
            return ""

    return ""


def resolve_human_assets_on_segments(
    segments: list[dict],
    human_photos: dict,
    work_dir: str,
    server_base_url: str,
) -> None:
    """Attach local face/scene paths for talking-head generation."""
    if not human_photos:
        return

    face_url = human_photos.get("face_photo_url") or ""
    half_url = (
        human_photos.get("half_body_photo_url")
        or human_photos.get("half_body_cutout_url")
        or ""
    )
    full_url = human_photos.get("full_body_photo_url") or ""

    face_local = _download_asset(face_url, work_dir, "human_face.png", server_base_url)
    half_local = _download_asset(
        half_url or face_url,
        work_dir,
        "human_half.png",
        server_base_url,
    )
    full_local = _download_asset(full_url, work_dir, "human_full.png", server_base_url)

    for i, seg in enumerate(segments):
        dh = seg.get("digital_human") or {}
        if not dh.get("enabled"):
            continue

        if face_local:
            seg["human_face_path"] = face_local
        elif half_local:
            seg["human_face_path"] = half_local
        if half_local and dh.get("enabled"):
            existing_scene = seg.get("scene_image_path") or ""
            if not _is_stage2_generated_scene(existing_scene, work_dir):
                seg["scene_image_path"] = half_local
                if half_url:
                    seg["scene_image_url"] = half_url
        elif half_local and not seg.get("scene_image_path"):
            seg["scene_image_path"] = half_local
            if half_url:
                seg["scene_image_url"] = half_url
        elif face_local and not seg.get("scene_image_path"):
            seg["scene_image_path"] = face_local
            if face_url:
                seg["scene_image_url"] = face_url
        elif full_local and not seg.get("scene_image_path"):
            seg["scene_image_path"] = full_local
            if full_url:
                seg["scene_image_url"] = full_url

        print(
            f"[HumanAssets] Segment {i + 1}: face={seg.get('human_face_path', '')}, "
            f"scene={seg.get('scene_image_path', '')}"
        )