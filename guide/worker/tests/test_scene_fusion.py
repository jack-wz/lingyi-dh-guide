import unittest
from unittest.mock import patch

from worker.scene_fusion import (
    build_scene_fusion_input_urls,
    scene_fusion_role_prefix,
)


class SceneFusionOrderTests(unittest.TestCase):
    @patch("worker.scene_fusion.get_scene_fusion_input_order", return_value="scene_first")
    def test_scene_first_order(self, _mock_order):
        urls = build_scene_fusion_input_urls("https://scene", "https://human")
        self.assertEqual(urls, ["https://scene", "https://human"])
        self.assertIn("input_urls[0]·图1·编辑器资产库", scene_fusion_role_prefix("scene_first"))
        self.assertIn("input_urls[1]·图2·数字人资源库", scene_fusion_role_prefix("scene_first"))

    @patch("worker.scene_fusion.get_scene_fusion_input_order", return_value="human_first")
    def test_human_first_order(self, _mock_order):
        urls = build_scene_fusion_input_urls("https://scene", "https://human")
        self.assertEqual(urls, ["https://human", "https://scene"])
        self.assertIn("input_urls[0]·图1·数字人资源库", scene_fusion_role_prefix("human_first"))


if __name__ == "__main__":
    unittest.main()