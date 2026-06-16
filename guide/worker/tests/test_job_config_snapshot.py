import unittest
import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from worker import config


class JobConfigSnapshotTests(unittest.TestCase):
    def tearDown(self):
        config.set_job_config_snapshot({})

    def test_job_snapshot_overrides_provider_pipeline_and_prompt_config(self):
        with patch.object(config, "CONFIG_JSON_PATH", "/tmp/missing-job-config.json"):
            config.set_job_config_snapshot({
                "models": {
                    "kie": {
                        "api_key": "snapshot-kie-key",
                        "base_url": "https://snapshot.kie",
                    },
                    "yuntts": {
                        "api_key": "snapshot-yuntts-key",
                        "base_url": "https://snapshot.yuntts",
                        "default_voice": "snapshot-voice",
                    },
                    "wavespeed": {
                        "api_key": "snapshot-wave-key",
                        "base_url": "https://snapshot.wave",
                        "model": "infinitetalk-multi",
                        "resolution": "720p",
                    },
                },
                "pipeline": {
                    "poll_interval": 11,
                    "avatar_provider": "kie",
                    "timeline_validate": False,
                    "timeline_validate_strict": True,
                },
                "prompts": {"scene_image_default": "snapshot prompt"},
            })

            self.assertEqual(config.get_kie_config(), ("snapshot-kie-key", "https://snapshot.kie"))
            self.assertEqual(
                config.get_yuntts_config(),
                ("snapshot-yuntts-key", "https://snapshot.yuntts", "snapshot-voice"),
            )
            self.assertEqual(
                config.get_wavespeed_config(),
                ("snapshot-wave-key", "https://snapshot.wave", "infinitetalk-multi", "720p"),
            )
            self.assertEqual(config.get_avatar_provider(), "kie")
            self.assertEqual(config.get_pipeline_config()["avatar_provider"], "kie")
            pipeline_cfg = config.get_pipeline_config()
            self.assertEqual(pipeline_cfg["poll_interval"], 11)
            self.assertFalse(pipeline_cfg["timeline_validate"])
            self.assertTrue(pipeline_cfg["timeline_validate_strict"])
            self.assertEqual(config.get_prompt("scene_image_default"), "snapshot prompt")

            config.set_job_config_snapshot({})
            self.assertNotEqual(config.get_kie_config()[0], "snapshot-kie-key")


if __name__ == "__main__":
    unittest.main()
