from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class CreatePageState(BaseModel):
    """Snapshot of the create-page settings the user currently sees."""

    clips: int = Field(default=5, ge=1, le=15)
    aspect_ratio: str = "9:16"
    subtitle_style: str = "clean"
    include_brand: bool = False
    language: str | None = None
    smart_crop: bool = True
    instructions: str | None = None


class EditorSegment(BaseModel):
    start: float = Field(ge=0)
    end: float = Field(gt=0)


class EditorPageState(BaseModel):
    """Snapshot of the editor timeline the user currently sees."""

    segments: list[EditorSegment] = Field(default_factory=list)
    video_duration: float = Field(default=0, ge=0)
    current_time: float = Field(default=0, ge=0)


class ChatRequest(BaseModel):
    context: Literal["create", "editor"]
    clip_id: uuid.UUID | None = None
    message: str = Field(min_length=1, max_length=2000)
    create_state: CreatePageState | None = None
    editor_state: EditorPageState | None = None


class ChatMessageRead(BaseModel):
    id: uuid.UUID
    role: str
    content: str
    actions: list[dict[str, Any]] | None = None
    created_at: datetime


class ChatResponse(BaseModel):
    reply: str
    actions: list[dict[str, Any]] = Field(default_factory=list)


class ChatHistory(BaseModel):
    messages: list[ChatMessageRead]
