import unittest

from worker.ffmpeg_effects import expected_output_duration_with_xfade


class TestXfadeExpectedDuration(unittest.TestCase):
    def test_three_dissolve_transitions_shorten_total(self):
        clip_durations = [6.0, 6.5, 6.2, 7.3]
        segments = [
            {"transition": {"type": "hf-dissolve", "duration": 0.6}},
            {"transition": {"type": "hf-dissolve", "duration": 0.6}},
            {"transition": {"type": "hf-dissolve", "duration": 0.6}},
            {"transition": {"type": "hf-dissolve", "duration": 0.6}},
        ]
        expected = expected_output_duration_with_xfade(clip_durations, segments)
        self.assertIsNotNone(expected)
        self.assertLess(expected, sum(clip_durations))
        self.assertAlmostEqual(expected, sum(clip_durations) - 1.8, places=1)

    def test_no_transitions_returns_none(self):
        clip_durations = [5.0, 5.0]
        segments = [{"transition": {"type": "none"}}, {"transition": {"type": "none"}}]
        self.assertIsNone(expected_output_duration_with_xfade(clip_durations, segments))


if __name__ == "__main__":
    unittest.main()