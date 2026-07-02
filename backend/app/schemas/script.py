from __future__ import annotations

from pydantic import BaseModel, Field


class ScriptScene(BaseModel):
    scene_number: int
    duration_seconds: int
    visual_description: str
    camera_angle: str
    camera_movement: str
    dialogue: str
    text_overlay: str
    music_mood: str
    transition: str


class GeneratedScript(BaseModel):
    title: str
    hook: str
    scenes: list[ScriptScene]
    call_to_action: str
    caption: str
    hashtags: list[str]
    total_duration_seconds: int
    equipment_suggestions: list[str]
    filming_tips: list[str]


class ScriptGenerateRequest(BaseModel):
    topic: str = Field(..., min_length=3, max_length=1000)
    platform: str = Field(default="tiktok")
    duration: int = Field(default=30, ge=15, le=180)
    tone: str = Field(default="entertaining")
    target_audience: str = Field(default="")
    language: str = Field(default="en")
    style: str = Field(default="talking_head")


class ScriptGenerateResponse(BaseModel):
    script: GeneratedScript
    credits_charged: int = 0
