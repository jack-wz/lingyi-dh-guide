import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from worker.tts_adapter import YunTTSAdapter, tts_registry


class TTSAdapterTests(unittest.TestCase):
    def test_registry_returns_yuntts_adapter(self):
        adapter = tts_registry.get("yuntts")
        self.assertIsInstance(adapter, YunTTSAdapter)

    def test_unknown_provider_raises(self):
        with self.assertRaises(ValueError):
            tts_registry.get("unknown-provider")

    def test_synthesize_fallback_accepts_voice_sample_path(self):
        adapter = YunTTSAdapter()
        with tempfile.TemporaryDirectory() as tmp:
            sample = os.path.join(tmp, "sample.wav")
            out = os.path.join(tmp, "out.wav")
            open(sample, "wb").close()
            with patch.object(
                adapter._client,
                "clone_and_synthesize_with_voice_id",
                return_value=(out, "uspeech:new-voice"),
            ) as mock_clone:
                result = adapter.synthesize_fallback("你好", out, sample)
            mock_clone.assert_called_once()
            self.assertEqual(result, out)

    def test_synthesize_fallback_uses_local_edge_when_remote_fails(self):
        adapter = YunTTSAdapter()
        with tempfile.TemporaryDirectory() as tmp:
            out = os.path.join(tmp, "out.wav")
            with patch.object(adapter._client, "clone_and_synthesize", return_value=""):
                with patch.object(adapter._client, "synthesize_edge_tts", return_value=""):
                    with patch(
                        "worker.local_edge_tts.synthesize_local_edge_tts",
                        return_value=out,
                    ) as mock_local:
                        result = adapter.synthesize_fallback("你好", out, "")
            mock_local.assert_called_once()
            self.assertEqual(result, out)


if __name__ == "__main__":
    unittest.main()