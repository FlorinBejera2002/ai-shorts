from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


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
    segments: list[dict] | None = None
    source_video_url: str | None = None


class RecutSegment(BaseModel):
    start: float
    end: float
    order: int

    @field_validator("start", "end")
    @classmethod
    def positive(cls, v):
        if v < 0:
            raise ValueError("must be non-negative")
        return v

    @model_validator(mode="after")
    def start_before_end(self):
        if self.start >= self.end:
            raise ValueError("start must be before end")
        if (self.end - self.start) < 0.25:
            raise ValueError("segment must be at least 0.25 seconds")
        return self


class RecutRequest(BaseModel):
    segments: list[RecutSegment]

    @field_validator("segments")
    @classmethod
    def validate_segments(cls, v):
        if len(v) < 1:
            raise ValueError("at least one segment required")
        if len(v) > 10:
            raise ValueError("maximum 10 segments")
        total = sum(s.end - s.start for s in v)
        if total < 3.0:
            raise ValueError("total duration must be at least 3 seconds")
        by_start = sorted(v, key=lambda s: s.start)
        for i in range(1, len(by_start)):
            if by_start[i].start < by_start[i - 1].end:
                raise ValueError("segments must not overlap")
        return v


class ClipList(BaseModel):
    clips: list[ClipRead]
