import json
import tempfile
from pathlib import Path
from unittest import TestCase
from unittest.mock import patch

from worker.pipelines.hyperframes_template import (
    HyperFramesTemplatePipeline,
    _GUIDE_ROOT,
    _COMPOSER_SCRIPT,
    _lint_blocking_errors,
    _parse_lint_json,
    _validate_hyperframes_output,
)


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
                self.assertTrue(any("tsx" in str(part) for part in args))
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

    def test_parse_lint_json_strips_telemetry_banner(self):
        payload = {
            "errorCount": 1,
            "findings": [{"severity": "error", "code": "gsap_timeline_not_registered", "message": "x"}],
        }
        stdout = (
            "Hyperframes collects anonymous usage data to improve the tool.\n"
            "Disable anytime: hyperframes telemetry disable\n\n"
            + json.dumps(payload)
        )
        parsed = _parse_lint_json(stdout)
        self.assertEqual(parsed["errorCount"], 1)
        self.assertEqual(parsed["findings"][0]["code"], "gsap_timeline_not_registered")

    def test_lint_ignores_guide_native_root_timeline_error(self):
        with tempfile.TemporaryDirectory() as work_dir:
            Path(work_dir, "index.html").write_text(
                '<html><script>var tl = gsap.timeline();</script></html>',
                encoding="utf-8",
            )
            with patch("worker.pipelines.hyperframes_template._run_hyperframes") as run_mock:
                run_mock.return_value = type(
                    "R",
                    (),
                    {
                        "returncode": 1,
                        "stdout": json.dumps(
                            {
                                "errorCount": 1,
                                "findings": [
                                    {
                                        "severity": "error",
                                        "code": "gsap_timeline_not_registered",
                                        "message": "missing root timeline",
                                    }
                                ],
                            }
                        ),
                        "stderr": "",
                    },
                )()
                self.assertEqual(_lint_blocking_errors(work_dir), [])

    def test_validate_hyperframes_output_checks_final_mp4(self):
        with tempfile.TemporaryDirectory() as work_dir:
            output_path = Path(work_dir) / "final.mp4"
            output_path.write_bytes(b"\x00\x00\x00\x18ftypmp42")
            ctx = type(
                "Ctx",
                (),
                {
                    "dsl": {"segments": [{"duration_sec": 2}]},
                },
            )()
            with patch("worker.utils.get_duration", return_value=2.0):
                _validate_hyperframes_output(ctx, str(output_path))
            with patch("worker.utils.get_duration", return_value=0.0):
                with self.assertRaisesRegex(RuntimeError, "unreadable"):
                    _validate_hyperframes_output(ctx, str(output_path))