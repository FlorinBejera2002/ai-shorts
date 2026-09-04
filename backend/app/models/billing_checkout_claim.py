from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class BillingCheckoutClaim(Base):
    """Durable per-user checkout lease, matching migration 20260903_0007."""

    __tablename__ = "billing_checkout_claims"
    __table_args__ = (
        UniqueConstraint("session_id", name="uq_billing_checkout_claims_session_id"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    token: Mapped[str] = mapped_column(String(64), nullable=False)
    plan_id: Mapped[str] = mapped_column(String(32), nullable=False)
    price_id: Mapped[str] = mapped_column(String(255), nullable=False)
    locale: Mapped[str] = mapped_column(String(8), nullable=False)
    customer_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    customer_email: Mapped[str] = mapped_column(String(255), nullable=False)
    success_url: Mapped[str] = mapped_column(String(2048), nullable=False)
    cancel_url: Mapped[str] = mapped_column(String(2048), nullable=False)
    generation: Mapped[int] = mapped_column(Integer, nullable=False)
    session_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    lease_expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    checkout_expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
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

    user = relationship("User", back_populates="billing_checkout_claim")
