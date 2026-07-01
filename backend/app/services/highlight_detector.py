from __future__ import annotations

import json
import logging
from typing import Any

from app.config import settings
from app.schemas.processing import HighlightCandidate, TranscriptResult

logger = logging.getLogger(__name__)

GEMINI_PROMPT_TEMPLATE = """
You are a senior short-form video editor. Read the ENTIRE transcript and word-level timestamps to choose EXACTLY {requested_clips} MOST VIRAL moments for TikTok/IG Reels/YouTube Shorts. Each clip must be between {min_duration} and {max_duration} seconds long.

⚠️ YOU MUST RETURN EXACTLY {requested_clips} CLIPS. If the video is long enough, find {requested_clips} non-overlapping segments. Only return fewer if the video is too short.

⚠️ FFMPEG TIME CONTRACT — STRICT REQUIREMENTS:
- Return timestamps in ABSOLUTE SECONDS from the start of the video (usable in: ffmpeg -ss <start> -to <end> -i <input> ...).
- Only NUMBERS with decimal point, up to 3 decimals (examples: 0, 1.250, 17.350).
- Ensure 0 ≤ start < end ≤ VIDEO_DURATION_SECONDS.
- Each clip between {min_duration} and {max_duration} s (inclusive).
- Prefer starting 0.2–0.4 s BEFORE the hook and ending 0.2–0.4 s AFTER the payoff.
- Use silence moments for natural cuts; never cut in the middle of a word or phrase.
- STRICTLY FORBIDDEN to use time formats other than absolute seconds.

VIDEO_DURATION_SECONDS: {video_duration}

TRANSCRIPT_TEXT (raw):
{transcript_text}

WORDS_JSON (array of {{w, s, e}} where s/e are seconds):
{words_json}

STRICT EXCLUSIONS:
- No generic intros/outros or purely sponsorship segments unless they contain the hook.
- No clips < {min_duration} s or > {max_duration} s.

MULTI-SEGMENT COMPOSITION:
Each clip can be composed of 1 to 5 non-overlapping segments from different parts of the video.
Use multiple segments when combining an attention-grabbing hook with a key moment and a strong
ending would create a more compelling clip. Use a single segment when a continuous moment is
already strong enough on its own.

OUTPUT — RETURN ONLY VALID JSON (no markdown, no comments). Order clips by predicted performance (best to worst). In the descriptions, ALWAYS include a CTA like "Follow me and comment X and I'll send you the workflow" (especially if discussing an n8n workflow):
{{
  "shorts": [
    {{
      "segments": [
        {{"start": <number in seconds, e.g., 12.340>, "end": <number in seconds, e.g., 17.900>}},
        {{"start": <number in seconds, e.g., 25.100>, "end": <number in seconds, e.g., 37.900>}}
      ],
      "viral_score": <integer 1-10, how likely to go viral>,
      "score_reason": "<one sentence explaining why this clip will perform well>",
      "video_description_for_tiktok": "<description for TikTok oriented to get views>",
      "video_description_for_instagram": "<description for Instagram oriented to get views>",
      "video_title_for_youtube_short": "<title for YouTube Short oriented to get views 100 chars max>",
      "viral_hook_text": "<SHORT punchy text overlay (max 10 words). MUST BE IN THE SAME LANGUAGE AS THE VIDEO TRANSCRIPT. Examples: 'POV: You realized...', 'Did you know?', 'Stop doing this!'>"
    }}
  ]
}}
"""


