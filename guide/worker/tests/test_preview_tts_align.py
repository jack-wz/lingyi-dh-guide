"""Tests for editor preview TTS + word alignment."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from worker.preview_tts import build_preview_alignment, run_preview_request


class PreviewTtsAlignTests(unittest.TestCase):
    def test_build_preview_alignment_heuristic(self):
        with tempfile.TemporaryDirectory() as tmp:
            audio = Path(tmp) / "sample.wav"
            sample_rate = 8000
            duration = 0.5
            num_samples = int(sample_rate * duration)
            data = b"\x80" * num_samples
            header = (
                b"RIFF"
                + (36 + len(data)).to_bytes(4, "little")
                + b"WAVEfmt "
                + (16).to_bytes(4, "little")
                + (1).to_bytes(2, "little")
                + (1).to_bytes(2, "little")
                + sample_rate.to_bytes(4, "little")
                + (sample_rate).to_bytes(4, "little")
                + (1).to_bytes(2, "little")
                + (8).to_bytes(2, "little")
                + b"data"
                + len(data).to_bytes(4, "little")
            )
            audio.write_bytes(header + data)

            result = build_preview_alignment("你好世界", str(audio), aligner="heuristic")
            self.assertGreater(result["duration_sec"], 0)
            self.assertTrue(result["word_timings"])
            self.assertEqual(result["word_timing_source"], "heuristic")

    @patch("worker.preview_tts.synthesize_preview_audio")
    @patch("worker.preview_tts.build_preview_alignment")
    def test_run_preview_request(self, mock_align, mock_synth):
        with tempfile.TemporaryDirectory() as tmp:
            mock_synth.return_value = (str(Path(tmp) / "out.wav"), "edge")
            mock_align.return_value = {
                "duration_sec": 2.5,
                "word_timings": [{"text": "测", "start": 0.0, "end": 0.5}],
                "word_timing_source": "heuristic",
            }
            result = run_preview_request({
                "text": "测试文案",
                "output_dir": tmp,
                "file_stem": "demo",
            })
            self.assertEqual(result["tts_provider"], "edge")
            self.assertEqual(result["duration_sec"], 2.5)
            self.assertEqual(len(result["word_timings"]), 1)


if __name__ == "__main__":
    unittest.main()