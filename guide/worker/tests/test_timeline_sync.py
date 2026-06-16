import unittest

from worker.timeline_sync import reconcile_timeline, validate_segments_for_assembly


class TestTimelineSync(unittest.TestCase):
    def test_reconcile_updates_overlay_global_times(self):
        segments = [
            {"duration_sec": 10, "narration_text": "a"},
            {"duration_sec": 10, "narration_text": "b"},
        ]
        overlays = [
            {
                "id": "logo",
                "segment_index": 1,
                "seg_start_time": 0,
                "duration": 5,
                "global_start_s": 10,
                "global_end_s": 20,
            }
        ]

        # Simulate TTS making first segment shorter.
        segments[0]["duration_sec"] = 6.7
        segments[1]["duration_sec"] = 8.66

        result = reconcile_timeline(segments, overlays)
        self.assertAlmostEqual(result["segments"][0]["end_time"], 6.7, places=2)
        self.assertAlmostEqual(result["segments"][1]["start_time"], 6.7, places=2)
        self.assertAlmostEqual(result["overlays"][0]["global_start_s"], 6.7, places=2)
        self.assertAlmostEqual(result["overlays"][0]["global_end_s"], 11.7, places=2)
        self.assertAlmostEqual(result["total_duration"], 15.36, places=2)

    def test_validate_requires_clip(self):
        with self.assertRaises(RuntimeError):
            validate_segments_for_assembly([{"duration_sec": 5}], strict=True)


if __name__ == "__main__":
    unittest.main()