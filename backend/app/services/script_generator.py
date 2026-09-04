from __future__ import annotations

import json
import logging
import math
from typing import Any

from app.config import settings
from app.schemas.script import normalize_camera_movement, normalize_camera_values

logger = logging.getLogger(__name__)

SCRIPT_PROMPT_TEMPLATE = """You are an elite short-form video scriptwriter and director. You create detailed, professional filming scripts that creators can follow step-by-step to produce viral content.

TASK: Write a COMPLETE filming script for a {duration}-second {platform} video.

TOPIC: {topic}

PARAMETERS:
- Platform: {platform}
- Target duration: {duration} seconds
- Tone: {tone}
- Target audience: {target_audience}
- Visual style: {style}
- Language for ALL text output: {language_name}

VISUAL STYLE GUIDE:
- talking_head: Speaker directly addressing camera, close-up or medium shot
- b_roll: Mixed footage with voiceover narration
- tutorial: Screen recording or step-by-step demonstration
- storytelling: Cinematic narrative with multiple angles
- vlog: Casual, handheld, authentic feel
- product_demo: Product-focused with clear demonstrations

STRICT RULES:
1. The hook (first 2-3 seconds) MUST stop the scroll. Use pattern interrupts, bold claims, or curiosity gaps.
2. Every scene must have a SPECIFIC camera direction — no vague instructions.
3. Text overlays must be SHORT (max 8 words) and reinforce the spoken word.
4. Total scene durations MUST add up to approximately {duration} seconds.
5. The call-to-action must feel natural, not forced.
6. ALL human-readable output (title, dialogue, overlays, captions, tips and camera_movement) MUST be in {language_name}; machine fields remain the exact tokens specified below.
7. Equipment suggestions should range from phone-only to professional.
8. Transitions should be platform-appropriate ({platform} style).
9. camera_movement is a human-readable filming direction in {language_name}.
10. camera_movement_type and camera_movement_direction are machine fields. NEVER translate them and use only the exact tokens listed below.

OUTPUT — RETURN ONLY VALID JSON (no markdown, no comments):
{{
  "title": "<catchy script title>",
  "hook": "<the exact opening line/action for the first 2-3 seconds — this is what stops the scroll>",
  "scenes": [
    {{
      "scene_number": 1,
      "duration_seconds": <integer>,
      "visual_description": "<detailed description of what the viewer sees — framing, background, props, lighting>",
      "camera_angle": "<specific angle: close-up face, medium shot waist-up, wide shot full body, overhead, low angle, eye-level, etc.>",
      "camera_movement": "<localized human-readable direction for the creator>",
      "camera_movement_type": "<exact token: static, pan, tilt, zoom, dolly, track or handheld>",
      "camera_movement_direction": "<exact token: none, left, right, up, down, in or out. Use none for static and handheld; left/right for pan and track; up/down for tilt; in/out for zoom and dolly>",
      "dialogue": "<exact words spoken in this scene OR [no dialogue] if silent>",
      "text_overlay": "<bold text that appears on screen, max 8 words, or empty string if none>",
      "music_mood": "<upbeat energetic, calm ambient, dramatic tension, trendy beat, lo-fi chill, etc.>",
      "transition": "<cut, swipe left, zoom transition, jump cut, fade, match cut, whip pan, etc.>",
      "shot_type": "<close_up, medium_close_up, medium_shot, wide_shot, overhead or detail>",
      "camera_height": <meters from floor, e.g. 1.55>,
      "camera_distance": <meters from subject, e.g. 1.8>,
      "camera_yaw": <horizontal angle in degrees, -45 to 45>,
      "camera_pitch": <vertical angle in degrees, -25 to 25>,
      "lens_mm": <smartphone equivalent focal length: 24, 35, 50 or 70>,
      "subject_action": "<specific body action and gesture synchronized with the line>",
      "subject_position": [<x>, <y>, <z>],
      "lighting": "<soft_key_left, window_right, dramatic_backlight, flat_daylight, product_softbox>",
      "voice_emotion": "<confident, warm, excited, calm, urgent, playful, authoritative>",
      "voice_pace": <0.75 to 1.35>,
      "voice_emphasis": ["<important word>", "<important phrase>"]
    }}
  ],
  "call_to_action": "<the closing CTA text — follow, comment, share, link in bio, etc.>",
  "caption": "<ready-to-paste platform caption with emojis, 2-3 lines max>",
  "hashtags": ["hashtag1", "hashtag2", "hashtag3", "hashtag4", "hashtag5"],
  "total_duration_seconds": <integer, sum of all scene durations>,
  "equipment_suggestions": ["Phone with front camera", "Ring light", "Tripod", "Lavalier mic"],
  "filming_tips": ["Tip 1 specific to this script", "Tip 2", "Tip 3"]
}}
"""

LANGUAGE_NAMES = {
    "en": "English",
    "ro": "Romanian",
    "es": "Spanish",
    "fr": "French",
    "de": "German",
    "it": "Italian",
    "pt": "Portuguese",
}

