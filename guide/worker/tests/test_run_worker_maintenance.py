import unittest
import sys
import types
from pathlib import Path
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

fake_requests = types.SimpleNamespace(get=Mock(), post=Mock())
with patch.dict(sys.modules, {"requests": fake_requests}):
    import run_worker


class WorkerTimeoutMaintenanceTests(unittest.TestCase):
    def test_run_timeout_maintenance_posts_timeout_sweep(self):
        response = Mock()
        response.status_code = 200
        response.json.return_value = {"timed_out": 2, "job_ids": ["job-a", "job-b"]}

        with patch.object(run_worker.requests, "post", return_value=response) as post:
            with patch.object(run_worker, "print"):
                ok = run_worker.run_timeout_maintenance(timeout_ms=1234)

        self.assertTrue(ok)
        post.assert_called_once_with(
            f"{run_worker.SERVER_URL}/api/renders/maintenance/timeouts",
            json={"timeout_ms": 1234},
            timeout=10,
        )

    def test_run_timeout_maintenance_does_not_interrupt_worker_on_http_failure(self):
        response = Mock()
        response.status_code = 503
        response.json.return_value = {}

        with patch.object(run_worker.requests, "post", return_value=response):
            with patch.object(run_worker, "print"):
                ok = run_worker.run_timeout_maintenance(timeout_ms=1234)

        self.assertFalse(ok)


class HeartbeatTests(unittest.TestCase):
    def test_heartbeat_posts_worker_id(self) -> None:
        response = Mock()
        response.status_code = 200
        response.json.return_value = {"cancel_requested": False}

        with patch.object(run_worker.requests, "post", return_value=response) as post:
            cancelled = run_worker.heartbeat("job-abc")

        self.assertFalse(cancelled)
        post.assert_called_once_with(
            f"{run_worker.SERVER_URL}/api/renders/job-abc/heartbeat",
            json={"worker_id": run_worker.WORKER_ID},
            timeout=10,
        )

    def test_heartbeat_returns_cancel_when_server_requests(self) -> None:
        response = Mock()
        response.status_code = 200
        response.json.return_value = {"cancel_requested": True}

        with patch.object(run_worker.requests, "post", return_value=response):
            self.assertTrue(run_worker.heartbeat("job-cancel"))

    def test_heartbeat_swallows_network_errors(self) -> None:
        with patch.object(run_worker.requests, "post", side_effect=OSError("connection reset")):
            self.assertFalse(run_worker.heartbeat("job-net"))

if __name__ == "__main__":
    unittest.main()