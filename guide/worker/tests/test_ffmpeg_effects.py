import unittest

from worker.ffmpeg_effects import (
    build_global_overlay_filters,
    build_video_xfade_filters,
    dsl_uses_ffmpeg_transitions,
    segment_boundary_xfade,
)


class TestFfmpegEffects(unittest.TestCase):
    def test_detects_hf_dissolve(self):
        name, dur = segment_boundary_xfade(
            {"transition": {"type": "hf-dissolve", "duration": 0.5}},
            transitions_enabled=True,
        )
        self.assertEqual(name, "fade")
        self.assertAlmostEqual(dur, 0.5)

    def test_none_transition_skipped(self):
        name, dur = segment_boundary_xfade(
            {"transition": {"type": "none"}},
            transitions_enabled=True,
        )
        self.assertIsNone(name)
        self.assertEqual(dur, 0.0)

    def test_build_xfade_chain(self):
        segments = [
            {"transition": {"type": "hf-dissolve", "duration": 0.4}},
            {"transition": {"type": "none"}},
            {"transition": {"type": "hf-push-left", "duration": 0.5}},
            {"transition": {"type": "none"}},
        ]
        result = build_video_xfade_filters(4, [3.0, 4.0, 5.0, 2.0], segments)
        self.assertIsNotNone(result)
        filters, label = result
        self.assertEqual(label, "vx3")
        self.assertEqual(len(filters), 3)
        self.assertIn("xfade=transition=fade", filters[0])
        self.assertIn("xfade=transition=slideleft", filters[2])

    def test_dsl_uses_ffmpeg_transitions(self):
        dsl_segments = [
            {"transition": {"type": "hf-zoom"}},
            {"transition": {"type": "none"}},
        ]
        self.assertTrue(dsl_uses_ffmpeg_transitions(dsl_segments))

    def test_global_vignette_and_grain(self):
        filters, label = build_global_overlay_filters(
            "subbed",
            {
                "hf_overlays": [
                    {"type": "hf-vignette", "enabled": True, "intensity": 0.8},
                    {"type": "hf-grain", "enabled": True, "opacity": 0.2},
                ],
            },
        )
        self.assertEqual(len(filters), 2)
        self.assertEqual(label, "gfx1")
        self.assertIn("vignette=", filters[0])
        self.assertIn("noise=", filters[1])


if __name__ == "__main__":
    unittest.main()