"""E2E smoke: brand fonts → ASS → FFmpeg assemble with fontsdir."""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

import worker.config as cfg
from worker.ass_generator import generate_ass
from worker.brand_fonts import prepare_brand_fonts
from worker.stage4_ffmpeg import assemble_final_video
from worker.utils import check_ffmpeg


def _project_guide_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _find_sample_brand_font() -> Path | None:
    fonts_dir = _project_guide_root() / "data" / "uploads" / "fonts"
    if not fonts_dir.is_dir():
        return None
    for name in ("brand-DeyiHei.ttf", "brand-BiaoXiaoZhiBiaoTiHei.ttf"):
        path = fonts_dir / name
        if path.is_file():
            return path
    for path in sorted(fonts_dir.glob("brand-*")):
        if path.suffix.lower() in {".ttf", ".otf"}:
            return path
    return None


def _make_silent_wav(path: str, duration: float = 2.0) -> None:
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "anullsrc=r=44100:cl=mono",
            "-t",
            str(duration),
            path,
        ],
        check=True,
        capture_output=True,
    )


def _make_silent_clip(path: str, duration: float = 2.0, size: str = "1080x1920") -> None:
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-f",
            "lavfi",
            "-i",
            f"color=c=#1d4ed8:s={size}:r=30",
            "-f",
            "lavfi",
            "-i",
            "anullsrc=r=44100:cl=mono",
            "-t",
            str(duration),
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            path,
        ],
        check=True,
        capture_output=True,
    )


@unittest.skipUnless(check_ffmpeg(), "ffmpeg not available")
class TestBrandRenderSmoke(unittest.TestCase):
    def test_assemble_mp4_with_brand_fonts_and_subtitles(self):
        sample_font = _find_sample_brand_font()
        if not sample_font:
            self.skipTest("no brand font files under guide/data/uploads/fonts")

        family = "DeyiHei" if "DeyiHei" in sample_font.name else sample_font.stem.replace("brand-", "")

        with tempfile.TemporaryDirectory() as tmp:
            uploads = os.path.join(tmp, "uploads", "fonts")
            os.makedirs(uploads, exist_ok=True)
            dest_name = sample_font.name
            shutil.copy2(sample_font, os.path.join(uploads, dest_name))

            old_uploads = cfg.UPLOADS_DIR
            cfg.UPLOADS_DIR = os.path.join(tmp, "uploads")
            try:
                work_dir = os.path.join(tmp, "work")
                os.makedirs(work_dir, exist_ok=True)
                clip_path = os.path.join(work_dir, "clip_0.mp4")
                _make_silent_clip(clip_path)
                tts_path = os.path.join(work_dir, "tts_0.wav")
                _make_silent_wav(tts_path, duration=2.0)

                global_config = {
                    "canvas_width": 1080,
                    "canvas_height": 1920,
                    "fps": 30,
                    "default_font_family": family,
                    "brand_pack": {
                        "tokens": {
                            "typography": {
                                "fonts": [
                                    {
                                        "name": family,
                                        "family": family,
                                        "url": f"/uploads/fonts/{dest_name}",
                                    }
                                ]
                            }
                        }
                    },
                }

                segments = [
                    {
                        "id": "seg-1",
                        "narration_text": "欢迎了解零一数字人导购平台，品牌字幕测试。",
                        "duration_sec": 2.0,
                        "clip_path": clip_path,
                        "tts_audio_path": tts_path,
                        "subtitle": {
                            "enabled": True,
                            "style": "default",
                            "animation": "fadeIn",
                        },
                    }
                ]

                from worker.brand_fonts import get_ass_font_name

                manifest = prepare_brand_fonts(global_config, work_dir)
                self.assertIn(family, manifest["family_paths"])

                ass_path = os.path.join(work_dir, "subtitles.ass")
                generate_ass(segments, global_config, ass_path)
                with open(ass_path, encoding="utf-8-sig") as f:
                    ass_text = f.read()
                # ASS must use the libass-compatible internal font name, not the DSL directory name
                ass_font_name = get_ass_font_name(family)
                self.assertRegex(ass_text, rf"Style: [^,]+,{re.escape(ass_font_name)},")

                output_path = os.path.join(work_dir, "final.mp4")
                result = assemble_final_video(segments, [], global_config, work_dir, output_path)
                self.assertTrue(os.path.exists(result))
                self.assertGreater(os.path.getsize(result), 10_000)

                fonts_dir = os.path.join(work_dir, "fonts")
                self.assertTrue(os.path.isdir(fonts_dir))
                self.assertTrue(any(f.endswith((".ttf", ".otf")) for f in os.listdir(fonts_dir)))
            finally:
                cfg.UPLOADS_DIR = old_uploads


if __name__ == "__main__":
    unittest.main()