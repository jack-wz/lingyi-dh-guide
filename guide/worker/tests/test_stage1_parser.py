import unittest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from worker.stage1_parser import parse_template


class ParseTemplateTests(unittest.TestCase):
    def test_substitutes_variables_and_computes_timeline(self):
        dsl = {
            "meta": {"name": "Demo"},
            "globalConfig": {"fps": 30},
            "variables": [
                {"name": "brand", "default_value": "Acme"},
                {"name": "city"},
            ],
            "segments": [
                {
                    "narration_text": "Welcome to {brand} in {city}",
                    "scene_image_url": "/assets/{brand}.png",
                    "duration_sec": 4,
                    "overlays": [
                        {
                            "id": "badge",
                            "asset_url": "/badge.png",
                            "seg_start_time": 1,
                            "duration": 10,
                            "position": {"x": 20, "y": 30},
                            "scale": 80,
                            "animation": "fadeIn",
                        }
                    ],
                },
                {
                    "narration_text": "Goodbye {brand}",
                    "duration_sec": 2.5,
                    "overlays": [],
                },
            ],
        }

        result = parse_template(dsl, {"city": "Shanghai"})

        self.assertEqual(result["resolved_variables"], {"brand": "Acme", "city": "Shanghai"})
        self.assertEqual(result["total_duration"], 6.5)
        self.assertEqual(result["segments"][0]["narration_text"], "Welcome to Acme in Shanghai")
        self.assertEqual(result["segments"][0]["scene_image_url"], "/assets/Acme.png")
        self.assertEqual(result["segments"][0]["start_time"], 0.0)
        self.assertEqual(result["segments"][0]["end_time"], 4.0)
        self.assertEqual(result["segments"][1]["start_time"], 4.0)
        self.assertEqual(result["segments"][1]["end_time"], 6.5)
        self.assertEqual(result["overlays"][0]["global_start_s"], 1.0)
        self.assertEqual(result["overlays"][0]["global_end_s"], 4.0)

    def test_asset_key_overlays_resolve_from_global_asset_map(self):
        result = parse_template(
            {
                "globalConfig": {
                    "asset_map": {"logo": "http://cdn/logo.png"},
                },
                "segments": [
                    {
                        "narration_text": "Hello",
                        "duration_sec": 3,
                        "overlays": [
                            {
                                "id": "logo",
                                "asset_key": "logo",
                                "seg_start_time": 0,
                                "duration": 3,
                                "position": {"x": 50, "y": 10},
                                "scale": 100,
                                "animation": "none",
                            }
                        ],
                    }
                ],
            },
            {},
        )
        self.assertEqual(result["overlays"][0]["asset_url"], "http://cdn/logo.png")

    def test_missing_variables_resolve_to_empty_strings(self):
        result = parse_template(
            {
                "variables": [{"name": "missing"}],
                "segments": [{"narration_text": "Hello {missing}", "duration_sec": 1}],
            },
            {},
        )

        self.assertEqual(result["segments"][0]["narration_text"], "Hello ")
        self.assertEqual(result["total_duration"], 1.0)

    def test_editor_objects_are_materialized_as_timeline_overlays(self):
        result = parse_template(
            {
                "variables": [{"name": "brand", "default_value": "Acme"}],
                "segments": [
                    {
                        "narration_text": "Hello {brand}",
                        "scene_description": "Intro for {brand}",
                        "duration_sec": 6,
                        "objects": [
                            {
                                "id": "brand-title",
                                "type": "text",
                                "label": "{brand} title",
                                "text": "Welcome to {brand}",
                                "position": {"x": 25, "y": 75},
                                "scale": 120,
                                "rotation": 8,
                                "style": {"fill": "#1d4ed8", "textColor": "#ffffff"},
                            },
                            {
                                "id": "hidden-logo",
                                "type": "logo",
                                "label": "Hidden",
                                "visible": False,
                                "position": {"x": 50, "y": 50},
                                "scale": 100,
                            },
                            {
                                "id": "quiz",
                                "type": "sticker",
                                "label": "Check {brand}",
                                "position": {"x": 60, "y": 40},
                                "scale": 90,
                                "interaction": {
                                    "kind": "single_answer",
                                    "options": ["Use {brand}", "Skip"],
                                    "target_url": "https://example.com/{brand}",
                                },
                            },
                        ],
                    }
                ],
            },
            {},
        )

        self.assertEqual(result["segments"][0]["scene_description"], "Intro for Acme")
        self.assertEqual(result["segments"][0]["objects"][0]["text"], "Welcome to Acme")
        self.assertEqual(result["segments"][0]["objects"][2]["interaction"]["options"][0], "Use Acme")
        self.assertEqual(result["segments"][0]["objects"][2]["interaction"]["target_url"], "https://example.com/Acme")
        self.assertEqual(len(result["overlays"]), 2)
        self.assertEqual(result["overlays"][0]["id"], "brand-title")
        self.assertEqual(result["overlays"][0]["object_type"], "text")
        self.assertEqual(result["overlays"][0]["global_start_s"], 0.0)
        self.assertEqual(result["overlays"][0]["global_end_s"], 6.0)
        self.assertEqual(result["overlays"][0]["rotation"], 8)
        self.assertEqual(result["overlays"][0]["render_width_pct"], 58)
        self.assertEqual(result["overlays"][0]["render_height_pct"], 11)
        self.assertEqual(result["overlays"][1]["interaction"]["kind"], "single_answer")
        self.assertEqual(result["overlays"][1]["render_width_pct"], 52)


if __name__ == "__main__":
    unittest.main()
