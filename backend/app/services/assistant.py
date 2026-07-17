from __future__ import annotations

import json
import logging
from typing import Any

from app.config import settings
from app.schemas.assistant import CreatePageState, EditorPageState
from app.services.script_generator import extract_json_response

logger = logging.getLogger(__name__)

MAX_HISTORY_MESSAGES = 20
MAX_TRANSCRIPT_CHARS = 60_000

CREATE_SYSTEM_PROMPT = """You are ClipForge's creation assistant. The user is on the "Create clips" page and describes, in natural language, how their short-form clips should be produced. You configure the job for them and capture editorial guidance.

AVAILABLE SETTINGS (the only things you can change):
- clips: integer 1-15 (number of clips generated per video; each clip costs 10 credits)
- aspect_ratio: one of "9:16" (TikTok/Reels/Shorts), "1:1" (LinkedIn/feed), "16:9" (landscape)
- subtitle_style: one of "clean", "bold", "caption-box", "none"
- include_brand: boolean (apply the user's brand kit)
- language: audio language ISO code ("en", "ro", "es", "fr", "de", "it", "pt", "pl") or null for auto-detect
- smart_crop: boolean (AI keeps the speaker framed when cropping)

EDITORIAL GUIDANCE: when the user describes WHICH moments matter ("focus on the parts about money", "the story at the beginning", "skip the sponsor read"), capture it as an instructions text. It is passed to the AI that selects viral moments during processing. Accumulate: merge new guidance with existing instructions shown in CURRENT_STATE instead of discarding it.

CURRENT_STATE of the page is provided as JSON. Only include settings you want to CHANGE.

RESPONSE FORMAT — return ONLY valid JSON, no markdown:
{
  "reply": "<short, friendly, concrete answer in the SAME LANGUAGE the user wrote in; describe what you changed or advise; max ~80 words>",
  "actions": [
    {"type": "update_settings", "settings": {<only changed keys>}},
    {"type": "set_instructions", "instructions": "<full merged editorial guidance text>"}
  ]
}
Return "actions": [] when the user only asks a question. Never invent settings outside the list above.
"""

EDITOR_SYSTEM_PROMPT = """You are ClipForge's clip-editing assistant. The user edits one clip on a timeline made of segments cut from a source video. Segments play in LIST ORDER and are concatenated at export.

HARD CONSTRAINTS for any segment list you propose:
- 1 to 10 segments; each at least 0.25 s; total at least 3 s
- 0 <= start < end <= VIDEO_DURATION for every segment
- segments must NOT overlap each other in source time
- keep times to max 2 decimals

You receive CURRENT_STATE (existing segments in order, video duration, playhead position) and, when available, TRANSCRIPT_CHUNKS as JSON [{"s": start_seconds, "e": end_seconds, "text": "..."}] — use them to locate the moments the user references ("the part about X") and choose precise cut points at natural sentence boundaries.

WHEN THE USER ASKS FOR CHANGES, return the COMPLETE NEW segment list (not a diff), in playback order.

RESPONSE FORMAT — return ONLY valid JSON, no markdown:
{
  "reply": "<short, friendly, concrete answer in the SAME LANGUAGE the user wrote in; say exactly what you changed and why; max ~80 words>",
  "actions": [
    {"type": "apply_segments", "segments": [{"start": <sec>, "end": <sec>}, ...]},
    {"type": "seek", "time": <sec>}
  ]
}
Use "seek" alone to show the user a moment without changing segments. Return "actions": [] for pure questions. If the request cannot be satisfied within the constraints, explain in "reply" and return no actions.
"""

VALID_ASPECT_RATIOS = {"9:16", "1:1", "16:9"}
VALID_SUBTITLE_STYLES = {"clean", "bold", "caption-box", "none"}
VALID_LANGUAGES = {"en", "ro", "es", "fr", "de", "it", "pt", "pl"}


def build_prompt(
    context: str,
    message: str,
    history: list[dict[str, str]],
    create_state: CreatePageState | None,
    editor_state: EditorPageState | None,
    transcript_chunks: list[dict[str, Any]] | None,
) -> str:
    parts: list[str] = []
    if context == "create":
        parts.append(CREATE_SYSTEM_PROMPT)
        if create_state:
            parts.append(f"CURRENT_STATE:\n{create_state.model_dump_json()}")
    else:
        parts.append(EDITOR_SYSTEM_PROMPT)
        if editor_state:
            parts.append(f"CURRENT_STATE:\n{editor_state.model_dump_json()}")
        if transcript_chunks:
            chunks_json = json.dumps(transcript_chunks, ensure_ascii=False)
            if len(chunks_json) > MAX_TRANSCRIPT_CHARS:
                chunks_json = chunks_json[:MAX_TRANSCRIPT_CHARS] + "…]"
            parts.append(f"TRANSCRIPT_CHUNKS:\n{chunks_json}")

    if history:
        lines = [
            f"{m['role'].upper()}: {m['content']}" for m in history[-MAX_HISTORY_MESSAGES:]
        ]
        parts.append("CONVERSATION_SO_FAR:\n" + "\n".join(lines))

    parts.append(f"USER: {message}")
    return "\n\n".join(parts)


