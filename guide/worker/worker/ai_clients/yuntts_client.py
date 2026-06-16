"""YunTTS API client - voice cloning and text-to-speech synthesis."""

import time
import os
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
                try:
                    body = res.json()
                    print(f"[YunTTS] Clone response body: {body}")
                except:
                    print(f"[YunTTS] Clone response text: {res.text[:500]}")
                
                res.raise_for_status()
                
                content_type = res.headers.get("content-type", "")
                if "audio" in content_type:
                    print("[YunTTS] Clone returned audio directly")
                    return res.headers.get("x-voice-id", "")
                else:
                    result = res.json()
                    # Try multiple possible locations for voice_id
                    voice_id = (
                        result.get("voice_id")
                        or result.get("id")
                        or result.get("data", {}).get("id")
                        or result.get("data", {}).get("voice_id")
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
        print(f"[YunTTS] clone_and_synthesize: sample={voice_sample_path}")
        
        # Step 1: Clone voice
        new_voice_id = self.clone_voice(voice_sample_path, voice_name)
        if not new_voice_id:
            print("[YunTTS] Clone failed, trying Edge TTS fallback")
            return self.synthesize_edge_tts(text, output_path)

        # Step 2: Synthesize with new voice
        return self.synthesize_speech(text, new_voice_id, output_path)
