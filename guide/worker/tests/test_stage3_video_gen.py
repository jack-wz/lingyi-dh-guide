import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from worker.stage3_video_gen import generate_segment_videos


class Stage3VideoGenTests(unittest.TestCase):
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
