import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from worker.pipeline_log import PipelineStepError
from worker.stage3_video_gen import generate_segment_videos


class PipelineStrictTests(unittest.TestCase):
    def test_strict_fails_when_tts_missing(self):
        segments = [
            {
                "narration_text": "测试口播",
                "duration_sec": 3.0,
                "scene_image_path": "/tmp/scene.png",
            }
        ]
        with tempfile.TemporaryDirectory() as work_dir:
            with patch("worker.stage3_video_gen.check_ffmpeg", return_value=True):
                with patch("worker.tts_adapter.tts_registry") as mock_registry:
                    mock_tts = mock_registry.get.return_value
                    mock_tts.synthesize_fallback.return_value = ""
                    with patch("worker.stage3_video_gen.os.path.exists", return_value=True):
                        with self.assertRaises(PipelineStepError) as ctx:
                            generate_segment_videos(
                                segments=segments,
                                global_config={},
                                voice_clone_id="",
                                human_photos={},
                                work_dir=work_dir,
                                strict=True,
                            )
                        self.assertIn("TTS", str(ctx.exception))

    def test_non_strict_allows_legacy_fallback(self):
        segments = [
            {
                "narration_text": "测试口播",
                "duration_sec": 3.0,
                "scene_image_path": "",
            }
        ]
        with tempfile.TemporaryDirectory() as work_dir:
            tts_path = os.path.join(work_dir, "tts_0.wav")
            open(tts_path, "wb").close()
            with patch("worker.stage3_video_gen.check_ffmpeg", return_value=True):
                with patch("worker.tts_adapter.tts_registry") as mock_registry:
                    mock_tts = mock_registry.get.return_value
                    mock_tts.synthesize_fallback.return_value = tts_path
                    with patch("worker.stage3_video_gen.os.path.exists", return_value=True):
                        with patch("worker.stage3_video_gen.get_duration", return_value=3.0):
                            with patch(
                                "worker.timeline_sync.validate_segments_for_assembly",
                                return_value=[],
                            ):
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
                                        strict=False,
                                    )
                    mock_tts.synthesize_fallback.assert_called_once()


if __name__ == "__main__":
    unittest.main()