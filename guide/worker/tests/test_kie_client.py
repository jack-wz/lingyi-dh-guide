import unittest
from unittest.mock import MagicMock, patch

from worker.ai_clients.kie_client import KieClient


class KieClientSceneFusionTests(unittest.TestCase):
    @patch("worker.scene_fusion.get_scene_fusion_input_order", return_value="scene_first")
    @patch("worker.ai_clients.kie_client.KieClient._poll_task", return_value="https://kie.example/out.png")
    @patch("worker.ai_clients.kie_client.KieClient._post")
    def test_scene_fusion_puts_scene_before_digital_human_by_default(
        self, mock_post, _mock_poll, _mock_order
    ):
        mock_post.return_value = {"code": 200, "data": {"taskId": "task-1"}}
        client = KieClient()
        client.api_key = "test-key"
        client.generate_scene_image(
            scene_image_url="https://cdn/scene.png",
            digital_human_image_url="https://cdn/human.png",
            prompt="fuse",
        )
        payload = mock_post.call_args.kwargs["json"]
        self.assertEqual(
            payload["input"]["input_urls"],
            ["https://cdn/scene.png", "https://cdn/human.png"],
        )


class KieClientUploadTests(unittest.TestCase):
    @patch("worker.ai_clients.kie_client.requests.post")
    def test_upload_accepts_download_url(self, mock_post):
        mock_resp = MagicMock()
        mock_resp.raise_for_status.return_value = None
        mock_resp.json.return_value = {
            "success": True,
            "code": 200,
            "data": {
                "downloadUrl": "https://tempfile.example/kieai/pixelle-preview/a.png",
            },
        }
        mock_post.return_value = mock_resp

        with patch("builtins.open", unittest.mock.mock_open(read_data=b"png")):
            with patch("worker.ai_clients.kie_client.os.path.exists", return_value=True):
                client = KieClient()
                client.api_key = "test-key"
                url = client.upload_local_file("/tmp/a.png")

        self.assertEqual(url, "https://tempfile.example/kieai/pixelle-preview/a.png")


if __name__ == "__main__":
    unittest.main()