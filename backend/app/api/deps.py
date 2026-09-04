from __future__ import annotations

import hmac
import uuid

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.account_deletion_request import AccountDeletionRequest
from app.models.user import User


async def get_authenticated_user(
    x_internal_api_key: str | None = Header(default=None),
    x_user_id: str | None = Header(default=None),
    x_user_email: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
) -> User:
    if settings.internal_api_key and not hmac.compare_digest(
        (x_internal_api_key or "").encode(), settings.internal_api_key.encode()
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid internal API key",
        )
    if (
        settings.app_env.lower() not in {"development", "test", "testing"}
        and not settings.internal_api_key
    ):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Internal API key is required in this environment",
        )

    # An explicit identity is authoritative. In particular, a stale session
    # after account deletion must never fall through to email auto-provisioning
    # and recreate the account under a different ID.
    if x_user_id is not None:
        try:
            user_id = uuid.UUID(x_user_id)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid X-User-Id header",
            ) from exc
        user = await db.get(User, user_id)
        if user:
            return user
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authenticated user no longer exists",
        )

    if x_user_email:
        result = await db.execute(select(User).where(User.email == x_user_email))
        user = result.scalar_one_or_none()
        if user:
            return user
        # Email-only provisioning is a local development convenience, never a
        # production/internal authentication side effect.
        if settings.app_env != "development":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required",
            )
        user = User(
            email=x_user_email,
            name=x_user_email.split("@", 1)[0],
            provider="header-dev",
            credits=settings.default_free_credits,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        return user

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication required",
    )


async def ensure_account_active(db: AsyncSession, user_id: uuid.UUID) -> None:
    """Reject work after the durable account-deletion marker is present."""
    deletion_request = await db.get(AccountDeletionRequest, user_id)
    if deletion_request:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Account deletion is pending",
        )


async def get_current_user(
    x_internal_api_key: str | None = Header(default=None),
    x_user_id: str | None = Header(default=None),
    x_user_email: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
) -> User:
    user = await get_authenticated_user(
        x_internal_api_key=x_internal_api_key,
        x_user_id=x_user_id,
        x_user_email=x_user_email,
        db=db,
    )
    await ensure_account_active(db, user.id)
    return user
