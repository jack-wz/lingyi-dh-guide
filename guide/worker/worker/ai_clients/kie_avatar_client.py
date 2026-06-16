"""KIE talking-head / lip-sync client slot (reserved for future KIE video APIs)."""

from __future__ import annotations

from worker.config import get_kie_config


class KieAvatarClient:
    """Placeholder until a KIE lip-sync endpoint is wired."""

    def __init__(self, server_base_url: str = ""):
        self.server_base_url = server_base_url
        self.api_key, self.base_url = get_kie_config()

    def generate_talking_video(
        self,
        image_path_or_url: str,
        audio_path_or_url: str,
        duration: float = 5.0,
        max_attempts: int = 1,
    ) -> str:
        print(
            "[KieAvatar] KIE lip-sync is not implemented yet. "
            "Set pipeline.avatar_provider to 'wavespeed' in guide/data/config.json "
            "or /debug → 模型配置."
        )
        return ""

    def generate(
        self,
        audio_path: str,
        image_url: str,
        voice_id: str = "",
        output_path: str = "",
    ) -> str:
        return self.generate_talking_video(image_url, audio_path)