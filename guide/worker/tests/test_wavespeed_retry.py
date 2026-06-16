import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from worker.ai_clients.talking_head_client import TalkingHeadClient
from worker.provider_errors import ProviderTimeoutError


class WaveSpeedRetryTests(unittest.TestCase):
    @patch(
        "worker.ai_clients.talking_head_client.get_wavespeed_config",
        return_value=("test-key", "https://wave.test", "infinitetalk", "480p"),
    )
    @patch.object(TalkingHeadClient, "_generate_talking_video_once")
    def test_retries_on_timeout(self, mock_once, _cfg):
        mock_once.side_effect = [
            ProviderTimeoutError("WaveSpeed", "poll", 30),
            ProviderTimeoutError("WaveSpeed", "poll", 30),
            "https://cdn.example/video.mp4",
        ]
        client = TalkingHeadClient()
        with patch("worker.ai_clients.talking_head_client.time.sleep"):
            url = client.generate_talking_video("img.png", "audio.wav", duration=5, max_attempts=3)
        self.assertEqual(url, "https://cdn.example/video.mp4")
        self.assertEqual(mock_once.call_count, 3)

    @patch(
        "worker.ai_clients.talking_head_client.get_wavespeed_config",
        return_value=("test-key", "https://wave.test", "infinitetalk", "480p"),
    )
    @patch.object(TalkingHeadClient, "_generate_talking_video_once", return_value="")
    def test_exhausts_retries_on_empty_result(self, mock_once, _cfg):
        client = TalkingHeadClient()
        with patch("worker.ai_clients.talking_head_client.time.sleep"):
            url = client.generate_talking_video("img.png", "audio.wav", duration=5, max_attempts=2)
        self.assertEqual(url, "")
        self.assertEqual(mock_once.call_count, 2)


if __name__ == "__main__":
    unittest.main()