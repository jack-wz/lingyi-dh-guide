"""Unified TTS adapter interface (mirrors avatar_adapter pattern)."""

from abc import ABC, abstractmethod
from typing import Any

from worker.ai_clients.yuntts_client import YunTTSClient


class TTSAdapter(ABC):
    """Abstract adapter for speech synthesis."""

    @abstractmethod
    def synthesize(self, text: str, voice_id: str, output_path: str) -> str:
        """Synthesize speech and return output path, or empty string on failure."""

    @abstractmethod
    def clone_and_synthesize(
        self,
        text: str,
        voice_sample_path: str,
        output_path: str,
        voice_name: str = "voice_clone",
    ) -> str:
        """Clone voice from sample then synthesize."""

    @abstractmethod
    def synthesize_fallback(
        self,
        text: str,
        output_path: str,
        voice_sample_path: str = "",
    ) -> str:
        """Provider-specific fallback when primary synthesis fails."""


class YunTTSAdapter(TTSAdapter):
    """YunTTS / MOSI Studio adapter."""

    def __init__(self):
        self._client = YunTTSClient()

    def synthesize(self, text: str, voice_id: str, output_path: str) -> str:
        return self._client.synthesize_speech(text, voice_id, output_path)

    def clone_and_synthesize(
        self,
        text: str,
        voice_sample_path: str,
        output_path: str,
        voice_name: str = "voice_clone",
    ) -> str:
        return self._client.clone_and_synthesize(text, voice_sample_path, output_path, voice_name)

    def clone_and_synthesize_with_voice_id(
        self,
        text: str,
        voice_sample_path: str,
        output_path: str,
        voice_name: str = "voice_clone",
        prompt_audio_url: str = "",
    ) -> tuple[str, str]:
        return self._client.clone_and_synthesize_with_voice_id(
            text, voice_sample_path, output_path, voice_name, prompt_audio_url
        )

    def synthesize_with_prompt_audio(
        self,
        text: str,
        prompt_audio_url: str,
        output_path: str,
        prompt_text: str = "",
    ) -> str:
        """IndexTTS-2 zero-shot synthesis using a public prompt_audio_url."""
        path = self._client.synthesize_index_tts(
            text, prompt_audio_url, output_path, prompt_text
        )
        if path:
            return path
        return self._client.synthesize_index_tts_async(
            text, prompt_audio_url, output_path, prompt_text
        )

    def synthesize_fallback(
        self,
        text: str,
        output_path: str,
        voice_sample_path: str = "",
    ) -> str:
        import os

        from worker.config import get_prompt
        from worker.local_edge_tts import synthesize_local_edge_tts

        path, _voice_id = self.synthesize_fallback_with_voice_id(
            text, output_path, voice_sample_path
        )
        return path

    def synthesize_fallback_with_voice_id(
        self,
        text: str,
        output_path: str,
        voice_sample_path: str = "",
        voice_name: str = "voice_clone",
    ) -> tuple[str, str]:
        """Provider-specific fallback when primary synthesis fails.

        For digital-human narration a voice_sample_path is required; we always
        re-clone through Index/YunTTS and never fall back to Edge TTS, so the
        output voice stays consistent with the selected avatar.
        """
        import os

        if voice_sample_path and os.path.exists(voice_sample_path):
            return self._client.clone_and_synthesize_with_voice_id(
                text, voice_sample_path, output_path, voice_name
            )
        # No voice sample: non-digital-human case, Edge TTS is acceptable.
        from worker.config import get_prompt
        from worker.local_edge_tts import synthesize_local_edge_tts

        remote = self._client.synthesize_edge_tts(text, output_path)
        if remote and os.path.exists(remote):
            return remote, ""
        voice = get_prompt("edge_tts_voice", "zh-CN-XiaoxiaoNeural")
        print(f"[TTS] YunTTS unavailable, trying local Edge TTS voice={voice}")
        return synthesize_local_edge_tts(text, output_path, voice=voice), ""


class TTSAdapterRegistry:
    def __init__(self):
        self._adapters: dict[str, type[TTSAdapter]] = {}

    def register(self, provider: str, adapter_cls: type[TTSAdapter]) -> None:
        self._adapters[provider] = adapter_cls

    def get(self, provider: str, **kwargs: Any) -> TTSAdapter:
        adapter_cls = self._adapters.get(provider)
        if adapter_cls is None:
            available = ", ".join(self._adapters.keys())
            raise ValueError(f"Unknown TTS provider '{provider}'. Available: {available}")
        return adapter_cls(**kwargs)


tts_registry = TTSAdapterRegistry()
tts_registry.register("yuntts", YunTTSAdapter)