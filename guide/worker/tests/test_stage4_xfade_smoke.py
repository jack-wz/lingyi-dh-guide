"""Smoke: Stage4 FFmpeg xfade + global overlays on synthetic clips."""

from __future__ import annotations

import subprocess
import tempfile
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from worker.stage4_ffmpeg import assemble_final_video


def _make_color_clip(path: Path, color: str, duration: float, size: str = "1080x1920") -> None:
    subprocess.run(
        [
            "ffmpeg", "-hide_banner", "-y",
            "-f", "lavfi", "-i", f"color=c={color}:s={size}:d={duration}:r=30",
            "-f", "lavfi", "-i", f"sine=frequency=440:duration={duration}",
            "-c:v", "libx264", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-shortest",
            str(path),
        ],
        check=True,
        capture_output=True,
        timeout=60,
    )


@unittest.skipUnless(
    subprocess.run(["ffmpeg", "-version"], capture_output=True).returncode == 0,
    "ffmpeg not available",
)
class Stage4XfadeSmokeTests(unittest.TestCase):
    def test_assemble_with_hf_dissolve_and_vignette(self):
        with tempfile.TemporaryDirectory() as work_dir:
            clips = []
            for index, color in enumerate(["red", "green", "blue", "yellow"]):
                clip_path = Path(work_dir) / f"clip_{index}.mp4"
                _make_color_clip(clip_path, color, 1.2)
                clips.append(str(clip_path))

            segments = []
            narrations = ["第一镜", "第二镜", "第三镜", "第四镜"]
            for index, (clip, text) in enumerate(zip(clips, narrations)):
                tts_path = Path(work_dir) / f"tts_{index}.wav"
                subprocess.run(
                    [
                        "ffmpeg", "-hide_banner", "-y",
                        "-f", "lavfi", "-i", "sine=frequency=440:duration=1.2",
                        str(tts_path),
                    ],
                    check=True,
                    capture_output=True,
                    timeout=30,
                )
                transition = (
                    {"type": "hf-dissolve", "duration": 0.35}
                    if index < len(clips) - 1
                    else {"type": "none", "duration": 0.5}
                )
                segments.append({
                    "id": f"s{index}",
                    "duration_sec": 1.2,
                    "clip_path": clip,
                    "tts_audio_path": str(tts_path),
                    "narration_text": text,
                    "subtitle": {
                        "enabled": True,
                        "style_id": "bold-yellow" if index % 2 == 0 else "hf-caption-highlight",
                        "position": "bottom",
                    },
                    "transition": transition,
                })

            global_config = {
                "canvas_width": 1080,
                "canvas_height": 1920,
                "fps": 30,
                "transition_enabled": True,
                "hf_overlays": [
                    {"type": "hf-vignette", "enabled": True, "intensity": 0.65},
                ],
            }
            output_path = str(Path(work_dir) / "final.mp4")
            assemble_final_video(segments, [], global_config, work_dir, output_path)

            self.assertTrue(Path(output_path).exists())
            self.assertGreater(Path(output_path).stat().st_size, 10_000)
            ass_path = Path(work_dir) / "subtitles.ass"
            self.assertTrue(ass_path.exists())
            ass_text = ass_path.read_text(encoding="utf-8")
            self.assertIn("第一镜", ass_text)
            self.assertFalse((Path(work_dir) / "base_ffmpeg.mp4").exists())


if __name__ == "__main__":
    unittest.main()