def build_prompt(
    transcript: dict[str, Any],
    video_duration: float,
    requested_clips: int | None = None,
) -> str:
    normalized = TranscriptResult.model_validate(transcript)
    requested = requested_clips or settings.max_clips
    words = [
        {"w": word.text, "s": round(word.start, 3), "e": round(word.end, 3)}
        for word in normalized.words
    ]
    return GEMINI_PROMPT_TEMPLATE.format(
        min_duration=settings.min_clip_duration,
        max_duration=settings.max_clip_duration,
        video_duration=round(video_duration, 3),
        transcript_text=normalized.text,
        words_json=json.dumps(words, ensure_ascii=False),
        requested_clips=requested,
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


def validate_highlights(
    raw: dict[str, Any],
    video_duration: float,
    requested_clips: int | None = None,
) -> list[HighlightCandidate]:
    requested = requested_clips or settings.max_clips
    candidates: list[HighlightCandidate] = []

    for rank, item in enumerate(raw.get("shorts", []), start=1):
        # Parse segments (new format) or fall back to start/end (legacy)
        raw_segments = item.get("segments")
        if not raw_segments:
            try:
                start = float(item["start"])
                end = float(item["end"])
                raw_segments = [{"start": start, "end": end}]
            except (KeyError, TypeError, ValueError):
                continue

        # Validate each segment
        valid_segments = []
        skip_candidate = False
        for seg in raw_segments:
            try:
                s = round(float(seg["start"]), 3)
                e = round(float(seg["end"]), 3)
            except (KeyError, TypeError, ValueError):
                skip_candidate = True
                break

            if s < 0:
                skip_candidate = True
                break
            if e > video_duration and e - video_duration <= 0.5:
                e = round(video_duration, 3)
            if e > video_duration:
                skip_candidate = True
                break

            seg_duration = e - s
            if seg_duration < 0.25:
                skip_candidate = True
                break

            valid_segments.append({"start": s, "end": e})

        if skip_candidate or not valid_segments:
            continue

        # Check total duration within limits
        total_duration = sum(seg["end"] - seg["start"] for seg in valid_segments)
        if total_duration < settings.min_clip_duration or total_duration > settings.max_clip_duration:
            continue

        # Check no internal overlaps (within this candidate)
        sorted_segs = sorted(valid_segments, key=lambda seg: seg["start"])
        has_internal_overlap = False
        for i in range(1, len(sorted_segs)):
            if sorted_segs[i]["start"] < sorted_segs[i - 1]["end"]:
                has_internal_overlap = True
                break
        if has_internal_overlap:
            continue

        candidate = HighlightCandidate(
            segments=valid_segments,
            rank=rank,
            viral_score=int(item.get("viral_score") or 0),
            source=item.get("source", "gemini"),
            video_description_for_tiktok=item.get("video_description_for_tiktok", ""),
            video_description_for_instagram=item.get(
                "video_description_for_instagram", ""
            ),
            video_title_for_youtube_short=item.get(
                "video_title_for_youtube_short", ""
            ),
            viral_hook_text=item.get("viral_hook_text", ""),
            metadata={
                "raw": item,
                "score_reason": item.get("score_reason", ""),
            },
        )
        candidates.append(candidate)

    # Cross-candidate overlap check
    candidates.sort(key=lambda c: c.rank)
    selected: list[HighlightCandidate] = []
    for candidate in candidates:
        if len(selected) >= requested:
            break
        # Check if any segment in this candidate overlaps any segment in already-selected candidates
        overlaps = False
        for existing in selected:
            for new_seg in candidate.segments:
                for ex_seg in existing.segments:
                    if new_seg["start"] < ex_seg["end"] and new_seg["end"] > ex_seg["start"]:
                        overlaps = True
                        break
                if overlaps:
                    break
            if overlaps:
                break
        if not overlaps:
            selected.append(candidate)
    return selected


def fallback_highlights(
    transcript: dict[str, Any],
    video_duration: float,
    requested_clips: int | None = None,
) -> list[HighlightCandidate]:
    normalized = TranscriptResult.model_validate(transcript)
    requested = min(requested_clips or 3, settings.max_clips)
    duration = min(settings.max_clip_duration, max(settings.min_clip_duration, 30))

    if video_duration <= duration:
        return [
            HighlightCandidate(
                segments=[{"start": 0, "end": round(video_duration, 3)}],
                rank=1,
                viral_score=0,
                source="fallback",
                viral_hook_text="Key moment",
                metadata={"reason": "video shorter than target window"},
            )
        ]

    words = normalized.words
    if not words:
        midpoint = max(0, (video_duration - duration) / 2)
        return [
            HighlightCandidate(
                segments=[
                    {
                        "start": round(midpoint, 3),
                        "end": round(midpoint + duration, 3),
                    }
                ],
                rank=1,
                viral_score=0,
                source="fallback",
                viral_hook_text="Key moment",
                metadata={"reason": "no word timestamps"},
            )
        ]

    windows: list[tuple[int, float, float]] = []
    step = max(5, int(duration // 2))
    current = 0.0
    while current + settings.min_clip_duration <= video_duration:
        end = min(video_duration, current + duration)
        count = sum(1 for word in words if current <= word.start <= end)
        windows.append((count, current, end))
        current += step

    windows.sort(key=lambda item: item[0], reverse=True)
    raw = {
        "shorts": [
            {
                "segments": [{"start": start, "end": end}],
                "source": "fallback",
                "viral_hook_text": "Key moment",
            }
            for _, start, end in windows[: requested * 3]
        ]
    }
    return validate_highlights(raw, video_duration, requested)


def detect_highlights(
    transcript_result: dict[str, Any],
    video_duration: float,
    api_key: str | None = None,
    model_name: str | None = None,
    requested_clips: int | None = None,
) -> list[dict[str, Any]]:
    api_key = api_key or settings.gemini_api_key
    model_name = model_name or settings.gemini_model_name
    if not api_key:
        return [
            clip.model_dump()
            for clip in fallback_highlights(transcript_result, video_duration, requested_clips)
        ]

    try:
        from google import genai

        prompt = build_prompt(transcript_result, video_duration, requested_clips)
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(model=model_name, contents=prompt)
        raw = extract_json_response(response.text or "")
        clips = validate_highlights(raw, video_duration, requested_clips)
        if clips:
            return [clip.model_dump() for clip in clips]
        logger.warning("Gemini returned no valid clips; using fallback highlights")
    except Exception as exc:
        logger.error("Highlight detection failed: %s", exc)

    return [
        clip.model_dump()
        for clip in fallback_highlights(transcript_result, video_duration, requested_clips)
    ]
