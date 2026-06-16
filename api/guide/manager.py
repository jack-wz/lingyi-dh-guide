"""Manage embedded guide-platform Express API and render worker."""

from __future__ import annotations

import os
import shutil
import signal
import subprocess
import sys
from pathlib import Path

from loguru import logger

PROJECT_ROOT = Path(__file__).resolve().parents[2]
GUIDE_ROOT = PROJECT_ROOT / "guide"
GUIDE_DATA_DIR = GUIDE_ROOT / "data"


class GuidePlatformManager:
    def __init__(self) -> None:
        self._api_proc: subprocess.Popen | None = None
        self._worker_proc: subprocess.Popen | None = None
        self.enabled = os.getenv("GUIDE_PLATFORM_ENABLED", "true").lower() in {"1", "true", "yes"}
        self.api_port = int(os.getenv("GUIDE_INTERNAL_PORT", "3001"))
        self.api_url = f"http://127.0.0.1:{self.api_port}"

    def _guide_env(self) -> dict[str, str]:
        env = os.environ.copy()
        env["PORT"] = str(self.api_port)
        env["DATA_DIR"] = str(GUIDE_DATA_DIR.resolve())
        env.setdefault("SERVER_URL", os.getenv("PIXELLE_PUBLIC_URL", "http://127.0.0.1:8000"))
        env["DISABLE_RENDER_WORKER"] = "1"
        guide_env = GUIDE_ROOT / ".env"
        if guide_env.exists():
            for line in guide_env.read_text(encoding="utf-8").splitlines():
                trimmed = line.strip()
                if not trimmed or trimmed.startswith("#") or "=" not in trimmed:
                    continue
                key, value = trimmed.split("=", 1)
                key = key.strip()
                value = value.strip().strip("'\"")
                if key:
                    env[key] = value
        return env

    def _npm_cmd(self) -> str:
        return "npm.cmd" if sys.platform == "win32" else "npm"

    def _python_cmd(self) -> str:
        venv = PROJECT_ROOT / ".venv" / "bin" / "python3"
        if venv.exists():
            return str(venv)
        worker_venv = GUIDE_ROOT / "worker" / ".venv" / "bin" / "python3"
        if worker_venv.exists():
            return str(worker_venv)
        return shutil.which("python3") or "python3"

    async def start(self) -> None:
        if not self.enabled:
            logger.info("Guide platform disabled (GUIDE_PLATFORM_ENABLED=false)")
            return
        if not GUIDE_ROOT.exists():
            logger.warning(f"Guide platform not found at {GUIDE_ROOT}")
            return

        GUIDE_DATA_DIR.mkdir(parents=True, exist_ok=True)
        (GUIDE_DATA_DIR / "uploads").mkdir(exist_ok=True)
        (GUIDE_DATA_DIR / "renders").mkdir(exist_ok=True)

        env = self._guide_env()
        server_dir = GUIDE_ROOT / "server"
        if not (server_dir / "node_modules").exists():
            logger.warning("Guide server dependencies missing — run: cd guide && npm install")

        logger.info(f"Starting guide API on :{self.api_port}")
        self._api_proc = subprocess.Popen(
            [self._npm_cmd(), "run", "dev", "--workspace=server"],
            cwd=str(GUIDE_ROOT),
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )

        if os.getenv("GUIDE_WORKER_ENABLED", "true").lower() in {"1", "true", "yes"}:
            logger.info("Starting guide render worker")
            self._worker_proc = subprocess.Popen(
                [self._python_cmd(), "-B", "run_worker.py"],
                cwd=str(GUIDE_ROOT / "worker"),
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
            )

    async def stop(self) -> None:
        for proc in (self._worker_proc, self._api_proc):
            if proc and proc.poll() is None:
                proc.send_signal(signal.SIGTERM)
                try:
                    proc.wait(timeout=8)
                except subprocess.TimeoutExpired:
                    proc.kill()

    @property
    def internal_api_url(self) -> str:
        return self.api_url


guide_manager = GuidePlatformManager()