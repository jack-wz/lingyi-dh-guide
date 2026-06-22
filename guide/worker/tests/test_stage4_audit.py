import json
import os
import tempfile
import unittest
from unittest.mock import patch

from worker.stage4_audit import (
    AuditContext,
    FrameTemplateLensSkill,
    run_stage4_audit,
)


class TestFrameTemplateLensSkill(unittest.TestCase):
    def test_no_frame_templates_is_ok(self):
        ctx = AuditContext(
            work_dir="/tmp",
            synced_segments=[{"frame_template_id": None}],
            dsl={"globalConfig": {"brand_pack": {"frames": []}}},
        )
        result = FrameTemplateLensSkill().run(ctx)
        self.assertEqual(result.status, "ok")

    def test_missing_lens_variable_fails(self):
        ctx = AuditContext(
            work_dir="/tmp",
            synced_segments=[
                {
                    "frame_template_id": "frame-1",
                }
            ],
            dsl={
                "globalConfig": {
                    "brand_pack": {
                        "frames": [
                            {
                                "id": "frame-1",
                                "name": "开场",
                                "variables": ["product_name"],
                            }
                        ]
                    }
                },
                "variables": {},
            },
        )
        result = FrameTemplateLensSkill().run(ctx)
        self.assertEqual(result.status, "fail")
        self.assertTrue(
            any("product_name" in issue for issue in result.issues)
        )

    def test_present_lens_variable_is_ok(self):
        ctx = AuditContext(
            work_dir="/tmp",
            synced_segments=[{"frame_template_id": "frame-1"}],
            dsl={
                "globalConfig": {
                    "brand_pack": {
                        "frames": [
                            {
                                "id": "frame-1",
                                "name": "开场",
                                "variables": ["product_name"],
                            }
                        ]
                    }
                },
                "variables": {"product_name": "飞鹤奶粉"},
            },
        )
        result = FrameTemplateLensSkill().run(ctx)
        self.assertEqual(result.status, "ok")


class TestRunStage4Audit(unittest.TestCase):
    def test_writes_diagnostics_json(self):
        with tempfile.TemporaryDirectory() as tmp:
            manifest = {
                "version": 1,
                "segments": [
                    {
                        "index": 0,
                        "duration_sec": 5.0,
                        "start_time": 0.0,
                        "end_time": 5.0,
                        "clip_path": os.path.join(tmp, "clip_0.mp4"),
                        "tts_audio_path": os.path.join(tmp, "tts_0.wav"),
                        "narration_text": "测试",
                    }
                ],
                "overlays": [],
            }
            with open(os.path.join(tmp, "segments_manifest.json"), "w", encoding="utf-8") as f:
                json.dump(manifest, f)
            open(os.path.join(tmp, "clip_0.mp4"), "wb").close()
            open(os.path.join(tmp, "tts_0.wav"), "wb").close()

            with patch("worker.timeline_sync.get_duration", return_value=5.0):
                result = run_stage4_audit(tmp)

            self.assertIn(result["status"], {"ok", "warn"})
            diag_path = os.path.join(tmp, "diagnostics.json")
            self.assertTrue(os.path.exists(diag_path))
            with open(diag_path, encoding="utf-8") as f:
                diagnostics = json.load(f)
            self.assertEqual(diagnostics["version"], 1)
            self.assertIn("skills", diagnostics)
            self.assertTrue(
                any(s["name"] == "frame_template_lens" for s in diagnostics["skills"])
            )


if __name__ == "__main__":
    unittest.main()
