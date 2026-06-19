import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from worker.stage3_video_gen import generate_segment_videos


class Stage3VideoGenTests(unittest.TestCase):
    def test_non_strict_fallback_tts_without_voice_clone_id(self):
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
                    self.assertEqual(segments[0]["tts_audio_path"], os.path.join(work_dir, "tts_0.wav"))

    def test_missing_ffmpeg_fails_before_media_generation(self):
        with tempfile.TemporaryDirectory() as work_dir:
            with patch("worker.stage3_video_gen.check_ffmpeg", return_value=False):
                with self.assertRaises(Exception):
                    generate_segment_videos(
                        segments=[],
                        global_config={},
                        voice_clone_id="",
                        human_photos={},
                        work_dir=work_dir,
                    )


    def test_parallel_lipsync_submits_all_segments(self):
        segments = [
            {
                "narration_text": f"口播{i}",
                "duration_sec": 3.0,
                "scene_image_path": f"/tmp/scene_{i}.png",
            }
            for i in range(4)
        ]
        with tempfile.TemporaryDirectory() as work_dir:
            with patch("worker.stage3_video_gen.check_ffmpeg", return_value=True):
                with patch("worker.stage3_video_gen.get_lipsync_parallel_workers", return_value=4):
                    with patch("worker.stage3_video_gen._prepare_segment_tts") as mock_prep:
                        with patch("worker.stage3_video_gen._generate_clips_parallel") as mock_parallel:
                            with patch(
                                "worker.timeline_sync.validate_segments_for_assembly",
                                return_value=[],
                            ):
                                from worker.stage3_video_gen import _SegmentWork

                                def fake_prep(**kwargs):
                                    idx = kwargs["index"]
                                    seg = kwargs["seg"]
                                    seg["clip_path"] = os.path.join(work_dir, f"clip_{idx}.mp4")
                                    open(seg["clip_path"], "wb").close()
                                    return _SegmentWork(
                                        index=idx,
                                        seg=seg,
                                        text=seg["narration_text"],
                                        duration=3.0,
                                        scene_path=seg["scene_image_path"],
                                        human_face_path="",
                                        tts_path=os.path.join(work_dir, f"tts_{idx}.wav"),
                                        has_narration=True,
                                        can_use_talking_head=True,
                                    )

                                mock_prep.side_effect = fake_prep
                                generate_segment_videos(
                                    segments=segments,
                                    global_config={"canvas_width": 1080, "canvas_height": 1920, "fps": 30},
                                    voice_clone_id="uspeech:test",
                                    human_photos={},
                                    work_dir=work_dir,
                                    tts_adapter=object(),
                                    avatar_adapter=object(),
                                )
                                mock_parallel.assert_called_once()
                                call_kwargs = mock_parallel.call_args.kwargs
                                self.assertEqual(len(call_kwargs["lipsync_jobs"]), 4)
                                self.assertEqual(call_kwargs["workers"], 4)


if __name__ == "__main__":
    unittest.main()