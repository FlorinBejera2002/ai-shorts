from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class CreditGrantBatch(Base):
    """Immutable parameters and completion marker for an administrative bonus."""

    __tablename__ = "credit_grant_batches"
    __table_args__ = (
        CheckConstraint("amount > 0", name="ck_credit_grant_batches_positive_amount"),
    )

    batch_key: Mapped[str] = mapped_column(String(128), primary_key=True)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    cutoff: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class CreditGrantRecipient(Base):
    """Balance audit retained independently of subsequent account deletion."""

    __tablename__ = "credit_grant_recipients"
    __table_args__ = (
        CheckConstraint(
            "balance_after > balance_before",
            name="ck_credit_grant_recipients_positive_delta",
        ),
    )

    batch_key: Mapped[str] = mapped_column(
        String(128), ForeignKey("credit_grant_batches.batch_key"), primary_key=True
    )
    # No user foreign key: deleting an account must not erase the grant audit.
    # Store only its opaque UUID, never an email, name or other account profile.
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    balance_before: Mapped[int] = mapped_column(Integer, nullable=False)
    balance_after: Mapped[int] = mapped_column(Integer, nullable=False)
