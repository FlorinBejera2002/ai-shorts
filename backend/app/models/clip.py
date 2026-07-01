from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, JSON, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Clip(Base):
    __tablename__ = "clips"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    job_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("jobs.id", ondelete="CASCADE"), index=True, nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    hook_text: Mapped[str | None] = mapped_column(String(255), nullable=True)
    viral_score: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    score_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    start_time: Mapped[float] = mapped_column(Float, nullable=False)
    end_time: Mapped[float] = mapped_column(Float, nullable=False)
    duration: Mapped[float] = mapped_column(Float, nullable=False)
    segments: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    file_path: Mapped[str] = mapped_column(String(2048), nullable=False)
    file_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    thumbnail_path: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    thumbnail_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    file_size: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    resolution: Mapped[str] = mapped_column(String(50), nullable=False)
    aspect_ratio: Mapped[str] = mapped_column(String(20), default="9:16", nullable=False)
    has_subtitles: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    transcript_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    caption_tiktok: Mapped[str | None] = mapped_column(Text, nullable=True)
    caption_instagram: Mapped[str | None] = mapped_column(Text, nullable=True)
    caption_youtube: Mapped[str | None] = mapped_column(Text, nullable=True)
    suggested_hashtags: Mapped[str | None] = mapped_column(Text, nullable=True)
    published_to: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    job = relationship("Job", back_populates="clips")
    user = relationship("User", back_populates="clips")
