import asyncio
import base64
import hashlib
import hmac
import json
import time
from typing import ClassVar

import pytest
from app.api import upload
from app.api.upload import (
    consume_upload_nonce,
    validate_direct_upload_headers,
    verify_upload_token,
)
from fastapi import HTTPException

SECRET = "a-dedicated-upload-secret-longer-than-thirty-two-characters"


def token(payload: dict[str, object], secret: str = SECRET) -> str:
    encoded = (
        base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode())
        .decode()
        .rstrip("=")
    )
    signature = (
        base64.urlsafe_b64encode(
            hmac.new(secret.encode(), encoded.encode(), hashlib.sha256).digest()
        )
        .decode()
        .rstrip("=")
    )
    return f"{encoded}.{signature}"


def valid_payload() -> dict[str, object]:
    return {
        "version": 1,
        "userId": "16fd2706-8baf-433b-82eb-8c7fada847da",
        "nonce": "a" * 32,
        "expiresAt": 1_000_300,
        "fileName": "launch.mp4",
        "fileSize": 1024,
        "contentType": "video/mp4",
    }


def test_accepts_valid_bound_upload_claims() -> None:
    assert (
        verify_upload_token(token(valid_payload()), secret=SECRET, now=1_000_000)
        == valid_payload()
    )


@pytest.mark.parametrize("mutation", ["expired", "extra", "oversize", "bad-user"])
def test_rejects_invalid_upload_claims(mutation: str) -> None:
    payload = valid_payload()
    if mutation == "expired":
        payload["expiresAt"] = 999_999
    elif mutation == "extra":
        payload["admin"] = True
    elif mutation == "oversize":
        payload["fileSize"] = 3 * 1024**3
    else:
        payload["userId"] = "not-a-user"
    with pytest.raises(ValueError):
        verify_upload_token(token(payload), secret=SECRET, now=1_000_000)


def test_rejects_tampered_upload_token() -> None:
    signed = token(valid_payload())
    with pytest.raises(ValueError):
        verify_upload_token(f"{signed[:-1]}x", secret=SECRET, now=1_000_000)


def test_direct_upload_headers_must_match_signed_file() -> None:
    validate_direct_upload_headers(
        valid_payload(), content_length="1024", content_type="video/mp4"
    )

    with pytest.raises(ValueError, match="size"):
        validate_direct_upload_headers(
            valid_payload(), content_length="1025", content_type="video/mp4"
        )
    with pytest.raises(ValueError, match="content type"):
        validate_direct_upload_headers(
            valid_payload(), content_length="1024", content_type="video/webm"
        )
    with pytest.raises(ValueError, match="Content-Length"):
        validate_direct_upload_headers(
            valid_payload(), content_length=None, content_type="video/mp4"
        )


def test_upload_nonce_is_claimed_only_once(monkeypatch) -> None:
    class FakeRedis:
        claimed: ClassVar[set[str]] = set()

        @classmethod
        def from_url(cls, *_args, **_kwargs):
            return cls()

        async def set(self, key, _value, **_kwargs):
            if key in self.claimed:
                return None
            self.claimed.add(key)
            return True

        async def aclose(self):
            return None

    monkeypatch.setattr(upload, "Redis", FakeRedis)
    payload = valid_payload()
    payload["expiresAt"] = int(time.time()) + 300

    asyncio.run(consume_upload_nonce(payload))
    with pytest.raises(HTTPException) as error:
        asyncio.run(consume_upload_nonce(payload))
    assert error.value.status_code == 401
