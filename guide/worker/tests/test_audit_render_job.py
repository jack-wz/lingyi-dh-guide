import json
import os
import tempfile
import unittest
from unittest.mock import patch

from worker.timeline_sync import audit_render_job


class TestAuditRenderJob(unittest.TestCase):
    def test_missing_segments_fails(self):
        with tempfile.TemporaryDirectory() as tmp:
            result = audit_render_job(tmp)
            self.assertEqual(result["status"], "fail")
            self.assertTrue(any("no segments" in msg for msg in result["issues"]))

    def test_manifest_with_mock_media(self):
        with tempfile.TemporaryDirectory() as tmp:
            manifest = {
                "version": 1,
                "segments": [
                    {
                        "index": 0,
                        "duration_sec": 5.0,
                        "start_time": 0.0,
                        "end_time": 5.0,
                        "clip_path": os.path.join(tmp, "clip_0.mp4"),
                        "tts_audio_path": os.path.join(tmp, "tts_0.wav"),
                        "narration_text": "测试",
                    }
                ],
                "overlays": [],
            }
            with open(os.path.join(tmp, "segments_manifest.json"), "w", encoding="utf-8") as f:
                json.dump(manifest, f)
            open(os.path.join(tmp, "clip_0.mp4"), "wb").close()
            open(os.path.join(tmp, "tts_0.wav"), "wb").close()

            with patch("worker.timeline_sync.get_duration", return_value=5.0):
                result = audit_render_job(tmp)
            self.assertIn(result["status"], {"ok", "warn"})


if __name__ == "__main__":
    unittest.main()