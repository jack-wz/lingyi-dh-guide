import os
import tempfile
import unittest
from unittest.mock import patch

from worker.ai_clients.talking_head_client import resolve_wavespeed_submit_url
from worker.avatar_adapter import KieAvatarAdapter, WaveSpeedAvatarAdapter, avatar_registry
from worker import config
from worker.config import get_avatar_provider, get_wavespeed_config


class AvatarConfigTests(unittest.TestCase):
    def test_resolve_wavespeed_submit_url_known_model(self):
        url = resolve_wavespeed_submit_url("https://api.wavespeed.ai", "infinitetalk")
        self.assertEqual(url, "https://api.wavespeed.ai/api/v3/wavespeed-ai/infinitetalk")

    def test_resolve_wavespeed_submit_url_custom_slug(self):
        url = resolve_wavespeed_submit_url("https://api.wavespeed.ai", "my-talk-model")
        self.assertEqual(url, "https://api.wavespeed.ai/api/v3/wavespeed-ai/my-talk-model")

    def test_get_wavespeed_config_reads_model_and_resolution(self):
        payload = {
            "models": {
                "wavespeed": {
                    "api_key": "wave-key",
                    "base_url": "https://wave.example",
                    "model": "infinitetalk-multi",
                    "resolution": "720p",
                }
            }
        }
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "config.json")
            with open(path, "w", encoding="utf-8") as f:
                import json

                json.dump(payload, f)
            with patch.object(config, "CONFIG_JSON_PATH", path):
                key, base, model, resolution = get_wavespeed_config()
        self.assertEqual((key, base, model, resolution), ("wave-key", "https://wave.example", "infinitetalk-multi", "720p"))

    def test_get_avatar_provider_from_pipeline(self):
        payload = {"pipeline": {"avatar_provider": "kie"}}
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "config.json")
            with open(path, "w", encoding="utf-8") as f:
                import json

                json.dump(payload, f)
            with patch.object(config, "CONFIG_JSON_PATH", path):
                with patch.dict(os.environ, {"AVATAR_PROVIDER": ""}, clear=False):
                    self.assertEqual(get_avatar_provider(), "kie")

    def test_avatar_registry_has_kie_and_wavespeed(self):
        self.assertIsInstance(avatar_registry.get("wavespeed"), WaveSpeedAvatarAdapter)
        self.assertIsInstance(avatar_registry.get("kie"), KieAvatarAdapter)

    def test_kie_adapter_returns_empty_until_implemented(self):
        adapter = KieAvatarAdapter()
        out = adapter.generate("a.wav", "face.png", {}, "out.mp4")
        self.assertEqual(out, "")


if __name__ == "__main__":
    unittest.main()