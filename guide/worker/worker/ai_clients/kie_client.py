"""KIE API client - GPT Image 2 图生图.

API docs: https://docs.kie.ai/cn/market/gpt/gpt-image-2-image-to-image
Task query: https://docs.kie.ai/cn/market/common/get-task-detail
"""

import json
import os
import time
from collections.abc import Callable

import requests
from worker.config import _load_json, get_kie_config, get_prompt
from worker.scene_fusion import build_scene_fusion_input_urls
from worker.provider_errors import ProviderTimeoutError, raise_if_timeout

KIE_UPLOAD_BASE = os.getenv("KIE_UPLOAD_BASE", "https://kieai.redpandaai.co")

KIE_AVATAR_MODEL_ALIASES: dict[str, str] = {
    "infinitetalk": "infinitalk/from-audio",
    "infinite-talk": "infinitalk/from-audio",
    "infinitalk/from-audio": "infinitalk/from-audio",
}


def _resolve_kie_avatar_model_id(model: str) -> str:
    raw = (model or "infinitalk/from-audio").strip()
    return KIE_AVATAR_MODEL_ALIASES.get(raw.lower(), raw)


class KieClient:
    def __init__(self):
        api_key, base_url = get_kie_config()
        self.base_url = base_url
        self.api_key = api_key
        self.upload_base = KIE_UPLOAD_BASE
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        } if self.api_key else {}

    def _post(self, endpoint, **kwargs):
        url = f"{self.base_url}{endpoint}"
        timeout_s = 60
        try:
            res = requests.post(url, headers=self.headers, timeout=timeout_s, **kwargs)
        except Exception as e:
            raise_if_timeout("KIE", f"POST {endpoint}", e, timeout_s)
            raise
        res.raise_for_status()
        return res.json()

    def _get(self, endpoint, **kwargs):
        url = f"{self.base_url}{endpoint}"
        timeout_s = 30
        try:
            res = requests.get(url, headers=self.headers, timeout=timeout_s, **kwargs)
        except Exception as e:
            raise_if_timeout("KIE", f"GET {endpoint}", e, timeout_s)
            raise
        res.raise_for_status()
        return res.json()

    def upload_local_file(self, local_path: str, upload_path: str = "pixelle-preview") -> str:
        """Upload a local file to KIE storage and return a public fileUrl."""
        if not self.api_key or not local_path or not os.path.exists(local_path):
            return ""
        file_name = os.path.basename(local_path)
        timeout_s = 120
        try:
            with open(local_path, "rb") as handle:
                res = requests.post(
                    f"{self.upload_base}/api/file-stream-upload",
                    headers={"Authorization": f"Bearer {self.api_key}"},
                    files={"file": (file_name, handle)},
                    data={"uploadPath": upload_path, "fileName": file_name},
                    timeout=timeout_s,
                )
            res.raise_for_status()
            payload = res.json()
            data = payload.get("data") or {}
            file_url = data.get("fileUrl") or data.get("downloadUrl") or data.get("url") or ""
            if file_url and (payload.get("success") or payload.get("code") == 200):
                return str(file_url)
            print(f"[KIE] Upload response missing public URL: {payload}")
            return ""
        except Exception as exc:
            print(f"[KIE] Upload failed for {local_path}: {exc}")
            return ""

    def _aspect_ratio(self, override: str | None = None) -> str:
        if override:
            return override
        cfg = _load_json().get("models", {}).get("kie", {})
        return str(cfg.get("aspect_ratio") or "9:16")

    def _resolution(self) -> str:
        cfg = _load_json().get("models", {}).get("kie", {})
        return str(cfg.get("resolution") or "2K")

    def _poll_timeout(self) -> int:
        cfg = _load_json().get("models", {}).get("kie", {})
        try:
            return int(cfg.get("poll_timeout") or 300)
        except (TypeError, ValueError):
            return 300

    def generate_text_image(
        self,
        prompt: str,
        aspect_ratio: str = "9:16",
        resolution: str = "2K",
    ) -> str:
        """Generate scene image from text via KIE GPT Image 2 文生图."""
        if not self.api_key:
            print("[KIE] No API key configured, skipping text-to-image")
            return ""
        if not prompt.strip():
            return ""
        try:
            payload = {
                "model": "gpt-image-2-text-to-image",
                "input": {
                    "prompt": prompt,
                    "aspect_ratio": aspect_ratio,
                    "resolution": resolution,
                },
            }
            result = self._post("/api/v1/jobs/createTask", json=payload)
            code = result.get("code", 0)
            if code != 200:
                print(f"[KIE] Text-to-image task failed: code={code}, msg={result.get('msg', '')}")
                return ""
            task_id = result.get("data", {}).get("taskId", "")
            if not task_id:
                return ""
            print(f"[KIE] Text-to-image task created: {task_id}")
            return self._poll_task(task_id)
        except ProviderTimeoutError:
            raise
        except Exception as exc:
            print(f"[KIE] Text-to-image failed: {exc}")
            return ""

    def generate_scene_image(
        self,
        reference_image_url: str = "",
        human_image_url: str = "",
        *,
        scene_image_url: str = "",
        digital_human_image_url: str = "",
        prompt: str = "",
        aspect_ratio: str = "9:16",
        resolution: str = "2K",
    ) -> str:
        """Generate scene image via KIE GPT Image 2 图生图.

        input_urls order follows pipeline.scene_fusion_input_order (default scene_first):
          scene_first → [0] 编辑器资产库分镜, [1] 数字人资源库
          human_first → [0] 数字人资源库, [1] 编辑器资产库分镜
        Prompt 图1/图2 labels are kept in sync via scene_fusion_role_prefix().

        Endpoint: POST /api/v1/jobs/createTask
        """
        scene_url = (scene_image_url or reference_image_url or "").strip()
        dh_url = (digital_human_image_url or human_image_url or "").strip()

        if not self.api_key:
            print("[KIE] No API key configured, skipping scene generation")
            return ""
        if not scene_url:
            print("[KIE] No scene image provided, skipping")
            return ""

        try:
            input_urls = build_scene_fusion_input_urls(scene_url, dh_url)
            if not input_urls:
                return ""

            payload = {
                "model": "gpt-image-2-image-to-image",
                "input": {
                    "prompt": prompt or get_prompt(
                        "scene_image_default",
                        "将数字人融入分镜场景：严格保持数字人五官与服装一致；"
                        "参照分镜场景图的镜头视角、表情、场景与姿势生成新图；移除不必要元素。",
                    ),
                    "input_urls": input_urls,
                    "aspect_ratio": aspect_ratio,
                    "resolution": resolution,
                },
            }

            result = self._post("/api/v1/jobs/createTask", json=payload)

            code = result.get("code", 0)
            if code != 200:
                print(f"[KIE] Create task failed: code={code}, msg={result.get('msg', '')}")
                return ""

            task_id = result.get("data", {}).get("taskId", "")
            if not task_id:
                print("[KIE] No taskId in response")
                return ""

            print(f"[KIE] Task created: {task_id}")
            return self._poll_task(task_id, timeout=self._poll_timeout())

        except ProviderTimeoutError:
            raise
        except Exception as e:
            print(f"[KIE] Scene generation failed: {e}")
            return ""

    def generate_infinitetalk_video(
        self,
        image_url: str,
        audio_url: str,
        model: str = "infinitalk/from-audio",
        resolution: str = "480p",
        prompt: str = "",
        seed: int | None = None,
        poll_timeout: int | None = None,
    ) -> str:
        """Generate talking-head video via KIE InfiniteTalk (infinitalk/from-audio)."""
        if not self.api_key:
            print("[KIE] No API key configured, skipping InfiniteTalk")
            return ""
        if not image_url or not audio_url:
            print("[KIE] InfiniteTalk requires image_url and audio_url")
            return ""

        model_id = _resolve_kie_avatar_model_id(model)
        try:
            avatar_prompt = (prompt or get_prompt(
                "avatar_infinitetalk",
                "自然口播，轻微头部动作和表情，电商导购短视频风格",
            )).strip()
            if len(avatar_prompt) > 5000:
                avatar_prompt = avatar_prompt[:5000]
                print("[KIE] InfiniteTalk prompt truncated to 5000 chars")

            input_payload: dict[str, object] = {
                "image_url": image_url,
                "audio_url": audio_url,
                "resolution": resolution or "480p",
                "prompt": avatar_prompt,
            }
            if seed is not None and seed >= 0:
                input_payload["seed"] = seed

            payload = {
                "model": model_id,
                "input": input_payload,
            }
            result = None
            for create_attempt in range(1, 4):
                result = self._post("/api/v1/jobs/createTask", json=payload)
                code = result.get("code", 0)
                if code == 200:
                    break
                msg = str(result.get("msg", ""))
                print(
                    f"[KIE] InfiniteTalk createTask attempt {create_attempt}/3 "
                    f"failed: code={code}, msg={msg}"
                )
                retriable = code >= 500 or "timeout" in msg.lower() or "try again" in msg.lower()
                if not retriable or create_attempt >= 3:
                    return ""
                time.sleep(5 * create_attempt)
            else:
                return ""

            code = result.get("code", 0)
            if code != 200:
                return ""

            task_id = result.get("data", {}).get("taskId", "")
            if not task_id:
                print("[KIE] InfiniteTalk: no taskId in response")
                return ""

            print(f"[KIE] InfiniteTalk task created: {task_id} model={model_id}")
            timeout = poll_timeout if poll_timeout is not None else self._poll_timeout()
            return self._poll_task(task_id, timeout=timeout)
        except ProviderTimeoutError:
            raise
        except Exception as exc:
            print(f"[KIE] InfiniteTalk failed: {exc}")
            return ""

    def create_human_model(self, photo_urls: list[str]) -> str:
        """Create digital human model from photos.

        NOTE: KIE Market API 没有独立的人像建模接口，
        这里用同一图生图模型生成一张干净的人物形象照。
        生产环境建议对接 KIE 专用数字人 API。
        """
        if not self.api_key:
            print("[KIE] No API key configured, skipping human model creation")
            return ""
        if not photo_urls:
            return ""

        try:
            payload = {
                "model": "gpt-image-2-image-to-image",
                "input": {
                    "prompt": get_prompt("human_model", "生成一张高质量的人物形象照，背景干净，适合作为数字人形象"),
                    "input_urls": [photo_urls[0]],
                    "aspect_ratio": "1:1",
                    "resolution": "2K",
                },
            }

            result = self._post("/api/v1/jobs/createTask", json=payload)
            code = result.get("code", 0)
            if code != 200:
                print(f"[KIE] Human model task failed: code={code}")
                return ""

            task_id = result.get("data", {}).get("taskId", "")
            if task_id:
                return self._poll_task(task_id, timeout=self._poll_timeout())
            return ""
        except ProviderTimeoutError:
            raise
        except Exception as e:
            print(f"[KIE] Human model creation failed: {e}")
            return ""

    def _poll_task(
        self,
        task_id: str,
        timeout: int = 300,
        *,
        on_tick: Callable[[], None] | None = None,
    ) -> str:
        """Poll KIE task via GET /api/v1/jobs/recordInfo?taskId={taskId}.

        States: waiting -> queuing -> generating -> success/fail
        Result: data.resultJson = '{"resultUrls": ["url1", ...]}'
        """
        start = time.time()
        interval = 3

        while time.time() - start < timeout:
            time.sleep(interval)
            if on_tick:
                try:
                    on_tick()
                except Exception:
                    pass
            try:
                result = self._get("/api/v1/jobs/recordInfo", params={"taskId": task_id})

                code = result.get("code", 0)
                if code != 200:
                    msg = str(result.get("msg", ""))
                    print(f"[KIE] Poll code={code}: {msg}")
                    if code >= 500 or "timeout" in msg.lower():
                        interval = min(interval * 1.2, 15)
                    continue

                data = result.get("data", {})
                state = data.get("state", "")

                if state == "success":
                    result_json = data.get("resultJson", "")
                    if result_json:
                        parsed = json.loads(result_json)
                        urls = parsed.get("resultUrls", [])
                        if urls:
                            print(f"[KIE] Task done: {urls[0][:80]}...")
                            return urls[0]
                    print(f"[KIE] Task {task_id} success but no resultUrls")
                    return ""
                elif state == "fail":
                    fail_msg = data.get("failMsg", "unknown")
                    fail_code = data.get("failCode", "")
                    raise RuntimeError(f"KIE task failed: [{fail_code}] {fail_msg}")
                else:
                    elapsed = int(time.time() - start)
                    print(f"[KIE] Task {task_id}: {state} ({elapsed}s)")

                interval = min(interval * 1.2, 15)

            except (RuntimeError, ProviderTimeoutError):
                raise
            except Exception as e:
                print(f"[KIE] Poll error (will retry): {e}")

        raise ProviderTimeoutError("KIE", f"poll task {task_id}", timeout)
