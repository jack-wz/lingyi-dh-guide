import json
import tempfile
from pathlib import Path
from unittest import TestCase
from unittest.mock import patch

from worker.pipelines.hyperframes_template import HyperFramesTemplatePipeline, _GUIDE_ROOT, _COMPOSER_SCRIPT


class HyperFramesTemplatePipelineTests(TestCase):
    def test_composer_script_exists(self):
        self.assertTrue(_COMPOSER_SCRIPT.exists(), str(_COMPOSER_SCRIPT))
        self.assertTrue((_GUIDE_ROOT / "shared" / "hyperframesComposer.ts").exists())

    def test_pipeline_registers_name(self):
        pipeline = HyperFramesTemplatePipeline()
        self.assertEqual(pipeline.name, "hyperframes_template")

    def test_write_composition_invokes_tsx(self):
        from worker.pipelines import hyperframes_template as module

        with tempfile.TemporaryDirectory() as work_dir:
            ctx = type(
                "Ctx",
                (),
                {
                    "work_dir": work_dir,
                    "dsl": {"meta": {"name": "t"}, "globalConfig": {}, "segments": []},
                    "variables": {"product_name": "飞鹤奶粉"},
                },
            )()
            with patch.object(module.subprocess, "run") as run_mock:
                run_mock.return_value = type("R", (), {"returncode": 0, "stdout": "", "stderr": ""})()
                Path(work_dir, "index.html").write_text("<html></html>", encoding="utf-8")
                module._write_composition(ctx)
                args = run_mock.call_args[0][0]
                self.assertIn("tsx", args)
                self.assertIn(str(_COMPOSER_SCRIPT), args)
                dsl_path = Path(work_dir) / "dsl.json"
                variables_path = Path(work_dir) / "variables.json"
                self.assertTrue(dsl_path.exists())
                self.assertTrue(variables_path.exists())
                json.loads(dsl_path.read_text(encoding="utf-8"))
                self.assertEqual(
                    json.loads(variables_path.read_text(encoding="utf-8")),
                    {"product_name": "飞鹤奶粉"},
                )
                self.assertIn(str(variables_path), args)