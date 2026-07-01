from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from app.schemas.processing import ClipOutput, HighlightCandidate
from app.utils.ffmpeg_utils import (
    get_video_duration,
    get_video_resolution,
    has_audio_stream,
    run_ffmpeg,
    validate_video_file,
)
from app.utils.file_utils import ensure_dir, unique_path

logger = logging.getLogger(__name__)


def validate_clip_window(
    start: float,
    end: float,
    video_duration: float,
    min_duration: float = 0.25,
) -> None:
    if start < 0:
        raise ValueError("clip start must be >= 0")
    if end <= start:
        raise ValueError("clip end must be greater than start")
    if end > video_duration + 0.01:
        raise ValueError("clip end exceeds video duration")
    if end - start < min_duration:
        raise ValueError("clip duration is too short")


def extract_clip(
    input_video: str,
    output_path: str,
    start: float,
    end: float,
    crf: int = 18,
    preset: str = "fast",
) -> bool:
    try:
        validate_video_file(input_video)
        video_duration = get_video_duration(input_video)
        validate_clip_window(start, end, video_duration)
        ensure_dir(Path(output_path).parent)

        cmd = [
            "ffmpeg",
            "-y",
            "-ss",
            str(start),
            "-to",
            str(end),
            "-i",
            input_video,
            "-c:v",
            "libx264",
            "-crf",
            str(crf),
            "-preset",
            preset,
        ]
        if has_audio_stream(input_video):
            cmd.extend(["-c:a", "aac"])
        else:
            cmd.extend(["-an"])
        cmd.append(output_path)
        run_ffmpeg(cmd)
        return True
    except Exception as exc:
        logger.error("FFmpeg clip extraction failed: %s", exc)
        return False


def generate_thumbnail(
    input_video: str,
    output_path: str,
    timestamp: float = 0.25,
) -> bool:
    try:
        ensure_dir(Path(output_path).parent)
        run_ffmpeg(
            [
                "ffmpeg",
                "-y",
                "-ss",
                str(max(0, timestamp)),
                "-i",
                input_video,
                "-frames:v",
                "1",
                "-q:v",
                "2",
                output_path,
            ],
            timeout=120,
        )
        return True
    except Exception as exc:
        logger.warning("Thumbnail generation failed: %s", exc)
        return False


def extract_all_clips(
    input_video: str,
    clips_data: list[dict[str, Any]],
    output_dir: str,
    video_title: str,
    generate_thumbnails: bool = True,
) -> list[dict[str, Any]]:
    validate_video_file(input_video)
    video_duration = get_video_duration(input_video)
    output_directory = ensure_dir(output_dir)
    extracted_clips: list[dict[str, Any]] = []

    for i, clip_data in enumerate(clips_data, start=1):
        try:
            clip = HighlightCandidate.model_validate({**clip_data, "rank": i})
            validate_clip_window(clip.start, clip.end, video_duration)
        except Exception as exc:
            logger.warning("Skipping invalid clip %s: %s", i, exc)
            continue

        output_path = unique_path(output_directory, f"{video_title}-clip-{i}", ".mp4")
        if not extract_clip(input_video, str(output_path), clip.start, clip.end):
            continue

        thumbnail_path = None
        if generate_thumbnails:
            thumb = unique_path(output_directory, f"{output_path.stem}-thumb", ".jpg")
            if generate_thumbnail(str(output_path), str(thumb)):
                thumbnail_path = str(thumb)

        file_size = output_path.stat().st_size if output_path.exists() else 0
        metadata = ClipOutput(
            index=i,
            start=clip.start,
            end=clip.end,
            duration=round(clip.end - clip.start, 3),
            title=clip.video_title_for_youtube_short,
            hook_text=clip.viral_hook_text,
            file_path=str(output_path),
            file_name=output_path.name,
            file_size=file_size,
            resolution=get_video_resolution(output_path),
            thumbnail_path=thumbnail_path,
            metadata={
                "video_description_for_tiktok": clip.video_description_for_tiktok,
                "video_description_for_instagram": clip.video_description_for_instagram,
                "source": clip.source,
                "viral_score": clip.metadata.get("viral_score", 0),
                "score_reason": clip.metadata.get("score_reason", ""),
            },
        )
        extracted_clips.append(metadata.model_dump())

    logger.info("Extracted %s clips from %s candidates", len(extracted_clips), len(clips_data))
    return extracted_clips


def get_video_duration_ffprobe(video_path: str) -> float:
    return get_video_duration(video_path)
