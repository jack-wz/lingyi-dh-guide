import unittest

from worker.whisper_aligner import align_phrases_to_asr, normalize_subtitle_text


class WhisperAlignerTests(unittest.TestCase):
    def test_align_phrases_to_word_timestamps(self):
        phrases = ["当妈后怎么选奶粉？", "飞鹤卓睿很靠谱。"]
        asr_segments = [
            {
                "start": 0.0,
                "end": 2.4,
                "text": "当妈后怎么选奶粉",
                "words": [
                    {"text": "当", "start": 0.0, "end": 0.2},
                    {"text": "妈", "start": 0.2, "end": 0.4},
                    {"text": "后", "start": 0.4, "end": 0.6},
                    {"text": "怎", "start": 0.6, "end": 0.8},
                    {"text": "么", "start": 0.8, "end": 1.0},
                    {"text": "选", "start": 1.0, "end": 1.2},
                    {"text": "奶", "start": 1.2, "end": 1.4},
                    {"text": "粉", "start": 1.4, "end": 1.6},
                ],
            },
            {
                "start": 2.4,
                "end": 4.8,
                "text": "飞鹤卓睿很靠谱",
                "words": [
                    {"text": "飞", "start": 2.4, "end": 2.6},
                    {"text": "鹤", "start": 2.6, "end": 2.8},
                    {"text": "卓", "start": 2.8, "end": 3.0},
                    {"text": "睿", "start": 3.0, "end": 3.2},
                    {"text": "很", "start": 3.2, "end": 3.4},
                    {"text": "靠", "start": 3.4, "end": 3.6},
                    {"text": "谱", "start": 3.6, "end": 3.8},
                ],
            },
        ]

        timings = align_phrases_to_asr(phrases, asr_segments, 10.0, 15.0)
        self.assertIsNotNone(timings)
        assert timings is not None
        self.assertEqual(len(timings), 2)
        self.assertAlmostEqual(timings[0][1], 10.0, places=2)
        self.assertGreater(timings[0][2], timings[0][1])
        self.assertAlmostEqual(timings[-1][2], 15.0, places=2)

    def test_normalize_strips_punctuation(self):
        self.assertEqual(normalize_subtitle_text("Hello, World!"), "helloworld")


if __name__ == "__main__":
    unittest.main()