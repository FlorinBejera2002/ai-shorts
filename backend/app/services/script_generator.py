from __future__ import annotations

import json
import logging
from typing import Any

from app.config import settings

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
6. ALL output text (title, dialogue, overlays, captions, tips) MUST be in {language_name}.
7. Equipment suggestions should range from phone-only to professional.
8. Transitions should be platform-appropriate ({platform} style).

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
      "camera_movement": "<static, slow pan left, tilt up, zoom in, tracking shot, handheld shake, dolly in, etc.>",
      "dialogue": "<exact words spoken in this scene OR [no dialogue] if silent>",
      "text_overlay": "<bold text that appears on screen, max 8 words, or empty string if none>",
      "music_mood": "<upbeat energetic, calm ambient, dramatic tension, trendy beat, lo-fi chill, etc.>",
      "transition": "<cut, swipe left, zoom transition, jump cut, fade, match cut, whip pan, etc.>"
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
    if text.startswith("```json"):
        text = text[7:]
    if text.startswith("```"):
        text = text[3:]
    if text.endswith("```"):
        text = text[:-3]
    text = text.strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start == -1 or end == -1 or end <= start:
            raise
        return json.loads(text[start : end + 1])


def validate_script(raw: dict[str, Any]) -> dict[str, Any]:
    scenes = raw.get("scenes", [])
    validated_scenes = []
    for i, scene in enumerate(scenes, start=1):
        validated_scenes.append(
            {
                "scene_number": scene.get("scene_number", i),
                "duration_seconds": max(1, int(scene.get("duration_seconds", 5))),
                "visual_description": scene.get("visual_description", ""),
                "camera_angle": scene.get("camera_angle", "eye-level"),
                "camera_movement": scene.get("camera_movement", "static"),
                "dialogue": scene.get("dialogue", ""),
                "text_overlay": scene.get("text_overlay", ""),
                "music_mood": scene.get("music_mood", ""),
                "transition": scene.get("transition", "cut"),
            }
        )

    total = sum(s["duration_seconds"] for s in validated_scenes)

    return {
        "title": raw.get("title", "Untitled Script"),
        "hook": raw.get("hook", ""),
        "scenes": validated_scenes,
        "call_to_action": raw.get("call_to_action", ""),
        "caption": raw.get("caption", ""),
        "hashtags": raw.get("hashtags", [])[:10],
        "total_duration_seconds": total,
        "equipment_suggestions": raw.get("equipment_suggestions", []),
        "filming_tips": raw.get("filming_tips", []),
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
