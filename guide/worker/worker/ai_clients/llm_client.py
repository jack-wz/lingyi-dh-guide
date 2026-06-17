"""Generic OpenAI-compatible LLM client for script/scene generation."""

import json
from typing import Any

import requests

from worker.config import get_llm_config


class LLMClient:
    """Minimal OpenAI-compatible chat client (DeepSeek / OpenAI)."""

    def __init__(
        self,
        base_url: str | None = None,
        api_key: str | None = None,
        model: str | None = None,
        timeout: int = 120,
        fast: bool = False,
    ):
        cfg_key, cfg_base, cfg_model = get_llm_config(fast=fast)
        self.base_url = (base_url or cfg_base).rstrip("/")
        self.api_key = api_key or cfg_key
        self.model = model or cfg_model
        self.timeout = timeout

    def chat(self, system_prompt: str, user_prompt: str, temperature: float = 0.7) -> str:
        """Call the chat completions endpoint and return the assistant message content."""
        if not self.api_key:
            raise RuntimeError("LLM API key is not configured")

        res = requests.post(
            f"{self.base_url}/chat/completions",
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": self.model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                "temperature": temperature,
            },
            timeout=self.timeout,
        )
        res.raise_for_status()
        data = res.json()
        return data["choices"][0]["message"]["content"]

    def generate_json(self, system_prompt: str, user_prompt: str, temperature: float = 0.5) -> dict[str, Any]:
        """Call the LLM and parse the response as JSON."""
        content = self.chat(system_prompt, user_prompt, temperature)
        cleaned = content.strip()
        if cleaned.startswith("```"):
            cleaned = "\n".join(cleaned.split("\n")[1:])
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3].strip()
        return json.loads(cleaned)


llm_client = LLMClient()