def _validate_create_actions(raw_actions: list[Any]) -> list[dict[str, Any]]:
    actions: list[dict[str, Any]] = []
    for action in raw_actions:
        if not isinstance(action, dict):
            continue
        if action.get("type") == "update_settings" and isinstance(action.get("settings"), dict):
            settings_in: dict[str, Any] = action["settings"]
            cleaned: dict[str, Any] = {}
            if isinstance(settings_in.get("clips"), (int, float)):
                cleaned["clips"] = max(1, min(15, int(settings_in["clips"])))
            if settings_in.get("aspect_ratio") in VALID_ASPECT_RATIOS:
                cleaned["aspect_ratio"] = settings_in["aspect_ratio"]
            if settings_in.get("subtitle_style") in VALID_SUBTITLE_STYLES:
                cleaned["subtitle_style"] = settings_in["subtitle_style"]
            if isinstance(settings_in.get("include_brand"), bool):
                cleaned["include_brand"] = settings_in["include_brand"]
            if isinstance(settings_in.get("smart_crop"), bool):
                cleaned["smart_crop"] = settings_in["smart_crop"]
            language = settings_in.get("language")
            if language is None or language in VALID_LANGUAGES:
                if "language" in settings_in:
                    cleaned["language"] = language
            if cleaned:
                actions.append({"type": "update_settings", "settings": cleaned})
        elif action.get("type") == "set_instructions" and isinstance(action.get("instructions"), str):
            text = action["instructions"].strip()[:4000]
            if text:
                actions.append({"type": "set_instructions", "instructions": text})
    return actions


def _validate_editor_actions(
    raw_actions: list[Any], video_duration: float
) -> list[dict[str, Any]]:
    actions: list[dict[str, Any]] = []
    for action in raw_actions:
        if not isinstance(action, dict):
            continue
        if action.get("type") == "apply_segments" and isinstance(action.get("segments"), list):
            segments: list[dict[str, float]] = []
            valid = True
            for seg in action["segments"]:
                if not isinstance(seg, dict):
                    valid = False
                    break
                try:
                    start = round(float(seg["start"]), 2)
                    end = round(float(seg["end"]), 2)
                except (KeyError, TypeError, ValueError):
                    valid = False
                    break
                if video_duration > 0:
                    start = max(0.0, min(start, video_duration))
                    end = max(0.0, min(end, video_duration))
                if end - start < 0.25:
                    valid = False
                    break
                segments.append({"start": start, "end": end})
            total = sum(s["end"] - s["start"] for s in segments)
            by_start = sorted(segments, key=lambda s: s["start"])
            overlaps = any(
                by_start[i]["start"] < by_start[i - 1]["end"]
                for i in range(1, len(by_start))
            )
            if valid and 1 <= len(segments) <= 10 and total >= 3.0 and not overlaps:
                actions.append({"type": "apply_segments", "segments": segments})
        elif action.get("type") == "seek":
            try:
                time = max(0.0, float(action["time"]))
            except (KeyError, TypeError, ValueError):
                continue
            if video_duration > 0:
                time = min(time, video_duration)
            actions.append({"type": "seek", "time": round(time, 2)})
    return actions


def run_assistant(
    context: str,
    message: str,
    history: list[dict[str, str]],
    create_state: CreatePageState | None = None,
    editor_state: EditorPageState | None = None,
    transcript_chunks: list[dict[str, Any]] | None = None,
    api_key: str | None = None,
    model_name: str | None = None,
) -> dict[str, Any]:
    api_key = api_key or settings.gemini_api_key
    model_name = model_name or settings.gemini_model_name
    if not api_key:
        raise ValueError("Gemini API key is required for the assistant")

    from google import genai

    prompt = build_prompt(
        context, message, history, create_state, editor_state, transcript_chunks
    )

    client = genai.Client(api_key=api_key)
    response = client.models.generate_content(
        model=model_name,
        contents=prompt,
        config={"response_mime_type": "application/json"},
    )

    raw_text = response.text or ""
    try:
        parsed = extract_json_response(raw_text)
    except (json.JSONDecodeError, ValueError):
        logger.warning("Assistant returned non-JSON output; using raw text as reply")
        return {"reply": raw_text.strip() or "…", "actions": []}

    reply = parsed.get("reply")
    if not isinstance(reply, str) or not reply.strip():
        reply = raw_text.strip() or "…"

    raw_actions = parsed.get("actions")
    if not isinstance(raw_actions, list):
        raw_actions = []

    if context == "create":
        actions = _validate_create_actions(raw_actions)
    else:
        duration = editor_state.video_duration if editor_state else 0.0
        actions = _validate_editor_actions(raw_actions, duration)

    return {"reply": reply.strip(), "actions": actions}
