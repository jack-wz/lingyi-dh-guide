import unittest

from worker.errors import classify_worker_error, format_worker_error


class TestWorkerErrors(unittest.TestCase):
    def test_ffmpeg_code(self):
        self.assertEqual(classify_worker_error(RuntimeError("FFmpeg failed with code 1")), "W401")

    def test_format_prefix(self):
        msg = format_worker_error(RuntimeError("boom"))
        self.assertTrue(msg.startswith("[W500] RuntimeError: boom"))


if __name__ == "__main__":
    unittest.main()