import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from worker.stage4_ffmpeg import _compute_overlay_box, _resolve_overlay_asset, _wrap_text, assemble_final_video


class Stage4FFmpegTests(unittest.TestCase):
    def test_missing_ffmpeg_fails_before_assembly_work(self):
        with tempfile.TemporaryDirectory() as work_dir:
            output_path = str(Path(work_dir) / "final.mp4")
            with patch("worker.stage4_ffmpeg.check_ffmpeg", return_value=False):
                with self.assertRaisesRegex(RuntimeError, "FFmpeg is not available"):
                    assemble_final_video([], [], {}, work_dir, output_path)

    def test_editor_object_without_asset_generates_placeholder_png(self):
        with tempfile.TemporaryDirectory() as work_dir:
            asset = _resolve_overlay_asset(
                {
                    "id": "brand-title",
                    "object_type": "text",
                    "text": "Welcome to Acme",
                    "style": {"fill": "#1d4ed8", "textColor": "#ffffff"},
                    "position": {"x": 50, "y": 50},
                    "scale": 100,
                },
                work_dir,
            )

            self.assertTrue(asset.endswith(".png"))
            self.assertTrue(Path(asset).exists())

    def test_chinese_placeholder_uses_renderable_font_pixels(self):
        from PIL import Image

        with tempfile.TemporaryDirectory() as work_dir:
            asset = _resolve_overlay_asset(
                {
                    "id": "cn-title",
                    "object_type": "text",
                    "text": "欢迎了解零一数字人导购平台",
                    "style": {"fill": "#1d4ed8", "textColor": "#ffffff"},
                    "position": {"x": 50, "y": 50},
                    "scale": 100,
                },
                work_dir,
            )

            image = Image.open(asset).convert("RGBA")
            pixels = [image.getpixel((x, y)) for y in range(image.height) for x in range(image.width)]
            white_text_pixels = sum(1 for r, g, b, a in pixels if a > 0 and r > 235 and g > 235 and b > 235)
            self.assertGreater(white_text_pixels, 50)

    def test_interactive_object_without_asset_generates_placeholder_png(self):
        with tempfile.TemporaryDirectory() as work_dir:
            asset = _resolve_overlay_asset(
                {
                    "id": "quiz",
                    "object_type": "sticker",
                    "label": "Question",
                    "interaction": {"kind": "single_answer", "options": ["Yes", "No"]},
                    "position": {"x": 50, "y": 50},
                    "scale": 100,
                },
                work_dir,
            )

            self.assertTrue(Path(asset).exists())

    def test_wrap_text_splits_long_chinese_without_spaces(self):
        from PIL import Image, ImageDraw, ImageFont

        image = Image.new("RGBA", (320, 180), (0, 0, 0, 0))
        draw = ImageDraw.Draw(image)
        font = ImageFont.load_default()
        lines = _wrap_text(
            draw,
            "这是一段没有任何空格的中文长文本用于验证生成占位图时不会横向溢出画布",
            font,
            120,
        )

        self.assertGreater(len(lines), 1)
        self.assertTrue(all(line for line in lines))

    def test_object_overlay_box_uses_object_size_instead_of_full_canvas(self):
        object_box = _compute_overlay_box(
            {
                "scale": 100,
                "position": {"x": 50, "y": 50},
                "render_width_pct": 58,
                "render_height_pct": 11,
            },
            1080,
            1920,
        )
        legacy_box = _compute_overlay_box(
            {"scale": 100, "position": {"x": 50, "y": 50}},
            1080,
            1920,
        )

        self.assertEqual(object_box, (626, 211, 227, 854))
        self.assertEqual(legacy_box, (1080, 1920, 0, 0))


if __name__ == "__main__":
    unittest.main()
