from __future__ import annotations

import hashlib
import hmac
import time
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

from app.config import settings

DEFAULT_EXPIRY = 3600 * 4  # 4 hours


def _signing_key() -> bytes:
    secret = settings.internal_api_key or settings.nextauth_secret or "clipforge-dev-key"
    return secret.encode()


def sign_url(path: str, expires_in: int = DEFAULT_EXPIRY) -> str:
    expires = int(time.time()) + expires_in
    message = f"{path}:{expires}"
    sig = hmac.new(_signing_key(), message.encode(), hashlib.sha256).hexdigest()[:32]
    return f"{path}?expires={expires}&sig={sig}"


def verify_signature(path: str, expires: str, sig: str) -> bool:
    try:
        exp = int(expires)
    except (ValueError, TypeError):
        return False

    if time.time() > exp:
        return False

    message = f"{path}:{exp}"
    expected = hmac.new(_signing_key(), message.encode(), hashlib.sha256).hexdigest()[:32]
    return hmac.compare_digest(sig, expected)


def make_signed_media_url(file_path: str, base_url: str | None = None) -> str:
    if not file_path:
        return ""
    media_root = settings.local_media_root
    if file_path.startswith(media_root):
        relative = file_path[len(media_root):]
    else:
        relative = file_path

    if not relative.startswith("/"):
        relative = f"/{relative}"

    media_path = f"/media{relative}"
    signed = sign_url(media_path)
    url_base = base_url or settings.app_url
    return f"{url_base}{signed}"
