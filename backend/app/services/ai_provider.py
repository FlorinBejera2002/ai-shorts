from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import httpx

from app.config import settings

ProviderName = Literal["gemini", "openrouter"]


class AIProviderNotConfigured(ValueError):
    pass


@dataclass(frozen=True)
class AISelection:
    provider: ProviderName
    api_key: str
    model: str


def resolve_ai_selection(
    provider: str | None = None,
    api_key: str | None = None,
    model_name: str | None = None,
) -> AISelection:
    selected = (provider or settings.ai_provider).strip().lower()
    if selected == "auto":
        selected = (
            "openrouter"
            if not settings.gemini_api_key and settings.openrouter_api_key
            else "gemini"
        )
    if selected not in {"gemini", "openrouter"}:
        raise AIProviderNotConfigured("AI provider is not configured")

    if selected == "openrouter":
        return AISelection(
            provider="openrouter",
            api_key=(api_key or settings.openrouter_api_key).strip(),
            model=(model_name or settings.openrouter_model_name).strip(),
        )
    return AISelection(
        provider="gemini",
        api_key=(api_key or settings.gemini_api_key).strip(),
        model=(model_name or settings.gemini_model_name).strip(),
    )


def generate_text(
    prompt: str,
    selection: AISelection,
    *,
    http_client: httpx.Client | None = None,
) -> str:
    if not selection.api_key or not selection.model:
        raise AIProviderNotConfigured("AI provider is not configured")
    if selection.provider == "gemini":
        from google import genai

        client = genai.Client(api_key=selection.api_key)
        response = client.models.generate_content(
            model=selection.model,
            contents=prompt,
            config={"response_mime_type": "application/json"},
        )
        return response.text or ""
    return _generate_with_openrouter(prompt, selection, http_client=http_client)


def _generate_with_openrouter(
    prompt: str,
    selection: AISelection,
    *,
    http_client: httpx.Client | None,
) -> str:
    own_client = http_client is None
    client = http_client or httpx.Client(timeout=90, follow_redirects=False)
    try:
        response = client.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {selection.api_key}",
                "Content-Type": "application/json",
                "HTTP-Referer": settings.app_url,
                "X-Title": settings.app_name,
            },
            json={
                "model": selection.model,
                "messages": [{"role": "user", "content": prompt}],
            },
        )
        if response.status_code != 200 or len(response.content) > 2 * 1024 * 1024:
            raise RuntimeError("AI provider rejected the request")
        payload = response.json()
        choices = payload.get("choices") if isinstance(payload, dict) else None
        if not isinstance(choices, list) or not choices:
            raise RuntimeError("AI provider returned an invalid response")
        message = choices[0].get("message") if isinstance(choices[0], dict) else None
        content = message.get("content") if isinstance(message, dict) else None
        if not isinstance(content, str) or not content.strip():
            raise RuntimeError("AI provider returned no text")
        return content.strip()
    except (httpx.HTTPError, ValueError) as exc:
        raise RuntimeError("AI provider is temporarily unavailable") from exc
    finally:
        if own_client:
            client.close()
