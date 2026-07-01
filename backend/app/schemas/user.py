from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    name: str | None = None
    avatar_url: str | None = None
    provider: str
    credits: int
    plan: str
    stripe_customer_id: str | None = None
    stripe_subscription_id: str | None = None
    created_at: datetime
    updated_at: datetime


class UserCreate(BaseModel):
    email: str
    name: str | None = None
    provider: str = "credentials"
    provider_id: str | None = None
