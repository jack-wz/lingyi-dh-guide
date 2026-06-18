import unittest
from unittest.mock import patch

from worker.scene_fusion import scene_fusion_role_prefix
from worker.stage2_scene_gen import (
    _SCENE_FUSION_CONSTRAINTS,
    _scene_fusion_prompt,
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


if __name__ == "__main__":
    unittest.main()