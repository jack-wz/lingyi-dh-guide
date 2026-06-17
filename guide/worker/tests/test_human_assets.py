import os
import tempfile
import unittest
from unittest import mock

from worker.human_assets import resolve_human_assets_on_segments


class HumanAssetsTests(unittest.TestCase):
    def test_preserves_stage2_generated_scene_over_half_body(self):
        with tempfile.TemporaryDirectory() as work_dir:
            fused_scene = os.path.join(work_dir, "scene_0.png")
            with open(fused_scene, "wb") as handle:
                handle.write(b"png")

            half_body = os.path.join(work_dir, "human_half.png")
            with open(half_body, "wb") as handle:
                handle.write(b"half")

            segments = [
                {
                    "digital_human": {"enabled": True},
                    "scene_image_path": fused_scene,
                }
            ]
            human_photos = {
                "half_body_photo_url": "/uploads/digital-humans/dh_x/half_body.png",
            }

            with mock.patch(
                "worker.human_assets._download_asset",
                side_effect=lambda url, wd, basename, base: {
                    "human_half.png": half_body,
                }.get(basename, ""),
            ):
                resolve_human_assets_on_segments(
                    segments,
                    human_photos,
                    work_dir,
                    "http://127.0.0.1:8000",
                )

            self.assertEqual(segments[0]["scene_image_path"], fused_scene)
            self.assertEqual(segments[0]["human_face_path"], half_body)

    def test_uses_half_body_when_no_generated_scene(self):
        with tempfile.TemporaryDirectory() as work_dir:
            half_body = os.path.join(work_dir, "human_half.png")
            with open(half_body, "wb") as handle:
                handle.write(b"half")

            segments = [{"digital_human": {"enabled": True}}]
            human_photos = {
                "half_body_photo_url": "/uploads/digital-humans/dh_x/half_body.png",
            }

            with mock.patch(
                "worker.human_assets._download_asset",
                side_effect=lambda url, wd, basename, base: half_body if basename == "human_half.png" else "",
            ):
                resolve_human_assets_on_segments(
                    segments,
                    human_photos,
                    work_dir,
                    "http://127.0.0.1:8000",
                )

            self.assertEqual(segments[0]["scene_image_path"], half_body)


if __name__ == "__main__":
    unittest.main()