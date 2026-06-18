"""Local Microsoft Edge TTS — used when YunTTS API is unreachable."""

from __future__ import annotations

import asyncio
import os
import subprocess


def synthesize_local_edge_tts(
    text: str,
    output_path: str,
    *,
    voice: str = "zh-CN-XiaoxiaoNeural",
) -> str:
    """Synthesize speech via edge-tts (library or CLI) and write WAV to output_path."""
    if not text or not output_path:
        return ""

    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    mp3_path = output_path if output_path.endswith(".mp3") else output_path.rsplit(".", 1)[0] + ".mp3"
    wav_path = output_path if output_path.endswith(".wav") else output_path

    try:
        asyncio.run(_save_edge_tts(text, voice, mp3_path))
    except Exception as exc:
        print(f"[LocalEdgeTTS] library failed: {exc}, trying CLI")
        if not _save_edge_tts_cli(text, voice, mp3_path):
            return ""

    if not os.path.exists(mp3_path) or os.path.getsize(mp3_path) == 0:
        return ""

    if wav_path.endswith(".wav"):
        if _mp3_to_wav(mp3_path, wav_path):
            try:
                os.remove(mp3_path)
            except OSError:
                pass
            return wav_path if os.path.exists(wav_path) else ""
    return mp3_path


async def _save_edge_tts(text: str, voice: str, output_path: str) -> None:
    import edge_tts

    communicate = edge_tts.Communicate(text, voice)
    await communicate.save(output_path)


def _save_edge_tts_cli(text: str, voice: str, output_path: str) -> bool:
    try:
        result = subprocess.run(
            ["edge-tts", "--text", text, "--voice", voice, "--write-media", output_path],
            capture_output=True,
            text=True,
            timeout=120,
        )
        return result.returncode == 0 and os.path.exists(output_path)
    except Exception as exc:
        print(f"[LocalEdgeTTS] CLI failed: {exc}")
        return False


def _mp3_to_wav(mp3_path: str, wav_path: str) -> bool:
    try:
        result = subprocess.run(
            [
                "ffmpeg", "-y", "-i", mp3_path,
                "-ar", "44100", "-ac", "1",
                wav_path,
            ],
            capture_output=True,
            text=True,
            timeout=60,
        )
        return result.returncode == 0 and os.path.exists(wav_path) and os.path.getsize(wav_path) > 0
    except Exception as exc:
        print(f"[LocalEdgeTTS] mp3→wav failed: {exc}")
        return False