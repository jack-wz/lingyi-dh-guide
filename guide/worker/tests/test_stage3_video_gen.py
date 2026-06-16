import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from worker.stage3_video_gen import generate_segment_videos


class Stage3VideoGenTests(unittest.TestCase):
    def test_fallback_tts_without_voice_clone_id(self):
        segments = [
            {
                "narration_text": "测试口播",
                "duration_sec": 3.0,
                "scene_image_path": "",
            }
        ]
        with tempfile.TemporaryDirectory() as work_dir:
            with patch("worker.stage3_video_gen.check_ffmpeg", return_value=True):
                with patch("worker.tts_adapter.tts_registry") as mock_registry:
                    mock_tts = mock_registry.get.return_value
                    mock_tts.synthesize_fallback.return_value = os.path.join(work_dir, "tts_0.wav")
                    with patch("worker.stage3_video_gen.os.path.exists", return_value=True):
                        with patch("worker.stage3_video_gen.get_duration", return_value=3.0):
                            with patch(
                                "worker.stage3_video_gen._generate_placeholder_clip",
                                return_value=os.path.join(work_dir, "clip_0.mp4"),
                            ):
                                generate_segment_videos(
                                    segments=segments,
                                    global_config={},
                                    voice_clone_id="",
                                    human_photos={},
                                    work_dir=work_dir,
                                )
                    mock_tts.synthesize_fallback.assert_called_once()
                    self.assertEqual(segments[0]["tts_audio_path"], os.path.join(work_dir, "tts_0.wav"))

    def test_missing_ffmpeg_fails_before_media_generation(self):
        with tempfile.TemporaryDirectory() as work_dir:
            with patch("worker.stage3_video_gen.check_ffmpeg", return_value=False):
                with self.assertRaisesRegex(RuntimeError, "FFmpeg is not available"):
                    generate_segment_videos(
                        segments=[],
                        global_config={},
                        voice_clone_id="",
                        human_photos={},
                        work_dir=work_dir,
                    )


if __name__ == "__main__":
    unittest.main()
