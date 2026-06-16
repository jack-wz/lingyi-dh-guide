import unittest
from unittest.mock import patch

from worker.timeline_sync import validate_job_after_assembly


class TestTimelineValidatePipeline(unittest.TestCase):
    def test_disabled_skips(self):
        result = validate_job_after_assembly("/tmp/job_x", enabled=False)
        self.assertIsNone(result)

    def test_fail_raises(self):
        audit = {
            "job_id": "x",
            "status": "fail",
            "segment_count": 0,
            "issues": ["no segments found"],
            "warnings": [],
        }
        with patch("worker.timeline_sync.audit_render_job", return_value=audit):
            with self.assertRaisesRegex(RuntimeError, "Timeline validation failed"):
                validate_job_after_assembly("/tmp/job_x", job_id="x")

    def test_warn_ok_by_default(self):
        audit = {
            "job_id": "x",
            "status": "warn",
            "segment_count": 4,
            "total_duration_sec": 30.0,
            "issues": [],
            "warnings": ["subtitle coverage ends at 10.00s"],
        }
        with patch("worker.timeline_sync.audit_render_job", return_value=audit):
            result = validate_job_after_assembly("/tmp/job_x", strict=False)
        self.assertEqual(result["status"], "warn")

    def test_strict_warn_raises(self):
        audit = {
            "job_id": "x",
            "status": "warn",
            "segment_count": 4,
            "issues": [],
            "warnings": ["subtitle coverage ends at 10.00s"],
        }
        with patch("worker.timeline_sync.audit_render_job", return_value=audit):
            with self.assertRaisesRegex(RuntimeError, "strict"):
                validate_job_after_assembly("/tmp/job_x", strict=True)


if __name__ == "__main__":
    unittest.main()