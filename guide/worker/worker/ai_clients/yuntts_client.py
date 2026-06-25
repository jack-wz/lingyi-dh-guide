"""YunTTS API client - voice cloning and text-to-speech synthesis."""

import time
import os
import json
from typing import Any
import requests
from worker.config import get_yuntts_config, get_prompt, RENDERS_DIR
from worker.provider_errors import ProviderTimeoutError, raise_if_timeout


class YunTTSClient:
    def __init__(self):
        api_key, base_url, default_voice = get_yuntts_config()
        self.base_url = base_url
        self.api_key = api_key
        self.default_voice = default_voice
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
        } if self.api_key else {}
        self.last_error: str = ""

    def _post(self, endpoint, **kwargs):
        url = f"{self.base_url}{endpoint}"
        timeout_s = 120
        try:
            res = requests.post(url, headers=self.headers, timeout=timeout_s, **kwargs)
        except Exception as e:
            raise_if_timeout("YunTTS", f"POST {endpoint}", e, timeout_s)
            raise
        res.raise_for_status()
        return res

    def clone_voice(self, audio_file_path: str, name: str = "voice_clone") -> str:
        """Clone a voice from an audio sample.

        Args:
            audio_file_path: Path to the voice sample audio file
            name: Name for the cloned voice

        Returns:
            voice_id string for subsequent TTS calls, or empty string on failure
        """
        if not self.api_key:
            print("[YunTTS] No API key configured, skipping voice cloning")
            return ""

        try:
            print(f"[YunTTS] Cloning voice: file={audio_file_path}, name={name}")
            file_size = os.path.getsize(audio_file_path)
            print(f"[YunTTS] Audio file size: {file_size} bytes")
            
            # YunTTS requires: 1) MP3/WAV format  2) duration 5-30s
            # Convert and/or trim as needed
            import subprocess
            ext = os.path.splitext(audio_file_path)[1].lower()
            needs_convert = ext in [".m4a", ".aac", ".ogg"]
            
            # Always prepare a trimmed WAV (<=30s) in work_dir
            trim_path = os.path.join(os.path.dirname(audio_file_path), f"tts_clone_{name}.wav")
            trim_args = ["-t", "28"]  # trim to 28 seconds (safe within 5-30 range)
            
            if needs_convert:
                print(f"[YunTTS] Converting {ext} to WAV (max 28s)...")
            else:
                print(f"[YunTTS] Trimming audio to max 28s...")
            
            subprocess.run([
                "ffmpeg", "-y", "-i", audio_file_path, "-ar", "44100", "-ac", "1"
            ] + trim_args + [trim_path], capture_output=True, timeout=60)
            
            if os.path.exists(trim_path) and os.path.getsize(trim_path) > 0:
                audio_file_path = trim_path
                print(f"[【转换后音频】] path: {trim_path}")
                print(f"[【转换后音频】] size: {os.path.getsize(trim_path)} bytes")
            else:
                print(f"[YunTTS] Warning: audio preparation failed, using original file")
            
            with open(audio_file_path, "rb") as f:
                filename = os.path.basename(audio_file_path)
                mime = "audio/wav" if filename.endswith(".wav") else "audio/mpeg"
                files = {"speaker_file": (filename, f, mime)}
                data = {"name": name}
                
                url = f"{self.base_url}/indextts2_cloning"
                print(f"[YunTTS] POST {url}")
                timeout_s = 120
                try:
                    res = requests.post(url, headers=self.headers, files=files, data=data, timeout=timeout_s)
                except Exception as e:
                    raise_if_timeout("YunTTS", "clone voice", e, timeout_s)
                    raise
                
                print(f"[YunTTS] Clone response status: {res.status_code}")
                print(f"[YunTTS] Clone response headers: {dict(res.headers)}")
                
                # Print response body for debugging
                # YunTTS sometimes returns JSON with a UTF-8 BOM; res.json() fails on that.
                try:
                    text = res.content.decode("utf-8-sig")
                    body = json.loads(text)
                    print(f"[YunTTS] Clone response body: {body}")
                except Exception:
                    text = res.text[:500]
                    print(f"[YunTTS] Clone response text: {text}")
                    body = None

                res.raise_for_status()

                content_type = res.headers.get("content-type", "")
                if "audio" in content_type:
                    print("[YunTTS] Clone returned audio directly")
                    return res.headers.get("x-voice-id", "")
                else:
                    if body is None:
                        try:
                            text = res.content.decode("utf-8-sig")
                            body = json.loads(text)
                        except Exception:
                            body = res.json()
                    # Try multiple possible locations for voice_id
                    voice_id = (
                        body.get("voice_id")
                        or body.get("id")
                        or body.get("data", {}).get("id")
                        or body.get("data", {}).get("voice_id")
                        or ""
                    )
                    if voice_id:
                        print(f"[YunTTS] Voice cloned successfully: {voice_id}")
                    else:
                        print(f"[YunTTS] Warning: clone succeeded but no voice_id found in response")
                    return voice_id
        except ProviderTimeoutError:
            raise
        except Exception as e:
            self.last_error = f"{type(e).__name__}: {e}"
            print(f"[YunTTS] Voice cloning failed: {type(e).__name__}: {e}")
            return ""

    def synthesize_speech(self, text: str, voice_id: str, output_path: str = "") -> str:
        """Synthesize speech from text using a cloned voice.

        Args:
            text: Text to synthesize
            voice_id: ID from clone_voice()
            output_path: Where to save the output audio file

        Returns:
            Path to the generated audio file, or empty string on failure
        """
        print(f"[YunTTS] synthesize_speech: text='{text[:50]}...', voice_id={voice_id}, output={output_path}")
        print(f"[YunTTS] API key configured: {bool(self.api_key)}, base_url={self.base_url}")
        
        if not self.api_key:
            print("[YunTTS] No API key configured, skipping TTS")
            return ""

        if not output_path:
            os.makedirs(RENDERS_DIR, exist_ok=True)
            output_path = os.path.join(RENDERS_DIR, f"tts_{int(time.time())}.wav")

        try:
            payload = {
                "text": text,
                "voice": voice_id,
            }
            url = f"{self.base_url}/indextts2_generate"
            print(f"[YunTTS] Sending POST {url}")
            print(f"[YunTTS] Payload: text length={len(text)}, voice={voice_id}")
            timeout_s = 120
            try:
                res = requests.post(url, headers=self.headers, json=payload, timeout=timeout_s)
            except Exception as e:
                raise_if_timeout("YunTTS", "synthesize speech", e, timeout_s)
                raise
            print(f"[YunTTS] Generate response status: {res.status_code}")

            # Print response body for debugging
            content_type = res.headers.get("content-type", "")
            print(f"[YunTTS] Generate content-type: {content_type}")
            
            if "audio" in content_type:
                with open(output_path, "wb") as f:
                    f.write(res.content)
                print(f"[YunTTS] Audio saved to {output_path}, size={len(res.content)} bytes")
                return output_path
            else:
                # Print error details
                try:
                    body = res.json()
                    print(f"[YunTTS] Generate response body: {body}")
                except:
                    print(f"[YunTTS] Generate response text: {res.text[:500]}")
                
                res.raise_for_status()
                
                result = res.json()
                audio_url = (
                    result.get("audio_url")
                    or result.get("url")
                    or result.get("data", {}).get("url")
                    or result.get("data", {}).get("audio_url")
                    or ""
                )
                if audio_url:
                    print(f"[YunTTS] Downloading audio from {audio_url}")
                    timeout_s = 60
                    try:
                        audio_res = requests.get(audio_url, timeout=timeout_s)
                    except Exception as e:
                        raise_if_timeout("YunTTS", "download synthesized audio", e, timeout_s)
                        raise
                    with open(output_path, "wb") as f:
                        f.write(audio_res.content)
                    print(f"[YunTTS] Audio saved to {output_path}, size={len(audio_res.content)} bytes")
                    return output_path

            print("[YunTTS] No audio in response")
            return ""
        except ProviderTimeoutError:
            raise
        except Exception as e:
            self.last_error = f"{type(e).__name__}: {e}"
            print(f"[YunTTS] Speech synthesis failed: {type(e).__name__}: {e}")
            return ""

    def synthesize_edge_tts(self, text: str, output_path: str = "", voice: str = "") -> str:
        """Fallback: use Edge TTS for speech synthesis.

        Args:
            text: Text to synthesize
            output_path: Where to save the output
            voice: Edge TTS voice name (defaults to config.json or zh-CN-XiaoxiaoNeural)

        Returns:
            Path to audio file or empty string
        """
        if not voice:
            _, _, voice = get_yuntts_config()

        if not self.api_key:
            return ""

        if not output_path:
            os.makedirs(RENDERS_DIR, exist_ok=True)
            output_path = os.path.join(RENDERS_DIR, f"tts_edge_{int(time.time())}.wav")

        try:
            payload = {"text": text, "voice": voice, "stream": False}
            res = self._post("/edge_tts", json=payload)
            content_type = res.headers.get("content-type", "")
            if "audio" in content_type:
                with open(output_path, "wb") as f:
                    f.write(res.content)
                return output_path

            # Non-streaming mode returns JSON with audio_url
            try:
                data = res.json()
                audio_url = (
                    data.get("audio_url")
                    or data.get("data", {}).get("audio_url")
                    or ""
                )
                if audio_url:
                    from worker.utils import download_file
                    download_file(audio_url, output_path)
                    return output_path
            except Exception as e:
                print(f"[YunTTS] Parse edge_tts JSON response failed: {e}")
            return ""
        except ProviderTimeoutError:
            raise
        except Exception as e:
            print(f"[YunTTS] Edge TTS fallback failed: {e}")
            return ""

    def synthesize_index_tts(
        self,
        text: str,
        prompt_audio_url: str,
        output_path: str = "",
        prompt_text: str = "",
        stream_mode: bool = False,
        failover_enabled: bool = True,
    ) -> str:
        """IndexTTS-2 zero-shot voice clone + synthesis via /text-to-speech (sync).

        The official IndexTTS-2 endpoint takes a prompt_audio_url (reference voice)
        and synthesizes text in that voice in one call. It does not require a
        separate clone step or voice_id.
        """
        print(
            f"[YunTTS] synthesize_index_tts: text='{text[:50]}...', "
            f"prompt_audio_url={prompt_audio_url}, output={output_path}"
        )

        if not self.api_key:
            print("[YunTTS] No API key configured, skipping TTS")
            return ""

        if not output_path:
            os.makedirs(RENDERS_DIR, exist_ok=True)
            output_path = os.path.join(RENDERS_DIR, f"tts_index_{int(time.time())}.wav")

        try:
            payload: dict[str, Any] = {
                "input": text,
                "prompt_audio_url": prompt_audio_url,
                "stream_mode": stream_mode,
                "failover_enabled": failover_enabled,
            }
            if prompt_text:
                payload["prompt_text"] = prompt_text

            url = f"{self.base_url}/text-to-speech"
            print(f"[YunTTS] Sending POST {url}")
            print(f"[YunTTS] Payload: input length={len(text)}, prompt_audio_url={prompt_audio_url}")
            timeout_s = 120
            try:
                res = requests.post(url, headers=self.headers, json=payload, timeout=timeout_s)
            except Exception as e:
                raise_if_timeout("YunTTS", "IndexTTS-2 text-to-speech", e, timeout_s)
                raise

            content_type = res.headers.get("content-type", "")
            print(f"[YunTTS] text-to-speech status: {res.status_code}, content-type: {content_type}")

            if stream_mode and "audio" in content_type:
                with open(output_path, "wb") as f:
                    f.write(res.content)
                print(f"[YunTTS] Audio saved to {output_path}, size={len(res.content)} bytes")
                return output_path

            # Parse JSON response (stream_mode=false)
            try:
                text_body = res.content.decode("utf-8-sig")
                body = json.loads(text_body)
                print(f"[YunTTS] text-to-speech response body: {body}")
            except Exception:
                print(f"[YunTTS] text-to-speech response text: {res.text[:500]}")
                body = None

            res.raise_for_status()

            if body is None:
                try:
                    text_body = res.content.decode("utf-8-sig")
                    body = json.loads(text_body)
                except Exception:
                    body = res.json()

            audio_url = (
                body.get("audio_url")
                or body.get("url")
                or body.get("data", {}).get("audio_url")
                or body.get("data", {}).get("url")
                or ""
            )
            if audio_url:
                print(f"[YunTTS] Downloading audio from {audio_url}")
                timeout_s = 60
                try:
                    audio_res = requests.get(audio_url, timeout=timeout_s)
                except Exception as e:
                    raise_if_timeout("YunTTS", "download IndexTTS-2 audio", e, timeout_s)
                    raise
                audio_res.raise_for_status()
                with open(output_path, "wb") as f:
                    f.write(audio_res.content)
                print(f"[YunTTS] Audio saved to {output_path}, size={len(audio_res.content)} bytes")
                return output_path

            print("[YunTTS] No audio_url in text-to-speech response")
            return ""
        except ProviderTimeoutError:
            raise
        except Exception as e:
            err_msg = f"{type(e).__name__}: {e}"
            self.last_error = err_msg
            print(f"[YunTTS] IndexTTS-2 text-to-speech failed: {err_msg}")
            return ""

    def synthesize_index_tts_async(
        self,
        text: str,
        prompt_audio_url: str,
        output_path: str = "",
        prompt_text: str = "",
        poll_interval: float = 5.0,
        max_polls: int = 60,
    ) -> str:
        """IndexTTS-2 zero-shot voice clone + synthesis via /indextts2_speech_generate (async).

        Falls back to the async API when the sync endpoint times out or is unavailable.
        """
        print(
            f"[YunTTS] synthesize_index_tts_async: text='{text[:50]}...', "
            f"prompt_audio_url={prompt_audio_url}"
        )

        if not self.api_key:
            print("[YunTTS] No API key configured, skipping TTS")
            return ""

        if not output_path:
            os.makedirs(RENDERS_DIR, exist_ok=True)
            output_path = os.path.join(RENDERS_DIR, f"tts_index_async_{int(time.time())}.wav")

        try:
            payload: dict[str, Any] = {
                "input_text": text,
                "prompt_audio_url": prompt_audio_url,
            }
            if prompt_text:
                payload["prompt_text"] = prompt_text

            url = f"{self.base_url}/indextts2_speech_generate"
            print(f"[YunTTS] Sending POST {url}")
            timeout_s = 60
            try:
                res = requests.post(url, headers=self.headers, json=payload, timeout=timeout_s)
            except Exception as e:
                raise_if_timeout("YunTTS", "IndexTTS-2 speech generate", e, timeout_s)
                raise

            try:
                text_body = res.content.decode("utf-8-sig")
                body = json.loads(text_body)
                print(f"[YunTTS] speech_generate response body: {body}")
            except Exception:
                print(f"[YunTTS] speech_generate response text: {res.text[:500]}")
                body = {}

            res.raise_for_status()
            task_id = body.get("data", {}).get("task_id") or body.get("task_id")
            if not task_id:
                print("[YunTTS] No task_id in speech_generate response")
                return ""

            print(f"[YunTTS] Polling task {task_id}")
            for i in range(max_polls):
                time.sleep(poll_interval)
                status_url = f"{self.base_url}/speech_task_status"
                status_res = requests.post(
                    status_url,
                    headers=self.headers,
                    json={"task_id": task_id},
                    timeout=30,
                )
                try:
                    status_text = status_res.content.decode("utf-8-sig")
                    status_body = json.loads(status_text)
                except Exception:
                    status_body = status_res.json() if status_res.text else {}

                print(f"[YunTTS] task {task_id} status: {status_body}")
                status = status_body.get("data", {}).get("status") or status_body.get("status")
                if status == "completed":
                    audio_url = (
                        status_body.get("data", {}).get("audio_url")
                        or status_body.get("audio_url")
                        or ""
                    )
                    if audio_url:
                        print(f"[YunTTS] Downloading audio from {audio_url}")
                        audio_res = requests.get(audio_url, timeout=60)
                        audio_res.raise_for_status()
                        with open(output_path, "wb") as f:
                            f.write(audio_res.content)
                        print(f"[YunTTS] Audio saved to {output_path}, size={len(audio_res.content)} bytes")
                        return output_path
                    print("[YunTTS] Task completed but no audio_url")
                    return ""
                if status in ("failed", "cancelled"):
                    print(f"[YunTTS] Task {task_id} ended with status={status}")
                    return ""

            print(f"[YunTTS] Task {task_id} polling timed out")
            self.last_error = "IndexTTS-2 async polling timed out"
            return ""
        except ProviderTimeoutError:
            raise
        except Exception as e:
            err_msg = f"{type(e).__name__}: {e}"
            self.last_error = err_msg
            print(f"[YunTTS] IndexTTS-2 async speech generate failed: {err_msg}")
            return ""

    def clone_and_synthesize_with_voice_id(
        self,
        text: str,
        voice_sample_path: str,
        output_path: str,
        voice_name: str = "voice_clone",
        prompt_audio_url: str = "",
    ) -> tuple[str, str]:
        """Clone voice from sample using Index/YunTTS, synthesize speech, return (audio_path, voice_clone_id).

        This is the required path for digital-human narration: we always clone through
        YunTTS and never fall back to Edge TTS, so the rendered voice matches the selected avatar.

        If prompt_audio_url is provided, uses the IndexTTS-2 /text-to-speech zero-shot API
        directly; otherwise falls back to the legacy clone + /indextts2_generate path.
        """
        import time

        if prompt_audio_url:
            print(f"[YunTTS] clone_and_synthesize: using IndexTTS-2 zero-shot, prompt={prompt_audio_url}")
            try:
                path = self.synthesize_index_tts(text, prompt_audio_url, output_path)
                if path:
                    return path, ""
            except ProviderTimeoutError:
                print("[YunTTS] Sync IndexTTS-2 timed out, trying async endpoint")
            print("[YunTTS] Sync IndexTTS-2 failed, trying async endpoint")
            path = self.synthesize_index_tts_async(text, prompt_audio_url, output_path)
            if path:
                return path, ""
            print("[YunTTS] IndexTTS-2 failed, no fallback: Index TTS is required for digital-human voice")
            return "", ""

        print(f"[YunTTS] clone_and_synthesize: sample={voice_sample_path}")
        new_voice_id = self.clone_voice(voice_sample_path, voice_name)
        if not new_voice_id:
            print("[YunTTS] Clone failed, no fallback: Index TTS is required for digital-human voice")
            return "", ""

        # YunTTS cloned voices occasionally need a moment to propagate before generate accepts them.
        time.sleep(1.0)

        # Try the returned voice id, and also the bare UUID in case the API omits the prefix.
        candidates = [new_voice_id]
        if new_voice_id.startswith("uspeech:"):
            candidates.append(new_voice_id[len("uspeech:"):])
        else:
            candidates.append(f"uspeech:{new_voice_id}")

        for voice_id in candidates:
            for attempt in range(1, 4):
                path = self.synthesize_speech(text, voice_id, output_path)
                if path:
                    # Return the voice id that actually worked.
                    return path, voice_id
                print(f"[YunTTS] Synthesis attempt {attempt}/3 failed for voice={voice_id}")
                if attempt < 3:
                    time.sleep(1.5 * attempt)

        print("[YunTTS] Synthesis with cloned voice failed, no fallback: Index TTS is required")
        return "", ""

    def clone_and_synthesize(
        self, text: str, voice_sample_path: str, output_path: str, voice_name: str = "voice_clone"
    ) -> str:
        """Clone voice from sample and synthesize speech in one call.

        This is a convenience method that clones the voice if needed,
        then synthesizes speech. Used as fallback when stored voice_id is invalid.

        Args:
            text: Text to synthesize
            voice_sample_path: Local path to the voice sample audio
            output_path: Where to save the output audio
            voice_name: Name for the cloned voice

        Returns:
            Path to the generated audio file, or empty string on failure
        """
        path, _voice_id = self.clone_and_synthesize_with_voice_id(
            text, voice_sample_path, output_path, voice_name
        )
        return path
