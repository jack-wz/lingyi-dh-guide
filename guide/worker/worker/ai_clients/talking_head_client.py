"""Talking head video generation client - WaveSpeed InfiniteTalk."""

import os
import time
import requests
from worker.config import get_wavespeed_config
from worker.provider_errors import ProviderTimeoutError, raise_if_timeout

DEFAULT_MAX_ATTEMPTS = int(os.getenv("WAVESPEED_MAX_ATTEMPTS", "3"))
DEFAULT_RETRY_BACKOFF = float(os.getenv("WAVESPEED_RETRY_BACKOFF", "2.0"))


def _is_retriable_http_error(exc: Exception) -> bool:
    response = getattr(exc, "response", None)
    if response is None:
        return False
    return int(getattr(response, "status_code", 0) or 0) >= 500


class TalkingHeadClient:
    def __init__(self, server_base_url: str = ""):
        api_key, base_url = get_wavespeed_config()
        self.base_url = base_url
        self.api_key = api_key
        self.server_base_url = server_base_url
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
        } if self.api_key else {}
        self.json_headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        } if self.api_key else {}

    def upload_file(self, file_path: str, max_attempts: int = DEFAULT_MAX_ATTEMPTS) -> str:
        """Upload a local file to WaveSpeed and return the download URL."""
        if not self.api_key:
            print("[TalkingHead] No API key configured")
            return ""

        if not os.path.exists(file_path):
            print(f"[TalkingHead] File not found: {file_path}")
            return ""

        for attempt in range(1, max_attempts + 1):
            try:
                file_size = os.path.getsize(file_path)
                print(f"[TalkingHead] Uploading file (attempt {attempt}/{max_attempts}): {file_path} ({file_size} bytes)")
                url = f"{self.base_url}/api/v3/media/upload/binary"
                with open(file_path, "rb") as f:
                    timeout_s = 120
                    try:
                        res = requests.post(
                            url,
                            headers={"Authorization": f"Bearer {self.api_key}"},
                            files={"file": (os.path.basename(file_path), f)},
                            timeout=timeout_s,
                        )
                    except Exception as e:
                        raise_if_timeout("WaveSpeed", "upload media", e, timeout_s)
                        raise
                print(f"[TalkingHead] Upload response status: {res.status_code}")
                res.raise_for_status()
                result = res.json()
                print(f"[TalkingHead] Upload response: {result}")

                download_url = result.get("data", {}).get("download_url", "")
                if download_url:
                    print(f"[TalkingHead] File uploaded: {download_url}")
                    return download_url
                print(f"[TalkingHead] Upload attempt {attempt} returned empty download_url")
            except ProviderTimeoutError:
                if attempt >= max_attempts:
                    raise
                print(f"[TalkingHead] Upload timed out on attempt {attempt}, retrying...")
            except requests.HTTPError as e:
                if _is_retriable_http_error(e) and attempt < max_attempts:
                    print(f"[TalkingHead] Upload HTTP {e.response.status_code} on attempt {attempt}, retrying...")
                else:
                    print(f"[TalkingHead] File upload failed: {type(e).__name__}: {e}")
                    return ""
            except Exception as e:
                if attempt < max_attempts:
                    print(f"[TalkingHead] Upload error on attempt {attempt}: {type(e).__name__}: {e}")
                else:
                    print(f"[TalkingHead] File upload failed: {type(e).__name__}: {e}")
                    return ""

            if attempt < max_attempts:
                time.sleep(DEFAULT_RETRY_BACKOFF ** (attempt - 1))

        return ""

    def generate(
        self,
        audio_path: str,
        image_url: str,
        voice_id: str = "",
        output_path: str = "",
    ) -> str:
        """Adapter-compatible generation entrypoint.

        Downloads the resulting video to output_path when provided.
        """
        video_url = self.generate_talking_video(
            image_path_or_url=image_url,
            audio_path_or_url=audio_path,
            duration=5.0,
        )
        if not video_url:
            return ""
        if output_path:
            from worker.utils import download_file
            try:
                download_file(video_url, output_path)
                return output_path
            except Exception as e:
                print(f"[TalkingHead] Download result failed: {e}")
                return ""
        return video_url

    def generate_talking_video(
        self,
        image_path_or_url: str,
        audio_path_or_url: str,
        duration: float = 5.0,
        max_attempts: int = DEFAULT_MAX_ATTEMPTS,
    ) -> str:
        """Generate a talking-head video from a face image and audio."""
        print(f"[TalkingHead] generate: image={image_path_or_url}, audio={audio_path_or_url}, duration={duration}")
        print(f"[TalkingHead] API key configured: {bool(self.api_key)}, base_url={self.base_url}")

        if not self.api_key:
            print("[TalkingHead] No API key configured, skipping talking head generation")
            return ""

        last_error: Exception | None = None
        for attempt in range(1, max_attempts + 1):
            try:
                video_url = self._generate_talking_video_once(
                    image_path_or_url=image_path_or_url,
                    audio_path_or_url=audio_path_or_url,
                    duration=duration,
                )
                if video_url:
                    if attempt > 1:
                        print(f"[TalkingHead] Succeeded on attempt {attempt}/{max_attempts}")
                    return video_url
                print(f"[TalkingHead] Attempt {attempt}/{max_attempts} returned empty result")
            except ProviderTimeoutError as exc:
                last_error = exc
                print(f"[TalkingHead] Attempt {attempt}/{max_attempts} timed out: {exc}")
            except requests.HTTPError as exc:
                if _is_retriable_http_error(exc) and attempt < max_attempts:
                    last_error = exc
                    print(f"[TalkingHead] Attempt {attempt}/{max_attempts} HTTP error: {exc}")
                else:
                    print(f"[TalkingHead] Talking video generation failed: {type(exc).__name__}: {exc}")
                    return ""
            except Exception as exc:
                print(f"[TalkingHead] Talking video generation failed: {type(exc).__name__}: {exc}")
                return ""

            if attempt < max_attempts:
                backoff = DEFAULT_RETRY_BACKOFF ** (attempt - 1)
                print(f"[TalkingHead] Retrying in {backoff:.1f}s...")
                time.sleep(backoff)

        if last_error:
            print(f"[TalkingHead] Exhausted retries: {last_error}")
        return ""

    def _generate_talking_video_once(
        self,
        image_path_or_url: str,
        audio_path_or_url: str,
        duration: float,
    ) -> str:
        image_url = image_path_or_url
        if os.path.exists(image_path_or_url):
            print("[TalkingHead] Uploading local image...")
            image_url = self.upload_file(image_path_or_url)
            if not image_url:
                print("[TalkingHead] Image upload failed")
                return ""

        audio_url = audio_path_or_url
        if os.path.exists(audio_path_or_url):
            print("[TalkingHead] Uploading local audio...")
            audio_url = self.upload_file(audio_path_or_url)
            if not audio_url:
                print("[TalkingHead] Audio upload failed")
                return ""

        payload = {
            "image": image_url,
            "audio": audio_url,
            "resolution": "480p",
            "seed": -1,
        }
        submit_url = f"{self.base_url}/api/v3/wavespeed-ai/infinitetalk"
        print(f"[TalkingHead] Submitting task to {submit_url}")
        print(f"[TalkingHead] Payload: {payload}")
        timeout_s = 60
        try:
            res = requests.post(
                submit_url,
                headers=self.json_headers,
                json=payload,
                timeout=timeout_s,
            )
        except Exception as e:
            raise_if_timeout("WaveSpeed", "submit talking-head task", e, timeout_s)
            raise
        print(f"[TalkingHead] Submit response status: {res.status_code}")
        res.raise_for_status()
        result = res.json()
        print(f"[TalkingHead] Submit response: {result}")

        task_id = ""
        if "data" in result and isinstance(result["data"], dict):
            task_id = result["data"].get("id", "")
        if not task_id:
            task_id = result.get("id", result.get("task_id", ""))

        if not task_id:
            print("[TalkingHead] No task ID in response")
            return ""

        print(f"[TalkingHead] Task created: {task_id}")
        video_url = self._poll_result(task_id, timeout=int(duration * 30 + 300))
        if video_url:
            print(f"[TalkingHead] Video generated: {video_url}")
        return video_url

    def _poll_result(self, task_id: str, timeout: int = 300) -> str:
        """Poll task result until completion."""
        start = time.time()
        poll_interval = 5
        result_url = f"{self.base_url}/api/v3/predictions/{task_id}/result"
        
        while time.time() - start < timeout:
            time.sleep(poll_interval)
            try:
                timeout_s = 30
                try:
                    res = requests.get(
                        result_url,
                        headers={"Authorization": f"Bearer {self.api_key}"},
                        timeout=timeout_s,
                    )
                except Exception as e:
                    raise_if_timeout("WaveSpeed", f"poll talking-head task {task_id}", e, timeout_s)
                    raise
                res.raise_for_status()
                result = res.json()
                
                data = result.get("data", {})
                status = data.get("status", "")
                print(f"[TalkingHead] Task {task_id}: {status} ({int(time.time()-start)}s)")
                
                if status in ("completed", "succeeded", "done"):
                    outputs = data.get("outputs", [])
                    if outputs and isinstance(outputs, list) and len(outputs) > 0:
                        return outputs[0] if isinstance(outputs[0], str) else outputs[0].get("url", "")
                    return ""
                elif status in ("failed", "error"):
                    error = data.get("error", "unknown")
                    print(f"[TalkingHead] Task failed: {error}")
                    return ""
                    
            except ProviderTimeoutError:
                raise
            except Exception as e:
                print(f"[TalkingHead] Poll error (will retry): {e}")
            
            poll_interval = min(poll_interval * 1.2, 15)

        raise ProviderTimeoutError("WaveSpeed", f"poll talking-head task {task_id}", timeout)
