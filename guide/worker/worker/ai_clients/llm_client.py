"""Generic OpenAI-compatible LLM client for script/scene generation."""

import os
import json
from typing import Any

import requests


class LLMClient:
    """Minimal OpenAI-compatible chat client."""

    def __init__(
        self,
        base_url: str | None = None,
        api_key: str | None = None,
        model: str | None = None,
        timeout: int = 120,
    ):
        self.base_url = (base_url or os.getenv("LLM_BASE_URL", "https://api.openai.com/v1")).rstrip("/")
        self.api_key = api_key or os.getenv("LLM_API_KEY", "")
        self.model = model or os.getenv("LLM_MODEL", "gpt-4o-mini")
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
        # Strip markdown code fences if present
        cleaned = content.strip()
        if cleaned.startswith("```"):
            cleaned = "\n".join(cleaned.split("\n")[1:])
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3].strip()
        return json.loads(cleaned)


llm_client = LLMClient()
