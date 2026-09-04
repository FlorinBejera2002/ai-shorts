from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ScheduledPost(Base):
    __tablename__ = "scheduled_posts"
    __table_args__ = (
        CheckConstraint(
            "status IN ('draft', 'scheduled', 'published')",
            name="ck_scheduled_posts_status",
        ),
        CheckConstraint(
            "platforms IS NOT NULL AND cardinality(platforms) > 0",
            name="ck_scheduled_posts_platforms_not_empty",
        ),
        CheckConstraint(
            "platforms <@ ARRAY['tiktok', 'instagram', 'youtube', 'linkedin']::varchar[]",
            name="ck_scheduled_posts_platforms_supported",
        ),
        CheckConstraint(
            "length(btrim(title)) > 0",
            name="ck_scheduled_posts_title_not_blank",
        ),
        CheckConstraint(
            "caption IS NULL OR char_length(caption) <= 5000",
            name="ck_scheduled_posts_caption_length",
        ),
        CheckConstraint(
            "notes IS NULL OR char_length(notes) <= 2000",
            name="ck_scheduled_posts_notes_length",
        ),
        CheckConstraint(
            "(clip_id IS NULL AND clip_owner_id IS NULL) "
            "OR (clip_id IS NOT NULL AND clip_owner_id = user_id)",
            name="ck_scheduled_posts_clip_owner",
        ),
        ForeignKeyConstraint(
            ["clip_id", "clip_owner_id"],
            ["clips.id", "clips.user_id"],
            name="fk_scheduled_posts_owned_clip",
            ondelete="SET NULL",
            onupdate="CASCADE",
        ),
        Index(
            "ix_scheduled_posts_user_scheduled_at",
            "user_id",
            "scheduled_at",
        ),
        Index("ix_scheduled_posts_user_status", "user_id", "status"),
        Index("ix_scheduled_posts_clip_id", "clip_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE", onupdate="CASCADE"),
        nullable=False,
    )
    clip_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    clip_owner_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    caption: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Prisma scalar lists are physically nullable in PostgreSQL. A table check
    # enforces that application rows always contain at least one platform.
    platforms: Mapped[list[str] | None] = mapped_column(
        ARRAY(String(32)), nullable=True
    )
    status: Mapped[str] = mapped_column(
        String(32), default="draft", server_default="draft", nullable=False
    )
    scheduled_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    user = relationship("User", back_populates="scheduled_posts")
    clip = relationship("Clip", back_populates="scheduled_posts")
