import unittest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from worker.pipelines import PipelineRegistry


class DummyPipeline:
    name = "dummy"
    description = "Dummy pipeline"


class PipelineRegistryTests(unittest.TestCase):
    def test_register_get_and_list_pipelines(self):
        registry = PipelineRegistry()
        pipeline = DummyPipeline()

        registry.register("dummy", pipeline)

        self.assertIs(registry.get("dummy"), pipeline)
        self.assertEqual(
            registry.list_pipelines(),
            [{"key": "dummy", "name": "dummy", "description": "Dummy pipeline"}],
        )

    def test_unknown_pipeline_reports_available_keys(self):
        registry = PipelineRegistry()
        registry.register("dummy", DummyPipeline())

        with self.assertRaisesRegex(ValueError, "Unknown pipeline 'missing'.*dummy"):
            registry.get("missing")


if __name__ == "__main__":
    unittest.main()
