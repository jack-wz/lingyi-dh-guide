import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from worker.ai_clients import talking_head_client
from worker.ai_clients.talking_head_client import TalkingHeadClient


class TalkingHeadUploadCacheTests(unittest.TestCase):
    def setUp(self):
        talking_head_client._upload_url_cache.clear()

    def test_upload_file_reuses_cached_url_for_same_path(self):
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
            tmp.write(b"fake-image")
            path = tmp.name

        try:
            client = TalkingHeadClient()
            client.api_key = "test-key"
            client.base_url = "https://api.wavespeed.ai"

            with patch.object(client, "headers", {"Authorization": "Bearer test-key"}):
                with patch("worker.ai_clients.talking_head_client.requests.post") as mock_post:
                    mock_post.return_value.status_code = 200
                    mock_post.return_value.json.return_value = {
                        "data": {"download_url": "https://cdn.example.com/face.png"},
                    }
                    mock_post.return_value.raise_for_status = lambda: None

                    first = client.upload_file(path)
                    second = client.upload_file(path)

            self.assertEqual(first, "https://cdn.example.com/face.png")
            self.assertEqual(second, first)
            self.assertEqual(mock_post.call_count, 1)
        finally:
            os.unlink(path)


if __name__ == "__main__":
    unittest.main()