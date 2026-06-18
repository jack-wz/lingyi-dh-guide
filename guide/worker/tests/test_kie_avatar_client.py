import os
import tempfile
import unittest
from unittest.mock import MagicMock, patch

from worker.ai_clients.kie_avatar_client import KieAvatarClient


class KieAvatarClientTests(unittest.TestCase):
    @patch("worker.ai_clients.kie_avatar_client.get_kie_avatar_config")
    @patch("worker.ai_clients.kie_avatar_client.KieClient")
    def test_generate_downloads_video_when_output_path_set(self, mock_kie_cls, mock_cfg):
        mock_cfg.return_value = ("key", "https://api.kie.ai", "infinitalk/from-audio", "480p", "prompt", 300, 2)
        kie = MagicMock()
        kie.upload_local_file.return_value = "https://cdn.example/face.jpg"
        kie.generate_infinitetalk_video.return_value = "https://cdn.example/talk.mp4"
        mock_kie_cls.return_value = kie

        with tempfile.TemporaryDirectory() as tmp:
            audio = os.path.join(tmp, "a.wav")
            out = os.path.join(tmp, "clip.mp4")
            with open(audio, "wb") as handle:
                handle.write(b"wav")

            with patch(
                "worker.ai_clients.kie_avatar_client.resolve_kie_input_url",
                return_value="https://cdn.example/face.jpg",
            ):
                with patch("worker.utils.download_file") as mock_dl:
                    client = KieAvatarClient()
                    result = client.generate(audio_path=audio, image_url="/uploads/face.png", output_path=out)

        self.assertEqual(result, out)
        kie.generate_infinitetalk_video.assert_called_once()
        mock_dl.assert_called_once_with("https://cdn.example/talk.mp4", out)

    @patch("worker.ai_clients.kie_avatar_client.time.sleep")
    @patch("worker.ai_clients.kie_avatar_client.get_kie_avatar_config")
    @patch("worker.ai_clients.kie_avatar_client.KieClient")
    def test_retries_on_upstream_timeout(self, mock_kie_cls, mock_cfg, _sleep):
        mock_cfg.return_value = ("key", "https://api.kie.ai", "infinitalk/from-audio", "480p", "prompt", 300, 3)
        kie = MagicMock()
        kie.upload_local_file.return_value = "https://cdn.example/face.jpg"
        kie.generate_infinitetalk_video.side_effect = [
            RuntimeError(
                "KIE task failed: [500] The upstream API service timed out and no results were returned"
            ),
            "https://cdn.example/talk.mp4",
        ]
        mock_kie_cls.return_value = kie

        with tempfile.TemporaryDirectory() as tmp:
            audio = os.path.join(tmp, "a.wav")
            with open(audio, "wb") as handle:
                handle.write(b"wav")
            with patch(
                "worker.ai_clients.kie_avatar_client.resolve_kie_input_url",
                return_value="https://cdn.example/face.jpg",
            ):
                client = KieAvatarClient()
                url = client.generate_talking_video("/uploads/face.png", audio)

        self.assertEqual(url, "https://cdn.example/talk.mp4")
        self.assertEqual(kie.generate_infinitetalk_video.call_count, 2)


if __name__ == "__main__":
    unittest.main()