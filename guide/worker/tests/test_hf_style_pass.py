import unittest

from worker.hf_style_pass import (
    dsl_needs_hf_style_pass,
    dsl_uses_hf_subtitles,
    dsl_uses_hf_transitions,
    dsl_uses_hf_global_overlays,
)


class TestHfStylePass(unittest.TestCase):
    def test_detects_hf_subtitles(self):
        dsl = {
            "segments": [{
                "narration_text": "测试",
                "subtitle": {"enabled": True, "style_id": "hf-caption-pill"},
            }],
        }
        self.assertTrue(dsl_uses_hf_subtitles(dsl))
        self.assertTrue(dsl_needs_hf_style_pass(dsl))

    def test_detects_hf_transitions(self):
        dsl = {
            "segments": [{"transition": {"type": "hf-dissolve"}}],
        }
        self.assertTrue(dsl_uses_hf_transitions(dsl))

    def test_detects_hf_overlays(self):
        dsl = {
            "globalConfig": {
                "hf_overlays": [{"type": "hf-grain", "enabled": True}],
            },
        }
        self.assertTrue(dsl_uses_hf_global_overlays(dsl))


if __name__ == "__main__":
    unittest.main()