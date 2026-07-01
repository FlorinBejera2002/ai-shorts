from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator, model_validator


class TranscriptWord(BaseModel):
    text: str
    start: float = Field(ge=0)
    end: float = Field(ge=0)

    @model_validator(mode="after")
    def validate_window(self) -> "TranscriptWord":
        if self.end < self.start:
            raise ValueError("word end must not be before start")
        return self


class TranscriptSegment(BaseModel):
    id: int
    start: float = Field(ge=0)
    end: float = Field(gt=0)
    text: str
    words: list[TranscriptWord] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_window(self) -> "TranscriptSegment":
        if self.end <= self.start:
            raise ValueError("segment end must be greater than start")
        return self


class TranscriptResult(BaseModel):
    text: str
    language: str | None = None
    duration: float | None = Field(default=None, ge=0)
    segments: list[TranscriptSegment] = Field(default_factory=list)
    words: list[TranscriptWord] = Field(default_factory=list)


class HighlightCandidate(BaseModel):
    start: float = Field(ge=0)
    end: float = Field(gt=0)
    rank: int = Field(default=0, ge=0)
    source: Literal["gemini", "fallback"] = "gemini"
    video_description_for_tiktok: str = ""
    video_description_for_instagram: str = ""
    video_title_for_youtube_short: str = ""
    viral_hook_text: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_window(self) -> "HighlightCandidate":
        if self.end <= self.start:
            raise ValueError("highlight end must be greater than start")
        return self

    @property
    def duration(self) -> float:
        return self.end - self.start


class ClipOutput(BaseModel):
    index: int = Field(ge=1)
    start: float = Field(ge=0)
    end: float = Field(gt=0)
    duration: float = Field(gt=0)
    title: str = ""
    hook_text: str = ""
    file_path: str
    file_name: str
    file_size: int = Field(default=0, ge=0)
    resolution: str | None = None
    thumbnail_path: str | None = None
    vertical_file_path: str | None = None
    subtitled_file_path: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_window(self) -> "ClipOutput":
        if self.end <= self.start:
            raise ValueError("clip end must be greater than start")
        if abs(self.duration - (self.end - self.start)) > 0.01:
            raise ValueError("clip duration must match end - start")
        return self


class SourceVideo(BaseModel):
    type: Literal["local", "url", "youtube"]
    title: str
    duration: float = Field(ge=0)
    local_path: str
    metadata: dict[str, Any] = Field(default_factory=dict)


class PipelineResult(BaseModel):
    source: SourceVideo
    transcript: TranscriptResult
    clips: list[ClipOutput] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)

    @field_validator("clips")
    @classmethod
    def require_unique_indexes(cls, clips: list[ClipOutput]) -> list[ClipOutput]:
        indexes = [clip.index for clip in clips]
        if len(indexes) != len(set(indexes)):
            raise ValueError("clip indexes must be unique")
        return clips
