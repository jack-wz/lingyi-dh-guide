"""Smoke import/compile for verify_final_delivery acceptance script."""

import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "verify_final_delivery.py"


class TestVerifyFinalDeliveryScript(unittest.TestCase):
    def test_script_compiles(self):
        proc = subprocess.run(
            [sys.executable, "-m", "py_compile", str(SCRIPT)],
            capture_output=True,
            text=True,
        )
        self.assertEqual(proc.returncode, 0, proc.stderr)

    def test_missing_final_fails(self):
        with tempfile.TemporaryDirectory() as tmp:
            work = Path(tmp) / "job_test-job"
            work.mkdir()
            proc = subprocess.run(
                [sys.executable, str(SCRIPT), "test-job", "--renders-dir", tmp, "--api", "http://127.0.0.1:1"],
                capture_output=True,
                text=True,
            )
            self.assertEqual(proc.returncode, 1)
            payload = json.loads(proc.stdout.strip().splitlines()[-1])
            self.assertEqual(payload["status"], "fail")


if __name__ == "__main__":
    unittest.main()