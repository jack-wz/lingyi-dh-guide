import unittest
from unittest.mock import MagicMock, patch

from worker.ai_clients.kie_client import KieClient


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