from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    Integer,
    String,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint(
            "access_role IN ('member', 'viewer')", name="ck_users_access_role"
        ),
    )

    access_role: Mapped[str] = mapped_column(
        String(20), nullable=False, default="member", server_default="member"
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(
        String(255), unique=True, index=True, nullable=False
    )
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    provider: Mapped[str] = mapped_column(
        String(50), default="credentials", nullable=False
    )
    provider_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    session_version: Mapped[int] = mapped_column(
        Integer, default=0, server_default="0", nullable=False
    )
    email_verified: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    email_activation_required: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false", nullable=False
    )
    credits: Mapped[int] = mapped_column(Integer, default=100, nullable=False)
    plan: Mapped[str] = mapped_column(String(50), default="free", nullable=False)
    stripe_customer_id: Mapped[str | None] = mapped_column(
        String(255), unique=True, nullable=True
    )
    stripe_subscription_id: Mapped[str | None] = mapped_column(
        String(255), unique=True, nullable=True
    )
    stripe_subscription_status: Mapped[str | None] = mapped_column(
        String(50), nullable=True
    )
    stripe_current_period_end: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    stripe_cancel_at_period_end: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false", nullable=False
    )
    stripe_state_event_created: Mapped[int] = mapped_column(
        BigInteger, default=0, server_default="0", nullable=False
    )
    stripe_state_event_priority: Mapped[int] = mapped_column(
        Integer, default=0, server_default="0", nullable=False
    )
    stripe_checkout_generation: Mapped[int] = mapped_column(
        Integer, default=0, server_default="0", nullable=False
    )
    stripe_state_generation: Mapped[int] = mapped_column(
        Integer, default=0, server_default="0", nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    jobs = relationship("Job", back_populates="user", cascade="all, delete-orphan")
    clips = relationship("Clip", back_populates="user", cascade="all, delete-orphan")
    scheduled_posts = relationship(
        "ScheduledPost", back_populates="user", cascade="all, delete-orphan"
    )
    brand_kit = relationship(
        "BrandKit", back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    billing_checkout_claim = relationship(
        "BillingCheckoutClaim",
        back_populates="user",
        uselist=False,
        cascade="all, delete-orphan",
    )
