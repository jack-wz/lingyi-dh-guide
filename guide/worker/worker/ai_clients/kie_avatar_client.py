"""KIE InfiniteTalk lip-sync client (infinitalk/from-audio)."""

from __future__ import annotations

import os
import time

from worker.ai_clients.kie_client import KieClient

KIE_MEDIA_MAX_BYTES = 10 * 1024 * 1024
from worker.config import get_kie_avatar_config
from worker.kie_input_resolver import resolve_kie_input_url
from worker.provider_errors import ProviderTimeoutError

_RETRY_BACKOFF_SEC = (5.0, 15.0, 30.0)


def _is_retriable_kie_error(exc: Exception) -> bool:
    message = str(exc).lower()
    markers = (
        "timeout",
        "timed out",
        "upstream",
        "internal error",
        "try again",
        "500",
        "502",
        "503",
        "504",
    )
    return any(marker in message for marker in markers)


class KieAvatarClient:
    """Talking-head generation through KIE Market InfiniteTalk API."""

    def __init__(self, server_base_url: str = ""):
        self.server_base_url = server_base_url
        self._kie = KieClient()
        (
            _api_key,
            _base_url,
            self.model,
            self.resolution,
            self.prompt,
            self.poll_timeout,
            self.max_attempts,
        ) = get_kie_avatar_config()

    def _resolve_media_url(self, path_or_url: str, *, label: str = "media") -> str:
        if not path_or_url:
            return ""
        if os.path.exists(path_or_url):
            size = os.path.getsize(path_or_url)
            if size > KIE_MEDIA_MAX_BYTES:
                print(
                    f"[KieAvatar] {label} exceeds KIE 10MB limit "
                    f"({size} bytes): {path_or_url}"
                )
                return ""
            uploaded = self._kie.upload_local_file(path_or_url)
            if uploaded:
                return uploaded
            print(f"[KieAvatar] Failed to upload local file: {path_or_url}")
            return ""
        return resolve_kie_input_url(path_or_url, self._kie, self.server_base_url)

    def generate_talking_video(
        self,
        image_path_or_url: str,
        audio_path_or_url: str,
        duration: float = 5.0,
        max_attempts: int | None = None,
    ) -> str:
        if max_attempts is None:
            max_attempts = self.max_attempts
        print(
            f"[KieAvatar] generate: image={image_path_or_url}, audio={audio_path_or_url}, "
            f"model={self.model}, resolution={self.resolution}"
        )
        image_url = self._resolve_media_url(image_path_or_url, label="image")
        audio_url = self._resolve_media_url(audio_path_or_url, label="audio")
        if not image_url or not audio_url:
            print("[KieAvatar] Missing public image_url or audio_url after resolve/upload")
            return ""

        last_error: Exception | None = None
        for attempt in range(1, max_attempts + 1):
            try:
                video_url = self._kie.generate_infinitetalk_video(
                    image_url=image_url,
                    audio_url=audio_url,
                    model=self.model,
                    resolution=self.resolution,
                    prompt=self.prompt,
                    poll_timeout=self.poll_timeout,
                )
                if video_url:
                    if attempt > 1:
                        print(f"[KieAvatar] Succeeded on attempt {attempt}/{max_attempts}")
                    return video_url
                print(f"[KieAvatar] Attempt {attempt}/{max_attempts} returned empty result")
                last_error = RuntimeError("KIE InfiniteTalk returned empty result")
            except ProviderTimeoutError as exc:
                last_error = exc
                print(f"[KieAvatar] Attempt {attempt}/{max_attempts} timed out: {exc}")
            except RuntimeError as exc:
                last_error = exc
                print(f"[KieAvatar] Attempt {attempt}/{max_attempts} failed: {exc}")
                if not _is_retriable_kie_error(exc):
                    break
            except Exception as exc:
                last_error = exc
                print(f"[KieAvatar] Attempt {attempt}/{max_attempts} error: {type(exc).__name__}: {exc}")
                if not _is_retriable_kie_error(exc):
                    break

            if attempt < max_attempts:
                backoff = _RETRY_BACKOFF_SEC[min(attempt - 1, len(_RETRY_BACKOFF_SEC) - 1)]
                print(f"[KieAvatar] Retrying in {backoff:.0f}s...")
                time.sleep(backoff)

        if last_error:
            print(f"[KieAvatar] Exhausted retries: {last_error}")
        return ""

    def generate(
        self,
        audio_path: str,
        image_url: str,
        voice_id: str = "",
        output_path: str = "",
    ) -> str:
        video_url = self.generate_talking_video(image_url, audio_path)
        if not video_url:
            return ""
        if output_path:
            from worker.utils import download_file

            try:
                download_file(video_url, output_path)
                return output_path
            except Exception as exc:
                print(f"[KieAvatar] Download result failed: {exc}")
                return ""
        return video_url