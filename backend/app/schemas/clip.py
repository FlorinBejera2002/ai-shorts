from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class ClipRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    job_id: uuid.UUID
    user_id: uuid.UUID
    title: str
    hook_text: str | None = None
    viral_score: int
    score_reason: str | None = None
    start_time: float
    end_time: float
    duration: float
    file_path: str
    file_url: str | None = None
    thumbnail_path: str | None = None
    thumbnail_url: str | None = None
    file_size: int
    resolution: str
    aspect_ratio: str
    has_subtitles: bool
    transcript_text: str | None = None
    published_to: dict[str, Any] | None = None
    created_at: datetime


class ClipList(BaseModel):
    clips: list[ClipRead]
