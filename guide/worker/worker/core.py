"""Core service facade for pipeline execution.

This keeps provider clients behind one stable surface, following the same
direction as Pixelle-Video without making Pixelle a runtime dependency.
"""

from dataclasses import dataclass

from worker.ai_clients.kie_client import KieClient
from worker.ai_clients.talking_head_client import TalkingHeadClient
from worker.ai_clients.yuntts_client import YunTTSClient


@dataclass
class CoreServices:
    """Lazy access to media, TTS, talking-head, storage, and composition services."""

    _tts: YunTTSClient | None = None
    _image: KieClient | None = None
    _talking_head: TalkingHeadClient | None = None

    @property
    def tts(self) -> YunTTSClient:
        if self._tts is None:
            self._tts = YunTTSClient()
        return self._tts

    @property
    def image(self) -> KieClient:
        if self._image is None:
            self._image = KieClient()
        return self._image

    @property
    def talking_head(self) -> TalkingHeadClient:
        if self._talking_head is None:
            self._talking_head = TalkingHeadClient()
        return self._talking_head
