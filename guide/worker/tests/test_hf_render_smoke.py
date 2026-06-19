"""E2E smoke: DSL → TS composer → HyperFrames render MP4 (guide-native HF adapters)."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from worker.pipelines.hyperframes_template import (
    HyperFramesTemplatePipeline,
    _GUIDE_ROOT,
    _lint_blocking_errors,
)


def _guide_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _hf_smoke_dsl() -> dict:
    return {
        "meta": {
            "id": "hf-smoke",
            "name": "HF Render Smoke",
            "type": "test",
            "version": 1,
            "created_at": "2026-01-01",
            "updated_at": "2026-01-01",
            "pipeline_key": "hyperframes_template",
        },
        "globalConfig": {
            "canvas_width": 1080,
            "canvas_height": 1920,
            "fps": 30,
            "bgm_url": "",
            "bgm_volume": 0.3,
            "output_format": "mp4",
            "background_color": "#1d4ed8",
            "brand_color": "#2563eb",
            "transition_enabled": True,
        },
        "variables": [],
        "segments": [
            {
                "id": "seg-1",
                "type": "narration",
                "narration_text": "限时特惠",
                "duration_sec": 2,
                "scene_image_url": "",
                "scene_description": "",
                "camera_shot": "",
                "segment_bgm_url": "",
                "subtitle": {
                    "enabled": True,
                    "style_id": "hf-caption-pill",
                    "position": "bottom",
                    "animation": "fadeIn",
                    "hf_params": {
                        "word_timings": [
                            {"text": "限时", "start": 0.2, "end": 0.9},
                            {"text": "特惠", "start": 0.95, "end": 1.8},
                        ],
                    },
                },
                "transition": {"type": "none", "duration": 0.5},
                "digital_human": {"enabled": False, "position": {"x": 50, "y": 80}, "scale": 100},
                "overlays": [],
                "objects": [],
            }
        ],
    }


def _local_bin(name: str) -> Path:
    return _guide_root() / "node_modules" / ".bin" / name


@unittest.skipIf(
    os.getenv("SKIP_HF_RENDER_SMOKE", "").strip().lower() in {"1", "true", "yes"},
    "SKIP_HF_RENDER_SMOKE is set",
)
@unittest.skipUnless(_local_bin("tsx").exists() and _local_bin("hyperframes").exists(), "hyperframes CLI missing")
class HyperFramesRenderSmokeTests(unittest.TestCase):
    def test_compose_lint_and_render_mp4(self):
        pipeline = HyperFramesTemplatePipeline()
        with tempfile.TemporaryDirectory() as work_dir:
            ctx = type(
                "Ctx",
                (),
                {
                    "work_dir": work_dir,
                    "dsl": _hf_smoke_dsl(),
                    "variables": {},
                },
            )()
            from worker.pipelines import hyperframes_template as module

            module._write_composition(ctx)
            self.assertTrue(Path(work_dir, "index.html").is_file())
            self.assertTrue(Path(work_dir, "hyperframes.json").is_file())

            lint_errors = _lint_blocking_errors(work_dir)
            self.assertEqual(lint_errors, [], lint_errors)

            hf = _local_bin("hyperframes")
            output_path = Path(work_dir) / "final.mp4"
            render = subprocess.run(
                [str(hf), "render", ".", "-o", str(output_path), "-f", "30", "-q", "draft"],
                cwd=work_dir,
                capture_output=True,
                text=True,
                timeout=int(os.getenv("HF_RENDER_SMOKE_TIMEOUT_SEC", "300")),
            )
            self.assertEqual(
                render.returncode,
                0,
                (render.stderr or render.stdout)[-2000:],
            )
            self.assertTrue(output_path.is_file())
            self.assertGreater(output_path.stat().st_size, 10_000)
            self.assertEqual(pipeline.name, "hyperframes_template")
            self.assertEqual(_GUIDE_ROOT, _guide_root())