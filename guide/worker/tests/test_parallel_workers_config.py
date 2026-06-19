import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from worker import config


class ParallelWorkersConfigTests(unittest.TestCase):
    def tearDown(self):
        for key in ("SCENE_FUSION_PARALLEL_WORKERS", "LIPSYNC_PARALLEL_WORKERS"):
            os.environ.pop(key, None)

    @patch.object(config, "CONFIG_JSON_PATH", "/tmp/missing-parallel-workers-config.json")
    def test_defaults_to_four_and_clamps(self):
        os.environ["SCENE_FUSION_PARALLEL_WORKERS"] = "99"
        os.environ["LIPSYNC_PARALLEL_WORKERS"] = "0"
        self.assertEqual(config.get_scene_fusion_parallel_workers(), 8)
        self.assertEqual(config.get_lipsync_parallel_workers(), 1)

    @patch.object(config, "CONFIG_JSON_PATH", "/tmp/missing-parallel-workers-config.json")
    def test_exposed_in_pipeline_config(self):
        os.environ["SCENE_FUSION_PARALLEL_WORKERS"] = "2"
        os.environ["LIPSYNC_PARALLEL_WORKERS"] = "3"
        pipeline_cfg = config.get_pipeline_config()
        self.assertEqual(pipeline_cfg["scene_fusion_parallel_workers"], 2)
        self.assertEqual(pipeline_cfg["lipsync_parallel_workers"], 3)


if __name__ == "__main__":
    unittest.main()