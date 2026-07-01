from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator


class JobCreate(BaseModel):
    source_type: str = Field(pattern="^(upload|youtube|url|local)$")
    source_url: str | None = None
    source_file_path: str | None = None
    num_clips_requested: int = Field(default=5, ge=1, le=15)
    aspect_ratio: str = Field(default="9:16", pattern="^(9:16|1:1|16:9)$")
    language: str | None = None
    subtitle_style: str = "default"
    include_brand: bool = False
    burn_subtitles: bool = True
    smart_crop: bool = True

    @model_validator(mode="after")
    def validate_source(self) -> "JobCreate":
        if self.source_type in {"youtube", "url"} and not self.source_url:
            raise ValueError("source_url is required for URL jobs")
        if self.source_type in {"upload", "local"} and not self.source_file_path:
            raise ValueError("source_file_path is required for uploaded/local jobs")
        return self


class JobRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    source_type: str
    source_url: str | None = None
    source_file_path: str | None = None
    status: str
    progress: int
    progress_message: str | None = None
    num_clips_requested: int
    aspect_ratio: str
    language: str | None = None
    subtitle_style: str
    include_brand: bool
    credits_charged: int
    error_message: str | None = None
    celery_task_id: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class BatchJobCreate(BaseModel):
    source_urls: list[str] = Field(min_length=1, max_length=20)
    num_clips_requested: int = Field(default=5, ge=1, le=15)
    aspect_ratio: str = Field(default="9:16", pattern="^(9:16|1:1|16:9)$")
    language: str | None = None
    subtitle_style: str = "default"
    include_brand: bool = False
    burn_subtitles: bool = True
    smart_crop: bool = True


class BatchJobResult(BaseModel):
    jobs: list[JobRead]
    total_credits: int


class JobList(BaseModel):
    jobs: list[JobRead]


class JobStatus(BaseModel):
    job: JobRead
    celery_state: str | None = None
    celery_meta: dict | None = None
