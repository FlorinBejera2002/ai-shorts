"""An editing reservation and its broker delivery are committed atomically."""

from datetime import datetime
from uuid import UUID

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class EditDelivery(Base):
    __tablename__ = "edit_deliveries"
    __table_args__ = (
        CheckConstraint("kind IN ('trim', 'recut')", name="ck_edit_deliveries_kind"),
        CheckConstraint(
            "state IN ('pending', 'running', 'completed', 'failed', 'expired')",
            name="ck_edit_deliveries_state",
        ),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    job_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False
    )
    clip_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("clips.id", ondelete="CASCADE"), nullable=False
    )
    kind: Mapped[str] = mapped_column(String(10), nullable=False)
    task_id: Mapped[str] = mapped_column(String(36), nullable=False, unique=True)
    reservation_token: Mapped[str] = mapped_column(
        String(36), nullable=False, unique=True
    )
    execution_token: Mapped[str | None] = mapped_column(String(36))
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False)
    state: Mapped[str] = mapped_column(
        String(20), nullable=False, default="pending", server_default="pending"
    )
    next_dispatch_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    dispatch_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    last_error: Mapped[str | None] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
