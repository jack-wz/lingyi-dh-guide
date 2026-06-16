"""Worker error codes for render job failures."""

from __future__ import annotations


def classify_worker_error(exc: BaseException) -> str:
    message = str(exc)
    name = type(exc).__name__

    if name == "JobCancelled" or "取消" in message:
        return "W001"
    if "FFmpeg" in message or "ffmpeg" in message.lower():
        return "W401"
    if "Timeline validation" in message or "时间轴" in message:
        return "W402"
    if "LLM" in message or "api key" in message.lower():
        return "W301"
    if "TTS" in message or "配音" in message:
        return "W302"
    if "数字人" in message or "TalkingHead" in message or "InfiniteTalk" in message:
        return "W303"
    if "场景" in message or "scene" in message.lower():
        return "W304"
    return "W500"


def format_worker_error(exc: BaseException) -> str:
    code = classify_worker_error(exc)
    return f"[{code}] {type(exc).__name__}: {str(exc)}"