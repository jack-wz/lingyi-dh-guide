import importlib
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from worker.provider_errors import ProviderTimeoutError, is_timeout_exception


class ReadTimeout(Exception):
    pass


class FakeResponse:
    def raise_for_status(self):
        return None

    def json(self):
        return {"code": 200, "data": {"state": "generating"}}


class ProviderTimeoutTests(unittest.TestCase):
    def test_timeout_exception_detection_is_sdk_agnostic(self):
        self.assertTrue(is_timeout_exception(TimeoutError("local timeout")))
        self.assertTrue(is_timeout_exception(ReadTimeout("provider timeout")))
        self.assertFalse(is_timeout_exception(RuntimeError("provider failed")))

    def test_kie_request_timeout_is_normalized(self):
        fake_requests = types.SimpleNamespace(
            post=lambda *args, **kwargs: (_ for _ in ()).throw(ReadTimeout("slow upstream")),
            get=lambda *args, **kwargs: FakeResponse(),
        )

        with patch.dict(sys.modules, {"requests": fake_requests}):
            module = importlib.import_module("worker.ai_clients.kie_client")
            module = importlib.reload(module)
            client = module.KieClient()
            client.api_key = "test-key"

            with self.assertRaisesRegex(ProviderTimeoutError, "KIE provider timeout"):
                client._post("/api/v1/jobs/createTask", json={})

    def test_kie_poll_total_timeout_is_normalized(self):
        fake_requests = types.SimpleNamespace(
            post=lambda *args, **kwargs: FakeResponse(),
            get=lambda *args, **kwargs: FakeResponse(),
        )

        with patch.dict(sys.modules, {"requests": fake_requests}):
            module = importlib.import_module("worker.ai_clients.kie_client")
            module = importlib.reload(module)
            client = module.KieClient()
            client.api_key = "test-key"

            with patch("worker.ai_clients.kie_client.time.sleep", return_value=None):
                with patch("worker.ai_clients.kie_client.time.time", side_effect=[0, 0, 0, 2]):
                    with self.assertRaisesRegex(ProviderTimeoutError, "poll task task-1"):
                        client._poll_task("task-1", timeout=1)


if __name__ == "__main__":
    unittest.main()
