import os
import tempfile
import unittest
from unittest.mock import patch

from worker import config
from worker.config import get_llm_config


class LlmConfigTests(unittest.TestCase):
    def test_get_llm_config_reads_deepseek_defaults(self):
        payload = {
            "models": {
                "llm": {
                    "api_key": "sk-test",
                    "base_url": "https://api.deepseek.com",
                    "model": "deepseek-v4-pro",
                    "model_fast": "deepseek-v4-flash",
                }
            }
        }
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "config.json")
            with open(path, "w", encoding="utf-8") as handle:
                import json

                json.dump(payload, handle)
            with patch.object(config, "CONFIG_JSON_PATH", path):
                self.assertEqual(get_llm_config(), ("sk-test", "https://api.deepseek.com", "deepseek-v4-pro"))
                self.assertEqual(
                    get_llm_config(fast=True),
                    ("sk-test", "https://api.deepseek.com", "deepseek-v4-flash"),
                )


if __name__ == "__main__":
    unittest.main()