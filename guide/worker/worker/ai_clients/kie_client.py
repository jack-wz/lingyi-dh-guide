"""KIE API client - GPT Image 2 图生图.

API docs: https://docs.kie.ai/cn/market/gpt/gpt-image-2-image-to-image
Task query: https://docs.kie.ai/cn/market/common/get-task-detail
"""

import json
import os
import time
import requests
from worker.config import get_kie_config, get_prompt
from worker.provider_errors import ProviderTimeoutError, raise_if_timeout


class KieClient:
    def __init__(self):
        api_key, base_url = get_kie_config()
        self.base_url = base_url
        self.api_key = api_key
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

    def generate_scene_image(
        self,
        reference_image_url: str,
        human_image_url: str,
        prompt: str = "",
        aspect_ratio: str = "9:16",
        resolution: str = "2K",
    ) -> str:
        """Generate scene image via KIE GPT Image 2 图生图.

        Endpoint: POST /api/v1/jobs/createTask
        """
        if not self.api_key:
            print("[KIE] No API key configured, skipping scene generation")
            return ""
        if not reference_image_url:
            print("[KIE] No reference image provided, skipping")
            return ""

        try:
            input_urls = [reference_image_url]
            if human_image_url:
                input_urls.append(human_image_url)

            payload = {
                "model": "gpt-image-2-image-to-image",
                "input": {
                    "prompt": prompt or get_prompt("scene_image_default", "将这张场景参考图与人物融合，生成一个真实自然的导购场景图"),
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
            return self._poll_task(task_id)

        except ProviderTimeoutError:
            raise
        except Exception as e:
            print(f"[KIE] Scene generation failed: {e}")
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
                return self._poll_task(task_id)
            return ""
        except ProviderTimeoutError:
            raise
        except Exception as e:
            print(f"[KIE] Human model creation failed: {e}")
            return ""

    def _poll_task(self, task_id: str, timeout: int = 300) -> str:
        """Poll KIE task via GET /api/v1/jobs/recordInfo?taskId={taskId}.

        States: waiting -> queuing -> generating -> success/fail
        Result: data.resultJson = '{"resultUrls": ["url1", ...]}'
        """
        start = time.time()
        interval = 3

        while time.time() - start < timeout:
            time.sleep(interval)
            try:
                result = self._get("/api/v1/jobs/recordInfo", params={"taskId": task_id})

                code = result.get("code", 0)
                if code != 200:
                    print(f"[KIE] Poll code={code}: {result.get('msg', '')}")
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
