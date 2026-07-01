from __future__ import annotations

import uuid

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.user import User


async def get_current_user(
    x_internal_api_key: str | None = Header(default=None),
    x_user_id: str | None = Header(default=None),
    x_user_email: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
) -> User:
    if settings.internal_api_key and x_internal_api_key != settings.internal_api_key:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid internal API key",
        )
    if settings.app_env == "production" and not settings.internal_api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Internal API key is required in production",
        )

    if x_user_id:
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

    if x_user_email:
        result = await db.execute(select(User).where(User.email == x_user_email))
        user = result.scalar_one_or_none()
        if user:
            return user
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
        detail="Authentication required. Phase 5 will replace this with NextAuth JWT validation.",
    )
