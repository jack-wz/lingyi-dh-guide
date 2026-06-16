import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from worker.tts_adapter import YunTTSAdapter, tts_registry


class TTSAdapterTests(unittest.TestCase):
    def test_registry_returns_yuntts_adapter(self):
        adapter = tts_registry.get("yuntts")
        self.assertIsInstance(adapter, YunTTSAdapter)

    def test_unknown_provider_raises(self):
        with self.assertRaises(ValueError):
            tts_registry.get("unknown-provider")


if __name__ == "__main__":
    unittest.main()