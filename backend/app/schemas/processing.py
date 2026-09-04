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


class SegmentCandidate(BaseModel):
    start: float = Field(ge=0)
    end: float = Field(gt=0)

    @model_validator(mode="after")
    def validate_window(self) -> "SegmentCandidate":
        if self.end <= self.start:
            raise ValueError("segment end must be greater than start")
        return self


class HighlightCandidate(BaseModel):
    segments: list[SegmentCandidate]
    transition: Literal["cut", "fade", "dissolve"] = "cut"
    transition_duration: float = Field(default=0.25, ge=0.05, le=0.5)
    rank: int = Field(default=0, ge=0)
    viral_score: int = Field(default=0, ge=0, le=10)
    source: Literal["gemini", "fallback"] = "gemini"
    video_description_for_tiktok: str = ""
    video_description_for_instagram: str = ""
    video_title_for_youtube_short: str = ""
    viral_hook_text: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)

    @property
    def start(self) -> float:
        return self.segments[0].start

    @property
    def end(self) -> float:
        return self.segments[-1].end

    @property
    def duration(self) -> float:
        return sum(s.end - s.start for s in self.segments)

    @model_validator(mode="before")
    @classmethod
    def migrate_legacy(cls, data):
        if (
            isinstance(data, dict)
            and "start" in data
            and "end" in data
            and "segments" not in data
        ):
            data["segments"] = [{"start": data.pop("start"), "end": data.pop("end")}]
        return data


class ClipOutput(BaseModel):
    index: int = Field(ge=1)
    start: float = Field(ge=0)
    end: float = Field(gt=0)
    duration: float = Field(gt=0)
    segments: list[SegmentCandidate] = Field(default_factory=list)
    transition: Literal["cut", "fade", "dissolve"] = "cut"
    transition_duration: float = Field(default=0.25, ge=0.05, le=0.5)
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
        expected = self.end - self.start
        if self.segments:
            if (
                self.segments[0].start != self.start
                or self.segments[-1].end != self.end
            ):
                raise ValueError("clip bounds must match its segments")
            if any(
                right.start < left.end
                for left, right in zip(self.segments, self.segments[1:])
            ):
                raise ValueError("clip segments must be ordered and non-overlapping")
            expected = sum(segment.end - segment.start for segment in self.segments)
            if self.transition != "cut":
                expected -= sum(
                    min(
                        self.transition_duration,
                        (left.end - left.start) / 2,
                        (right.end - right.start) / 2,
                    )
                    for left, right in zip(self.segments, self.segments[1:])
                )
        if abs(self.duration - expected) > 0.01:
            raise ValueError("clip duration must match its selected segments")
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
