"""Stage 2: AI scene image generation - calls KIE API for each segment."""

import json
import os
from worker.ai_clients.kie_client import KieClient
from worker.utils import download_file, ensure_dir
from worker.config import UPLOADS_DIR


def _load_persona_angle(image_model_id: str, angle: str) -> str:
    if not image_model_id or not image_model_id.startswith("cenker-persona:"):
        return ""
    dh_id = image_model_id.split(":", 1)[1]
    manifest_path = os.path.join(UPLOADS_DIR, "personas", dh_id, "manifest.json")
    if not os.path.exists(manifest_path):
        return ""
    try:
        with open(manifest_path, "r", encoding="utf-8") as handle:
            manifest = json.load(handle)
        return (manifest.get("angles") or {}).get(angle, "")
    except Exception as exc:
        print(f"[Stage2] persona manifest read failed: {exc}")
        return ""


def generate_scene_images(
    resolved_script: dict,
    human_photos: dict,
    work_dir: str,
    server_base_url: str = "",
    on_progress=None,
) -> list[dict]:
    """Generate scene images for each segment.

    Args:
        resolved_script: Output from Stage 1
        human_photos: Dict with face_photo_url, half_body_photo_url, full_body_photo_url
        work_dir: Working directory for intermediate files
        server_base_url: Base URL for resolving relative paths
        on_progress: Callback(stage, progress, message)

    Returns:
        List of segments with scene_image_path added
    """
    ensure_dir(work_dir)
    segments = resolved_script.get("segments", [])
    kie = KieClient()
    human_face_url = human_photos.get("face_photo_url", "")
    persona_face = _load_persona_angle(human_photos.get("image_model_id", ""), "face")
    if persona_face:
        human_face_url = persona_face

    # Download human face photo to local for reuse
    human_face_path = ""
    if human_face_url:
        local_path = _resolve_local(human_face_url, server_base_url)
        if local_path and os.path.exists(local_path):
            human_face_path = local_path
        elif human_face_url.startswith(("http://", "https://")):
            human_face_path = os.path.join(work_dir, "human_face.png")
            try:
                download_file(human_face_url, human_face_path)
            except Exception as e:
                print(f"[Stage2] Download human face photo failed: {e}")
                human_face_path = ""

    for i, seg in enumerate(segments):
        if on_progress:
            pct = 25 + (i / max(len(segments), 1)) * 25
            on_progress("scene_gen", pct, f"生成场景图 ({i+1}/{len(segments)})...")

        scene_url = seg.get("scene_image_url", "")
        scene_path = ""

        # Check if this segment should use digital human
        dh_config = seg.get("digital_human", {})
        use_digital_human = dh_config.get("enabled", False) or human_face_path

        # Skip KIE for local files (external APIs can't access localhost)
        # Only try KIE if both URLs are externally accessible (http/https)
        can_use_kie = (
            scene_url and 
            human_face_url and 
            (scene_url.startswith("http") or "uploads" not in scene_url) and
            (human_face_url.startswith("http") or "uploads" not in human_face_url)
        )
        
        if can_use_kie:
            # Try to generate via KIE (AI scene with human face)
            print(f"[Stage2] Segment {i+1}: generating scene image via KIE...")
            generated_url = kie.generate_scene_image(
                reference_image_url=_resolve(scene_url, server_base_url),
                human_image_url=_resolve(human_face_url, server_base_url),
                prompt=seg.get("narration_text", ""),
            )
            if generated_url:
                scene_path = os.path.join(work_dir, f"scene_{i}.png")
                try:
                    download_file(generated_url, scene_path)
                except Exception as e:
                    print(f"[Stage2] Download generated image failed: {e}")
                    scene_path = ""
        else:
            print(f"[Stage2] Segment {i+1}: Skipping KIE (local files not accessible to external APIs)")

        # Fallback 1: Use human face photo directly if digital human is enabled
        if not scene_path and use_digital_human and human_face_path:
            print(f"[Stage2] Segment {i+1}: using human face photo as scene")
            scene_path = human_face_path

        # Fallback 2: Download the original reference image
        if not scene_path and scene_url:
            local_path = _resolve_local(scene_url, server_base_url)
            if local_path and os.path.exists(local_path):
                scene_path = local_path
            elif scene_url.startswith(("http://", "https://")):
                scene_path = os.path.join(work_dir, f"scene_{i}_ref.png")
                try:
                    download_file(scene_url, scene_path)
                except Exception as e:
                    print(f"[Stage2] Download reference image failed: {e}")
                    scene_path = ""

        seg["scene_image_path"] = scene_path
        seg["human_face_path"] = human_face_path  # Store for stage3
        print(f"[Stage2] Segment {i+1}: scene = {scene_path or '(none)'}")

    if on_progress:
        on_progress("scene_gen", 50, "场景图生成完成")

    return segments


def _resolve(url: str, base_url: str) -> str:
    """Resolve a potentially relative URL."""
    if not url:
        return ""
    if url.startswith(("http://", "https://")):
        return url
    if base_url:
        return f"{base_url.rstrip('/')}/{url.lstrip('/')}"
    return url


def _resolve_local(url: str, base_url: str) -> str:
    """Try to resolve a URL to a local file path."""
    print(f"[Stage2] _resolve_local: url={url}, base_url={base_url}")
    if url.startswith("/uploads/"):
        local = os.path.join(UPLOADS_DIR, url[len("/uploads/"):])
        print(f"[Stage2] _resolve_local: checking {local}, exists={os.path.exists(local)}")
        if os.path.exists(local):
            return local
    if url.startswith("/renders/"):
        from worker.config import RENDERS_DIR
        local = os.path.join(RENDERS_DIR, url[len("/renders/"):])
        print(f"[Stage2] _resolve_local: checking {local}, exists={os.path.exists(local)}")
        if os.path.exists(local):
            return local
    return ""
