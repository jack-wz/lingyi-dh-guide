"""Parity checks between worker stage1 and shared composition resolver semantics."""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from worker.stage1_parser import parse_template


class CompositionResolverParityTests(unittest.TestCase):
    def test_objects_are_materialized_as_overlays(self):
        dsl = {
            "globalConfig": {"asset_map": {"logo": "http://cdn/logo.png"}},
            "segments": [
                {
                    "narration_text": "Hello",
                    "duration_sec": 5,
                    "overlays": [],
                    "objects": [
                        {
                            "id": "title-1",
                            "type": "text",
                            "text": "品牌标题",
                            "position": {"x": 50, "y": 20},
                            "scale": 100,
                            "visible": True,
                        },
                        {
                            "id": "logo-1",
                            "type": "logo",
                            "asset_url": "",
                            "asset_key": "logo",
                            "position": {"x": 10, "y": 10},
                            "scale": 80,
                            "visible": True,
                        },
                    ],
                }
            ],
        }
        result = parse_template(dsl, {})
        self.assertEqual(len(result["overlays"]), 2)
        kinds = {item.get("object_type") for item in result["overlays"]}
        self.assertIn("text", kinds)
        self.assertIn("logo", kinds)


if __name__ == "__main__":
    unittest.main()