import unittest

from worker.ass_generator import (
    _ass_to_sec,
    _format_karaoke_from_word_timings,
    _resolve_ass_font,
    _resolve_subtitle_font_family,
    _resolve_subtitle_font_size,
    _sec_to_ass,
    allocate_phrase_timings,
    generate_ass,
    split_narration_phrases,
)
from worker.subtitle_styles import resolve_ass_subtitle_style_id


class TestAssGenerator(unittest.TestCase):
    def test_split_by_punctuation_and_length(self):
        text = "当妈后怎么选奶粉？飞鹤卓睿，懂妈妈更懂宝贝，临床实证很靠谱。"
        phrases = split_narration_phrases(text, max_chars=12)
        self.assertGreater(len(phrases), 1)
        self.assertTrue(all(len(p) <= 14 for p in phrases))
        self.assertEqual("".join(phrases), text)

    def test_allocate_timings_cover_segment(self):
        phrases = ["第一句短。", "第二句稍微长一点点。"]
        timings = allocate_phrase_timings(phrases, 2.0, 6.0)
        self.assertEqual(len(timings), 2)
        self.assertAlmostEqual(timings[0][1], 2.0, places=2)
        self.assertAlmostEqual(timings[-1][2], 8.0, places=2)

    def test_generate_ass_phrase_dialogues(self):
        segments = [
            {
                "narration_text": "当妈后怎么选奶粉？飞鹤卓睿，懂妈妈更懂宝贝。",
                "duration_sec": 5.0,
                "subtitle": {"style": "yellow-highlight", "animation": "fadeIn"},
            }
        ]
        path = "/tmp/test_subtitles_phrase.ass"
        generate_ass(segments, {"canvas_width": 1080, "canvas_height": 1920}, path)
        with open(path, encoding="utf-8-sig") as f:
            content = f.read()
        dialogues = [line for line in content.splitlines() if line.startswith("Dialogue:")]
        self.assertGreaterEqual(len(dialogues), 2)
        self.assertIn(r"{\fad(", dialogues[0])

    def test_time_roundtrip(self):
        self.assertEqual(_sec_to_ass(65.5), "0:01:05.50")
        self.assertAlmostEqual(_ass_to_sec("0:01:05.50"), 65.5, places=2)

    def test_resolve_subtitle_font_size_override(self):
        size = _resolve_subtitle_font_size(
            {"font_size": 96},
            {},
            style_id="default",
            canvas_h=1920,
        )
        self.assertEqual(size, 96)

    def test_generate_ass_uses_custom_font_size(self):
        segments = [
            {
                "narration_text": "大字幕测试。",
                "duration_sec": 4.0,
                "subtitle": {"style_id": "default", "font_size": 88, "animation": "fadeIn"},
            }
        ]
        path = "/tmp/test_subtitles_font_size.ass"
        generate_ass(segments, {"canvas_width": 1080, "canvas_height": 1920}, path)
        with open(path, encoding="utf-8-sig") as f:
            content = f.read()
        self.assertIn(",88,", content)
        self.assertIn("Dialogue:", content)

    def test_generate_ass_yellow_highlight_color(self):
        segments = [
            {
                "narration_text": "今日特价仅需99元。",
                "duration_sec": 4.0,
                "subtitle": {"style_id": "yellow-highlight", "animation": "fadeIn"},
            }
        ]
        path = "/tmp/test_subtitles_yellow.ass"
        generate_ass(segments, {"canvas_width": 1080, "canvas_height": 1920, "subtitle_font_size": 72}, path)
        with open(path, encoding="utf-8-sig") as f:
            content = f.read()
        self.assertIn("&H0000D7FF", content)
        self.assertIn("Dialogue:", content)

    def test_resolve_ass_font_from_brand_pack(self):
        self.assertEqual(_resolve_ass_font({}), "PingFang SC")
        self.assertEqual(
            _resolve_ass_font({"default_font_family": "BiaoXiaoZhiBiaoTiHei"}),
            "BiaoXiaoZhiBiaoTiHei",
        )
        self.assertEqual(
            _resolve_ass_font({"default_font_family": "'PingFang SC', sans-serif"}),
            "PingFang SC",
        )

    def test_resolve_subtitle_font_family_priority(self):
        self.assertEqual(
            _resolve_subtitle_font_family(
                {"font_family": "Noto Sans SC"},
                {"subtitle_font_family": "Source Han Sans SC", "default_font_family": "PingFang SC"},
            ),
            "Noto Sans SC",
        )
        self.assertEqual(
            _resolve_subtitle_font_family(
                {},
                {"subtitle_font_family": "Source Han Sans SC", "default_font_family": "PingFang SC"},
            ),
            "Source Han Sans SC",
        )

    def test_resolve_ass_subtitle_style_hf_fallback(self):
        self.assertEqual(resolve_ass_subtitle_style_id("hf-caption-pill"), "subtitle-card")
        self.assertEqual(resolve_ass_subtitle_style_id("hf-caption-highlight"), "bold-yellow")

    def test_format_karaoke_from_word_timings(self):
        body = _format_karaoke_from_word_timings(
            "限时特惠",
            0.2,
            1.8,
            0.0,
            [
                {"text": "限", "start": 0.2, "end": 0.5},
                {"text": "时", "start": 0.55, "end": 0.8},
                {"text": "特", "start": 0.85, "end": 1.1},
                {"text": "惠", "start": 1.15, "end": 1.5},
            ],
        )
        self.assertIsNotNone(body)
        assert body is not None
        self.assertIn(r"{\k", body)
        self.assertIn("限", body)

    def test_generate_ass_respects_subtitle_position(self):
        segments = [
            {
                "narration_text": "顶部字幕测试。",
                "duration_sec": 4.0,
                "subtitle": {
                    "enabled": True,
                    "style_id": "default",
                    "position": "top",
                    "animation": "fadeIn",
                },
            }
        ]
        path = "/tmp/test_subtitles_top_position.ass"
        generate_ass(segments, {"canvas_width": 1080, "canvas_height": 1920}, path)
        with open(path, encoding="utf-8-sig") as f:
            content = f.read()
        self.assertIn(",8,10,10,", content)

    def test_generate_ass_hf_style_with_karaoke(self):
        segments = [
            {
                "narration_text": "限时特惠",
                "duration_sec": 4.0,
                "subtitle": {
                    "enabled": True,
                    "style_id": "hf-caption-pill",
                    "animation": "fadeIn",
                    "hf_params": {
                        "word_timings": [
                            {"text": "限", "start": 0.2, "end": 0.5},
                            {"text": "时", "start": 0.55, "end": 0.8},
                            {"text": "特", "start": 0.85, "end": 1.1},
                            {"text": "惠", "start": 1.15, "end": 1.5},
                        ],
                        "accent_color": "#2563eb",
                    },
                },
            }
        ]
        path = "/tmp/test_subtitles_hf_karaoke.ass"
        generate_ass(segments, {"canvas_width": 1080, "canvas_height": 1920}, path)
        with open(path, encoding="utf-8-sig") as f:
            content = f.read()
        self.assertIn("Dialogue:", content)
        self.assertIn(r"{\k", content)
        self.assertIn("&H00EB6325", content)  # #2563eb primary override BGR
        self.assertIn(",3,2,2,2,10,10,120,1", content)  # subtitle-card boxed ASS style
        self.assertIn("SecondaryColour", content)

    def test_generate_ass_uses_segment_subtitle_font_family(self):
        segments = [
            {
                "narration_text": "自定义字体。",
                "duration_sec": 4.0,
                "subtitle": {
                    "enabled": True,
                    "style_id": "default",
                    "font_family": "Noto Sans SC",
                    "animation": "fadeIn",
                },
            }
        ]
        path = "/tmp/test_subtitles_font_family.ass"
        generate_ass(segments, {"canvas_width": 1080, "canvas_height": 1920}, path)
        with open(path, encoding="utf-8-sig") as f:
            content = f.read()
        self.assertIn("Style: Style_0,Noto Sans SC,", content)


if __name__ == "__main__":
    unittest.main()