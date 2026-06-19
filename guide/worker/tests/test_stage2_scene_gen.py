import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from worker.scene_fusion import scene_fusion_role_prefix
from worker.stage2_scene_gen import (
    _SCENE_FUSION_CONSTRAINTS,
    _scene_fusion_prompt,
    generate_scene_images,
)


class Stage2SceneGenTests(unittest.TestCase):
    def test_scene_fusion_prompt_prefers_scene_description(self):
        seg = {
            "scene_description": "商场中景，人物微笑看向镜头",
            "narration_text": "口播文案不应作为提示词",
        }
        prompt = _scene_fusion_prompt(seg)
        self.assertIn(scene_fusion_role_prefix(), prompt)
        self.assertIn("分镜补充：商场中景，人物微笑看向镜头", prompt)
        self.assertIn(_SCENE_FUSION_CONSTRAINTS, prompt)

    @patch("worker.stage2_scene_gen.get_prompt")
    def test_scene_fusion_prompt_falls_back_to_config_default(self, mock_get_prompt):
        mock_get_prompt.return_value = "保持五官服装一致，融合分镜场景"
        seg = {"scene_description": "", "narration_text": "当妈后怎么天天都这样松弛"}
        prompt = _scene_fusion_prompt(seg)
        self.assertIn(scene_fusion_role_prefix(), prompt)
        self.assertIn("保持五官服装一致，融合分镜场景", prompt)
        mock_get_prompt.assert_called_once()

    def test_parallel_scene_fusion_submits_all_segments(self):
        segments = [
            {
                "scene_image_url": f"/uploads/scene_{i}.png",
                "scene_description": "",
                "narration_text": f"口播{i}",
                "digital_human": {"enabled": True},
            }
            for i in range(4)
        ]
        with tempfile.TemporaryDirectory() as work_dir:
            uploads = os.path.join(work_dir, "uploads")
            dh_dir = os.path.join(uploads, "digital-humans", "dh_test")
            os.makedirs(dh_dir, exist_ok=True)
            open(os.path.join(dh_dir, "half_body.png"), "wb").write(b"png")
            for i in range(4):
                open(os.path.join(uploads, f"scene_{i}.png"), "wb").write(b"png")

            with patch("worker.stage2_scene_gen.UPLOADS_DIR", uploads):
                with patch("worker.stage2_scene_gen.get_scene_fusion_parallel_workers", return_value=4):
                    with patch("worker.stage2_scene_gen._generate_scenes_parallel") as mock_parallel:
                        generate_scene_images(
                            {"segments": segments},
                            {"half_body_photo_url": "/uploads/digital-humans/dh_test/half_body.png"},
                            work_dir,
                            strict=False,
                        )
                        mock_parallel.assert_called_once()
                        call_kwargs = mock_parallel.call_args.kwargs
                        self.assertEqual(len(call_kwargs["segments"]), 4)
                        self.assertEqual(call_kwargs["workers"], 4)


if __name__ == "__main__":
    unittest.main()