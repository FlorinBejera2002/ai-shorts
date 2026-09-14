from __future__ import annotations

import json

import httpx
import pytest

from app.services.ai_provider import (
    AISelection,
    generate_text,
    resolve_ai_selection,
)


def test_auto_provider_preserves_gemini_then_uses_openrouter(monkeypatch):
    monkeypatch.setattr(
        "app.services.ai_provider.settings.gemini_api_key", "gemini-key"
    )
    monkeypatch.setattr(
        "app.services.ai_provider.settings.openrouter_api_key", "router-key"
    )
    monkeypatch.setattr("app.services.ai_provider.settings.ai_provider", "auto")
    assert resolve_ai_selection().provider == "gemini"

    monkeypatch.setattr("app.services.ai_provider.settings.gemini_api_key", "")
    selection = resolve_ai_selection()
    assert selection.provider == "openrouter"
    assert selection.api_key == "router-key"


def test_openrouter_generation_uses_requested_model_and_safe_headers():
    def handle(request: httpx.Request) -> httpx.Response:
        assert request.url == "https://openrouter.ai/api/v1/chat/completions"
        assert request.headers["Authorization"] == "Bearer provider-test-secret"
        assert request.headers["X-Title"] == "Sneepcut"
        body = json.loads(request.content)
        assert body == {
            "model": "anthropic/claude-test",
            "messages": [{"role": "user", "content": "Synthetic prompt"}],
        }
        return httpx.Response(
            200,
            json={"choices": [{"message": {"content": '{"ok":true}'}}]},
        )

    with httpx.Client(transport=httpx.MockTransport(handle)) as client:
        result = generate_text(
            "Synthetic prompt",
            AISelection("openrouter", "provider-test-secret", "anthropic/claude-test"),
            http_client=client,
        )
    assert result == '{"ok":true}'


def test_openrouter_failure_does_not_expose_provider_response_or_key():
    def handle(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            429,
            json={"error": "provider-test-secret upstream diagnostics"},
        )

    with (
        httpx.Client(transport=httpx.MockTransport(handle)) as client,
        pytest.raises(RuntimeError) as caught,
    ):
        generate_text(
            "prompt",
            AISelection("openrouter", "provider-test-secret", "test/model"),
            http_client=client,
        )
    assert "provider-test-secret" not in str(caught.value)
