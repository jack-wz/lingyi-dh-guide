import unittest

from worker.ass_generator import (
    _ass_to_sec,
    _resolve_ass_font,
    _resolve_subtitle_font_size,
    _sec_to_ass,
    allocate_phrase_timings,
    generate_ass,
    split_narration_phrases,
)


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


if __name__ == "__main__":
    unittest.main()