PLATFORM_NAMES = {
    "tiktok": "TikTok",
    "instagram": "Instagram Reels",
    "youtube": "YouTube Shorts",
    "linkedin": "LinkedIn",
}


def build_script_prompt(
    topic: str,
    platform: str = "tiktok",
    duration: int = 30,
    tone: str = "entertaining",
    target_audience: str = "",
    language: str = "en",
    style: str = "talking_head",
) -> str:
    return SCRIPT_PROMPT_TEMPLATE.format(
        topic=topic,
        platform=PLATFORM_NAMES.get(platform, platform),
        duration=duration,
        tone=tone,
        target_audience=target_audience or "general audience",
        language_name=LANGUAGE_NAMES.get(language, language),
        style=style,
    )


def extract_json_response(response_text: str) -> dict[str, Any]:
    text = response_text.strip()
    text = text.removeprefix("```json")
    text = text.removeprefix("```")
    text = text.removesuffix("```")
    text = text.strip()

    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start == -1 or end == -1 or end <= start:
            raise
        parsed = json.loads(text[start : end + 1])
    if not isinstance(parsed, dict):
        raise TypeError("Generated script must be a JSON object")
    return parsed


def _safe_int(value: Any, fallback: int, minimum: int = 1) -> int:
    if isinstance(value, bool):
        return fallback
    try:
        parsed = int(value)
    except (TypeError, ValueError, OverflowError):
        return fallback
    return max(minimum, parsed)


def _safe_float(
    value: Any,
    fallback: float,
    minimum: float,
    maximum: float,
) -> float:
    if isinstance(value, bool):
        return fallback
    try:
        parsed = float(value)
    except (TypeError, ValueError, OverflowError):
        return fallback
    if not math.isfinite(parsed):
        return fallback
    return min(maximum, max(minimum, parsed))


def _text(value: Any, fallback: str = "") -> str:
    return value if isinstance(value, str) else fallback


def _limited_text_list(value: Any, limit: int) -> list[str]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, str)][:limit]


def validate_script(raw: dict[str, Any]) -> dict[str, Any]:
    raw_scenes = raw.get("scenes")
    scenes = raw_scenes if isinstance(raw_scenes, list) else []
    validated_scenes = []
    for i, raw_scene in enumerate(scenes, start=1):
        scene = raw_scene if isinstance(raw_scene, dict) else {}
        camera_values = normalize_camera_values(scene)
        camera_movement = normalize_camera_movement(scene)
        validated_scenes.append(
            {
                "scene_number": _safe_int(scene.get("scene_number"), i),
                "duration_seconds": _safe_int(scene.get("duration_seconds"), 5),
                "visual_description": _text(scene.get("visual_description")),
                "camera_angle": _text(scene.get("camera_angle"), "eye-level"),
                "camera_movement": _text(scene.get("camera_movement"), "static"),
                **camera_movement,
                "dialogue": _text(scene.get("dialogue")),
                "text_overlay": _text(scene.get("text_overlay")),
                "music_mood": _text(scene.get("music_mood")),
                "transition": _text(scene.get("transition"), "cut"),
                "shot_type": _text(scene.get("shot_type"), "medium_shot"),
                **camera_values,
                "subject_action": _text(
                    scene.get("subject_action"), "Speak naturally to camera"
                ),
                "lighting": _text(scene.get("lighting"), "soft_key_left"),
                "voice_emotion": _text(scene.get("voice_emotion"), "confident"),
                "voice_pace": _safe_float(scene.get("voice_pace"), 1.0, 0.75, 1.35),
                "voice_emphasis": _limited_text_list(scene.get("voice_emphasis"), 5),
            }
        )

    total = sum(s["duration_seconds"] for s in validated_scenes)

    return {
        "title": _text(raw.get("title"), "Untitled Script"),
        "hook": _text(raw.get("hook")),
        "scenes": validated_scenes,
        "call_to_action": _text(raw.get("call_to_action")),
        "caption": _text(raw.get("caption")),
        "hashtags": _limited_text_list(raw.get("hashtags"), 10),
        "total_duration_seconds": total,
        "equipment_suggestions": _limited_text_list(
            raw.get("equipment_suggestions"), 20
        ),
        "filming_tips": _limited_text_list(raw.get("filming_tips"), 20),
    }


def generate_script(
    topic: str,
    platform: str = "tiktok",
    duration: int = 30,
    tone: str = "entertaining",
    target_audience: str = "",
    language: str = "en",
    style: str = "talking_head",
    api_key: str | None = None,
    model_name: str | None = None,
) -> dict[str, Any]:
    api_key = api_key or settings.gemini_api_key
    model_name = model_name or settings.gemini_model_name

    if not api_key:
        raise ValueError("Gemini API key is required for script generation")

    from google import genai

    prompt = build_script_prompt(
        topic=topic,
        platform=platform,
        duration=duration,
        tone=tone,
        target_audience=target_audience,
        language=language,
        style=style,
    )

    client = genai.Client(api_key=api_key)
    response = client.models.generate_content(model=model_name, contents=prompt)

    raw = extract_json_response(response.text or "")
    return validate_script(raw)
