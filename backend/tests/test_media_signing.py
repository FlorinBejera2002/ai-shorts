import asyncio
from urllib.parse import urlsplit

import pytest
from app.api.media import verify_media_request
from app.api.clips import _fresh_read_url
from app.config import settings
from app.utils.signed_url import sign_url, verify_signature
from fastapi import HTTPException


def test_nginx_media_authorizer_accepts_only_intact_signed_uri(monkeypatch) -> None:
    monkeypatch.setattr(settings, "internal_api_key", "m" * 32)
    signed_uri = sign_url("/media/clips/user/private.mp4", expires_in=60)

    response = asyncio.run(verify_media_request(x_original_uri=signed_uri))
    assert response.status_code == 204

    with pytest.raises(HTTPException) as error:
        asyncio.run(
            verify_media_request(
                x_original_uri=signed_uri.replace("private.mp4", "other.mp4")
            )
        )
    assert error.value.status_code == 403


def test_production_verification_fails_closed_without_secret(monkeypatch) -> None:
    monkeypatch.setattr(settings, "internal_api_key", "")
    monkeypatch.setattr(settings, "nextauth_secret", "")
    monkeypatch.setattr(settings, "app_env", "production")

    parsed = urlsplit("/media/private.mp4?expires=9999999999&sig=0")
    assert not verify_signature(parsed.path, "9999999999", "0")


def test_authenticated_clip_response_prefers_storage_presigned_url() -> None:
    class PrivateStorage:
        def signed_read_url(self, key, expires_in=14400):
            return f"https://private.example/{key}?fresh=1"

    assert _fresh_read_url(
        PrivateStorage(),
        "clips/job/clip.mp4",
        "https://expired.example/clip.mp4?signature=old",
    ) == "https://private.example/clips/job/clip.mp4?fresh=1"


def test_authenticated_local_clip_response_signs_stable_key(monkeypatch) -> None:
    class LocalStorage:
        def signed_read_url(self, key, expires_in=14400):
            return None

    monkeypatch.setattr(settings, "app_url", "https://app.example")
    monkeypatch.setattr(settings, "internal_api_key", "m" * 32)
    url = _fresh_read_url(LocalStorage(), "clips/job/clip.mp4", None)
    assert url.startswith("https://app.example/media/clips/job/clip.mp4?expires=")
    assert "&sig=" in url
