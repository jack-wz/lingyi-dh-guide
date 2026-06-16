"""Unified avatar/digital-human adapter interface.

Inspired by OpenTalking: decouple the pipeline from specific talking-head
providers by exposing a single generate(video_path, audio_path, human_config)
contract.
"""

from abc import ABC, abstractmethod
from typing import Any

from worker.ai_clients.kie_avatar_client import KieAvatarClient
from worker.ai_clients.talking_head_client import TalkingHeadClient


class AvatarAdapter(ABC):
    """Abstract adapter for generating talking-head videos."""

    @abstractmethod
    def generate(
        self,
        audio_path: str,
        image_path: str,
        human_config: dict[str, Any],
        output_path: str,
    ) -> str:
        """Generate a talking-head video from audio, image and human config.

        Returns the path to the generated video file.
        """


class WaveSpeedAvatarAdapter(AvatarAdapter):
    """WaveSpeed talking-head adapter (InfiniteTalk and sibling models)."""

    def __init__(self, server_base_url: str = ""):
        self._client = TalkingHeadClient(server_base_url=server_base_url)

    def generate(self, audio_path: str, image_path: str, human_config: dict[str, Any], output_path: str) -> str:
        # Prefer the segment-specific image; fall back to the trained face photo.
        image_source = image_path or human_config.get("face_photo_url", "")
        voice_clone_id = human_config.get("voice_clone_id", "")
        return self._client.generate(
            audio_path=audio_path,
            image_url=image_source,
            voice_id=voice_clone_id,
            output_path=output_path,
        )


class KieAvatarAdapter(AvatarAdapter):
    """KIE lip-sync adapter slot — returns empty until KIE video API is integrated."""

    def __init__(self, server_base_url: str = ""):
        self._client = KieAvatarClient(server_base_url=server_base_url)

    def generate(self, audio_path: str, image_path: str, human_config: dict[str, Any], output_path: str) -> str:
        image_source = image_path or human_config.get("face_photo_url", "")
        return self._client.generate(
            audio_path=audio_path,
            image_url=image_source,
            output_path=output_path,
        )


class AvatarAdapterRegistry:
    """Registry for avatar adapters keyed by provider name."""

    def __init__(self):
        self._adapters: dict[str, type[AvatarAdapter]] = {}

    def register(self, provider: str, adapter_cls: type[AvatarAdapter]) -> None:
        self._adapters[provider] = adapter_cls

    def get(self, provider: str, **kwargs: Any) -> AvatarAdapter:
        adapter_cls = self._adapters.get(provider)
        if adapter_cls is None:
            available = ", ".join(self._adapters.keys())
            raise ValueError(f"Unknown avatar provider '{provider}'. Available: {available}")
        return adapter_cls(**kwargs)


avatar_registry = AvatarAdapterRegistry()
avatar_registry.register("wavespeed", WaveSpeedAvatarAdapter)
avatar_registry.register("kie", KieAvatarAdapter)
