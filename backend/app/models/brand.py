from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class BrandKit(Base):
    __tablename__ = "brand_kits"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True, nullable=False)
    logo_path: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    logo_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    primary_color: Mapped[str] = mapped_column(String(20), default="#6366f1", nullable=False)
    secondary_color: Mapped[str] = mapped_column(String(20), default="#8b5cf6", nullable=False)
    font_family: Mapped[str] = mapped_column(String(100), default="Inter", nullable=False)
    subtitle_font: Mapped[str] = mapped_column(String(100), default="Inter Bold", nullable=False)
    subtitle_color: Mapped[str] = mapped_column(String(20), default="#FFFFFF", nullable=False)
    subtitle_bg_color: Mapped[str] = mapped_column(String(20), default="#000000", nullable=False)
    subtitle_bg_opacity: Mapped[float] = mapped_column(Float, default=0.7, nullable=False)
    subtitle_position: Mapped[str] = mapped_column(String(20), default="bottom", nullable=False)
    intro_video_path: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    outro_video_path: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    watermark_path: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    watermark_position: Mapped[str] = mapped_column(String(20), default="bottom-right", nullable=False)
    watermark_opacity: Mapped[float] = mapped_column(Float, default=0.8, nullable=False)
    hide_platform_badge: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    user = relationship("User", back_populates="brand_kit")
