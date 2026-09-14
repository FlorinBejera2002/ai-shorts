import pytest
from pydantic import ValidationError

from app.config import Settings


@pytest.mark.parametrize(
    ("provider", "expected"),
    [
        (None, "auto"),
        ("", "auto"),
        ("auto", "auto"),
        (" AuTo ", "auto"),
        ("Gemini", "gemini"),
        ("\tGEMINI\n", "gemini"),
        ("OpenRouter", "openrouter"),
        (" openrouter ", "openrouter"),
    ],
)
def test_ai_provider_environment_is_normalized_before_validation(
    monkeypatch, provider, expected
):
    if provider is None:
        monkeypatch.delenv("AI_PROVIDER", raising=False)
    else:
        monkeypatch.setenv("AI_PROVIDER", provider)

    assert Settings(_env_file=None).ai_provider == expected


@pytest.mark.parametrize("provider", ["unknown", " Open Router ", " "])
def test_invalid_ai_provider_environment_is_rejected(monkeypatch, provider):
    monkeypatch.setenv("AI_PROVIDER", provider)

    with pytest.raises(ValidationError, match="ai_provider"):
        Settings(_env_file=None)


@pytest.mark.parametrize("provider", [None, 123, True])
def test_non_string_ai_provider_is_rejected(provider):
    with pytest.raises(ValidationError, match="ai_provider"):
        Settings(_env_file=None, ai_provider=provider)
