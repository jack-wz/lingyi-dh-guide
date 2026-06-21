"""Standard pipeline must deliver via FFmpeg single path (no HF style pass)."""

import inspect
import unittest

from worker.pipelines.standard import StandardPipeline


class TestStandardPipelineAssemble(unittest.TestCase):
    def test_assemble_source_has_no_hf_style_pass(self):
        source = inspect.getsource(StandardPipeline.assemble)
        self.assertNotIn("apply_hf_style_pass", source)
        self.assertNotIn("hf_style_pass", source)
        self.assertNotIn("skip_ass", source)
        self.assertIn("final.mp4", source)


if __name__ == "__main__":
    unittest.main()