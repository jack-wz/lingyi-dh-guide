"""Integration checks: Stage2 passes correct KIE image order + fusion prompt."""

import os
import tempfile
import unittest
from unittest.mock import MagicMock, patch

from worker.scene_fusion import scene_fusion_role_prefix
from worker.stage2_scene_gen import generate_scene_images


class Stage2FusionIntegrationTests(unittest.TestCase):
    def test_kie_receives_scene_first_human_second_and_prompt_excludes_narration(self):
        """input_urls[0]=编辑器资产库分镜；input_urls[1]=数字人资源库；口播不进提示词。"""
        narration = "当妈后怎么天天都这样松弛，我们快来请教请教她"
        captured: dict = {}

        def fake_generate_scene_image(**kwargs):
            captured.update(kwargs)
            return "https://kie.example/generated.png"

        with tempfile.TemporaryDirectory() as work_dir:
            uploads = os.path.join(work_dir, "uploads")
            dh_dir = os.path.join(uploads, "digital-humans", "dh_test")
            os.makedirs(dh_dir, exist_ok=True)
            half_body = os.path.join(dh_dir, "half_body.png")
            scene_ref = os.path.join(uploads, "scene_ref.png")
            open(half_body, "wb").write(b"png")
            open(scene_ref, "wb").write(b"png")

            segments = [
                {
                    "scene_image_url": "/uploads/scene_ref.png",
                    "scene_description": "",
                    "narration_text": narration,
                    "digital_human": {"enabled": True},
                }
            ]
            human_photos = {
                "half_body_photo_url": "/uploads/digital-humans/dh_test/half_body.png",
                "face_photo_url": "",
            }

            mock_kie = MagicMock()
            mock_kie.generate_scene_image.side_effect = fake_generate_scene_image

            with patch("worker.stage2_scene_gen.UPLOADS_DIR", uploads):
                with patch("worker.stage2_scene_gen.KieClient", return_value=mock_kie):
                    with patch(
                        "worker.stage2_scene_gen.resolve_kie_input_url",
                        side_effect=lambda url, *_a, **_k: f"https://kie.cdn/{url}",
                    ):
                        with patch("worker.stage2_scene_gen.download_file"):
                            with patch("worker.stage2_scene_gen.get_prompt") as mock_prompt:
                                mock_prompt.return_value = "CONFIG_DEFAULT_PROMPT"
                                generate_scene_images(
                                    {"segments": segments},
                                    human_photos,
                                    work_dir,
                                    server_base_url="http://127.0.0.1:8000",
                                    strict=False,
                                )

        self.assertEqual(
            captured["scene_image_url"],
            "https://kie.cdn//uploads/scene_ref.png",
            "scene_image_url 应为编辑器资产库分镜",
        )
        self.assertEqual(
            captured["digital_human_image_url"],
            "https://kie.cdn//uploads/digital-humans/dh_test/half_body.png",
            "digital_human_image_url 应为数字人资源库",
        )

        prompt = captured.get("prompt", "")
        self.assertIn(scene_fusion_role_prefix(), prompt)
        self.assertIn("CONFIG_DEFAULT_PROMPT", prompt)
        self.assertNotIn(narration, prompt, "口播 narration_text 不应进入场景融合提示词")

    def test_custom_scene_description_appended_not_narration(self):
        captured: dict = {}

        def fake_generate(**kwargs):
            captured.update(kwargs)
            return "https://kie.example/generated.png"

        with tempfile.TemporaryDirectory() as work_dir:
            uploads = os.path.join(work_dir, "uploads")
            dh_dir = os.path.join(uploads, "digital-humans", "dh_test")
            os.makedirs(dh_dir, exist_ok=True)
            open(os.path.join(dh_dir, "half_body.png"), "wb").write(b"png")
            open(os.path.join(uploads, "scene_ref.png"), "wb").write(b"png")

            segments = [
                {
                    "scene_image_url": "/uploads/scene_ref.png",
                    "scene_description": "商场中景，微笑看向镜头",
                    "narration_text": "口播不应出现",
                    "digital_human": {"enabled": True},
                }
            ]
            mock_kie = MagicMock()
            mock_kie.generate_scene_image.side_effect = fake_generate

            with patch("worker.stage2_scene_gen.UPLOADS_DIR", uploads):
                with patch("worker.stage2_scene_gen.KieClient", return_value=mock_kie):
                    with patch(
                        "worker.stage2_scene_gen.resolve_kie_input_url",
                        side_effect=lambda url, *_a, **_k: f"https://kie.cdn/{url}",
                    ):
                        with patch("worker.stage2_scene_gen.download_file"):
                            generate_scene_images(
                                {"segments": segments},
                                {"half_body_photo_url": "/uploads/digital-humans/dh_test/half_body.png"},
                                work_dir,
                                strict=False,
                            )

        prompt = captured["prompt"]
        self.assertIn("分镜补充：商场中景，微笑看向镜头", prompt)
        self.assertNotIn("口播不应出现", prompt)


if __name__ == "__main__":
    unittest.main()