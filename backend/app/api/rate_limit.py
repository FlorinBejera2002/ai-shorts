from __future__ import annotations

from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request

from app.config import settings


def _key_func(request: Request) -> str:
    user_id = request.headers.get("x-user-id")
    if user_id:
        return f"user:{user_id}"
    return get_remote_address(request)


limiter = Limiter(
    key_func=_key_func,
    storage_uri=settings.redis_url,
    strategy="fixed-window",
)
