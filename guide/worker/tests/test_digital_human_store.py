import unittest
from unittest.mock import patch

from worker.digital_human_store import persist_voice_clone_id


class TestDigitalHumanStore(unittest.TestCase):
    def test_persist_skips_empty(self):
        self.assertFalse(persist_voice_clone_id("", "voice-1"))
        self.assertFalse(persist_voice_clone_id("dh-1", ""))

    @patch("worker.digital_human_store.requests.put")
    def test_persist_success(self, mock_put):
        mock_put.return_value.status_code = 200
        self.assertTrue(
            persist_voice_clone_id("dh-1", "uspeech:abc", "http://127.0.0.1:8000")
        )
        mock_put.assert_called_once_with(
            "http://127.0.0.1:8000/api/digital-humans/dh-1",
            json={"voice_clone_id": "uspeech:abc"},
            timeout=30,
        )


if __name__ == "__main__":
    unittest.main()