import os
import tempfile
import unittest
from unittest.mock import MagicMock, patch

from worker.stage3_video_gen import (
    _normalize_voice_clone_id,
    _warn_segment_voice_id_conflicts,
    generate_segment_videos,
)
from worker.pipeline_log import null_logger


class TestStage3VoicePersist(unittest.TestCase):
    def test_normalize_voice_clone_id_ignores_placeholders(self):
        self.assertEqual(_normalize_voice_clone_id(""), "")
        self.assertEqual(_normalize_voice_clone_id("local-voice:dh-1"), "")
        self.assertEqual(_normalize_voice_clone_id("dh-1", "dh-1"), "")
        self.assertEqual(_normalize_voice_clone_id("uspeech:abc", "dh-1"), "uspeech:abc")

    def test_reuses_voice_id_across_segments(self):
        adapter = MagicMock()
        with tempfile.TemporaryDirectory() as tmp:
            tts_paths = [os.path.join(tmp, f"tts_{idx}.wav") for idx in (0, 1)]
            adapter.synthesize.side_effect = tts_paths
            adapter.clone_and_synthesize_with_voice_id = MagicMock()

            for idx in (0, 1):
                with open(os.path.join(tmp, f"tts_{idx}.wav"), "wb") as handle:
                    handle.write(b"RIFF")
                with open(os.path.join(tmp, f"scene_{idx}.png"), "wb") as handle:
                    handle.write(b"png")
                with open(os.path.join(tmp, f"clip_{idx}.mp4"), "wb") as handle:
                    handle.write(b"mp4")

            segments = [
                {
                    "narration_text": "第一句",
                    "duration_sec": 3,
                    "scene_image_path": os.path.join(tmp, "scene_0.png"),
                },
                {
                    "narration_text": "第二句",
                    "duration_sec": 3,
                    "scene_image_path": os.path.join(tmp, "scene_1.png"),
                },
            ]

            with patch("worker.stage3_video_gen.check_ffmpeg", return_value=True):
                with patch("worker.stage3_video_gen.get_duration", return_value=3.0):
                    with patch(
                        "worker.stage3_video_gen._generate_narration_clip",
                        side_effect=[
                            os.path.join(tmp, "clip_0.mp4"),
                            os.path.join(tmp, "clip_1.mp4"),
                        ],
                    ):
                        with patch(
                            "worker.timeline_sync.validate_segments_for_assembly",
                            return_value=[],
                        ):
                            with patch(
                                "worker.digital_human_store.persist_voice_clone_id",
                                return_value=True,
                            ) as mock_persist:
                                generate_segment_videos(
                                    segments,
                                    {},
                                    "uspeech:stored-voice",
                                    {},
                                    tmp,
                                    strict=False,
                                    tts_adapter=adapter,
                                    avatar_adapter=MagicMock(),
                                    digital_human_id="dh-test",
                                )

        self.assertEqual(adapter.synthesize.call_count, 2)
        adapter.clone_and_synthesize_with_voice_id.assert_not_called()
        mock_persist.assert_not_called()

    def test_warns_when_segment_voice_id_conflicts_with_digital_human(self):
        log = null_logger()
        segments = [{"voice_id": "uspeech:other"}, {"voice_id": ""}]
        with patch.object(log, "warn") as mock_warn:
            _warn_segment_voice_id_conflicts(
                segments,
                digital_human_id="dh_a",
                voice_clone_id="uspeech:stored",
                log=log,
                stage="Stage3",
            )
        mock_warn.assert_called_once()
        message = mock_warn.call_args.args[2]
        self.assertIn("uspeech:other", message)
        self.assertIn("dh_a", message)


if __name__ == "__main__":
    unittest.main()