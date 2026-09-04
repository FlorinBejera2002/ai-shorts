from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator


class JobCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    source_type: str = Field(pattern="^(upload|youtube|url|local)$")
    source_url: str | None = Field(default=None, max_length=2048)
    source_file_path: str | None = Field(default=None, max_length=2048)
    source_storage_key: str | None = Field(default=None, max_length=2048)
    num_clips_requested: int = Field(default=5, ge=1, le=15)
    aspect_ratio: str = Field(default="9:16", pattern="^(9:16|1:1|16:9)$")
    language: str | None = Field(default=None, max_length=50)
    subtitle_style: str = Field(default="default", max_length=50)
    include_brand: bool = False
    burn_subtitles: bool = True
    smart_crop: bool = True
    user_instructions: str | None = Field(default=None, max_length=4000)

    @model_validator(mode="after")
    def validate_source(self) -> JobCreate:
        if self.source_type in {"youtube", "url"} and not self.source_url:
            raise ValueError("source_url is required for URL jobs")
        if self.source_type in {"upload", "local"} and not self.source_file_path:
            raise ValueError("source_file_path is required for uploaded/local jobs")
        if self.source_url and self.source_file_path:
            raise ValueError("Provide exactly one source")
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
    user_instructions: str | None = None
    credits_charged: int
    error_message: str | None = None
    celery_task_id: str | None = None
    processing_active: bool = False
    active_edit_tasks: int = 0
    started_at: datetime | None = None
    completed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class BatchJobCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    source_urls: list[str] = Field(min_length=1, max_length=20)
    num_clips_requested: int = Field(default=5, ge=1, le=15)
    aspect_ratio: str = Field(default="9:16", pattern="^(9:16|1:1|16:9)$")
    language: str | None = Field(default=None, max_length=50)
    subtitle_style: str = Field(default="default", max_length=50)
    include_brand: bool = False
    burn_subtitles: bool = True
    smart_crop: bool = True
    user_instructions: str | None = Field(default=None, max_length=4000)

    @model_validator(mode="after")
    def validate_urls(self) -> BatchJobCreate:
        if any(not url or len(url) > 2048 for url in self.source_urls):
            raise ValueError("Each source URL must contain 1 to 2048 characters")
        return self


class BatchJobResult(BaseModel):
    jobs: list[JobRead]
    total_credits: int


class JobList(BaseModel):
    jobs: list[JobRead]


class JobStatus(BaseModel):
    job: JobRead
    celery_state: str | None = None
    celery_meta: dict | None = None
