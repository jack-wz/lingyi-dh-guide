"""Tests for lip-sync clip duration alignment against TTS."""

import os
import shutil
import tempfile
import unittest

from worker.stage3_video_gen import _align_lipsync_clip_to_tts
from worker.timeline_sync import validate_segments_for_assembly
from worker.utils import check_ffmpeg, get_duration

JOB_FIXTURE = os.path.join(
    os.path.dirname(__file__),
    "..",
    "..",
    "data",
    "renders",
    "job_88476149-cbca-4bf5-a1e4-3ba1fa53bc15",
)


@unittest.skipUnless(check_ffmpeg(), "ffmpeg required")
class ClipAlignIntegrationTests(unittest.TestCase):
    def test_aligns_kie_clips_to_tts_and_passes_validation(self):
        if not os.path.isdir(JOB_FIXTURE):
            self.skipTest("fixture job artifacts missing")

        with tempfile.TemporaryDirectory() as tmp:
            segments = []
            for i in range(4):
                clip_src = os.path.join(JOB_FIXTURE, f"clip_{i}.mp4")
                tts_src = os.path.join(JOB_FIXTURE, f"tts_{i}.wav")
                if not os.path.exists(clip_src) or not os.path.exists(tts_src):
                    self.skipTest(f"missing clip_{i} or tts_{i}")

                clip_dst = os.path.join(tmp, f"clip_{i}.mp4")
                tts_dst = os.path.join(tmp, f"tts_{i}.wav")
                shutil.copy2(clip_src, clip_dst)
                shutil.copy2(tts_src, tts_dst)

                tts_dur = get_duration(tts_dst)
                aligned = _align_lipsync_clip_to_tts(clip_dst, tts_dst, segment=i)
                self.assertGreater(aligned, 0)
                self.assertAlmostEqual(get_duration(clip_dst), tts_dur, delta=0.35)
                segments.append(
                    {
                        "narration_text": "测试",
                        "duration_sec": tts_dur,
                        "clip_path": clip_dst,
                        "tts_audio_path": tts_dst,
                    }
                )

            issues = validate_segments_for_assembly(segments, work_dir=tmp, strict=True)
            self.assertEqual(issues, [])


if __name__ == "__main__":
    unittest.main()