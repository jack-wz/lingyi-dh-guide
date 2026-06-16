"""Utility functions for ffprobe, file handling, etc."""

import json
import os
import subprocess
from pathlib import Path


def ffprobe(path: str) -> dict:
    """Run ffprobe on a media file and return parsed JSON."""
    result = subprocess.run(
        [
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-show_entries", "stream=index,codec_type,width,height,duration",
            "-of", "json",
            str(path),
        ],
        capture_output=True, text=True, timeout=30,
    )
    if result.returncode != 0:
        raise RuntimeError(f"ffprobe failed: {result.stderr}")
    return json.loads(result.stdout)


def get_duration(path: str, codec_type: str = None) -> float:
    """Get duration of a media file in seconds."""
    data = ffprobe(path)
    if codec_type:
        for stream in data.get("streams", []):
            if stream.get("codec_type") == codec_type and stream.get("duration"):
                return float(stream["duration"])
    return float(data.get("format", {}).get("duration") or 0)


def has_audio_stream(path: str) -> bool:
    """Check if a media file has an audio stream."""
    try:
        data = ffprobe(path)
        return any(s.get("codec_type") == "audio" for s in data.get("streams", []))
    except Exception:
        return False


def ensure_dir(path: str):
    """Ensure a directory exists."""
    os.makedirs(path, exist_ok=True)


def download_file(url: str, dest_path: str) -> str:
    """Download a file from URL to local path."""
    import requests
    res = requests.get(url, timeout=120, stream=True)
    res.raise_for_status()
    ensure_dir(os.path.dirname(dest_path))
    with open(dest_path, "wb") as f:
        for chunk in res.iter_content(chunk_size=8192):
            f.write(chunk)
    return dest_path


def resolve_url(base_url: str, url_or_path: str) -> str:
    """Resolve a potentially relative URL against a base URL."""
    if not url_or_path:
        return ""
    if url_or_path.startswith(("http://", "https://", "/")):
        return url_or_path
    return f"{base_url.rstrip('/')}/{url_or_path.lstrip('/')}"


def check_ffmpeg():
    """Check if ffmpeg is available."""
    try:
        result = subprocess.run(["ffmpeg", "-version"], capture_output=True, text=True, timeout=5)
        return result.returncode == 0
    except Exception:
        return False
