"""Build multi-angle digital-human persona assets via KIE gpt-image-2."""

from __future__ import annotations

import json
import os
from typing import Any

from worker.ai_clients.kie_client import KieClient
from worker.config import UPLOADS_DIR, get_prompt
from worker.utils import download_file, ensure_dir


PERSONA_ANGLES = (
    ("face", "human_face", "1:1"),
    ("half_body", "human_half", "3:4"),
    ("full_body", "human_full", "9:16"),
)


def _resolve_url(url: str, server_base_url: str) -> str:
    if url.startswith(("http://", "https://")):
        return url
    if url.startswith("/") and server_base_url:
        return f"{server_base_url.rstrip('/')}{url}"
    return url


def build_persona_assets(
    *,
    digital_human_id: str,
    face_photo_url: str,
    half_body_photo_url: str,
    full_body_photo_url: str,
    server_base_url: str = "http://localhost:3000",
    on_progress=None,
) -> dict[str, Any]:
    """Generate KIE persona images for face / half / full body angles."""
    kie = KieClient()
    out_dir = os.path.join(UPLOADS_DIR, "personas", digital_human_id)
    ensure_dir(out_dir)

    source_map = {
        "face": face_photo_url,
        "half_body": half_body_photo_url,
        "full_body": full_body_photo_url,
    }
    assets: dict[str, str] = {}

    for idx, (key, prompt_key, aspect) in enumerate(PERSONA_ANGLES):
        if on_progress:
            on_progress(f"KIE 形象构建 ({idx + 1}/{len(PERSONA_ANGLES)}): {key}")

        ref_url = _resolve_url(source_map[key], server_base_url)
        human_url = _resolve_url(face_photo_url, server_base_url)
        prompt = get_prompt(prompt_key, get_prompt("human_model", ""))

        if key == "face":
            generated = kie.generate_scene_image(
                reference_image_url=ref_url,
                human_image_url=human_url,
                prompt=prompt,
                aspect_ratio=aspect,
                resolution="2K",
            )
        else:
            generated = kie.generate_scene_image(
                reference_image_url=ref_url,
                human_image_url=human_url,
                prompt=prompt,
                aspect_ratio=aspect,
                resolution="2K",
            )

        local_path = os.path.join(out_dir, f"{key}.png")
        if generated:
            try:
                download_file(generated, local_path)
                assets[key] = f"/uploads/personas/{digital_human_id}/{key}.png"
            except Exception as exc:
                print(f"[Persona] download failed for {key}: {exc}")

        if key not in assets:
            fallback = source_map[key]
            if fallback.startswith("/uploads/"):
                assets[key] = fallback
            else:
                assets[key] = fallback

    manifest = {
        "digital_human_id": digital_human_id,
        "provider": "kie-gpt-image-2",
        "angles": assets,
    }
    manifest_path = os.path.join(out_dir, "manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as handle:
        json.dump(manifest, handle, ensure_ascii=False, indent=2)

    return manifest