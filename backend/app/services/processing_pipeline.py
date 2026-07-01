from __future__ import annotations

import logging
import shutil
import uuid
from pathlib import Path
from typing import Any

from app.config import settings
from app.schemas.processing import PipelineResult, SourceVideo, TranscriptResult
from app.services.clip_generator import extract_all_clips
from app.services.highlight_detector import detect_highlights
from app.services.storage import get_storage_backend
from app.services.transcriber import transcribe_video
from app.services.video_downloader import copy_local_video, download_video, is_url
from app.utils.ffmpeg_utils import get_video_duration, validate_video_file
from app.utils.file_utils import create_job_workspace, ensure_dir, safe_slug, unique_path

logger = logging.getLogger(__name__)


def process_video_source(
    source: str,
    output_root: str | None = None,
    source_type: str = "auto",
    requested_clips: int = 5,
    aspect_ratio: str = "9:16",
    burn_subtitles: bool | None = None,
    smart_crop: bool | None = None,
    on_progress: Any | None = None,
) -> dict[str, Any]:
    def _progress(status: str, pct: int, msg: str) -> None:
        if on_progress:
            on_progress(status, pct, msg)

    output_root = output_root or settings.local_media_root
    burn_subtitles = settings.subtitles_enabled if burn_subtitles is None else burn_subtitles
    smart_crop = settings.smart_crop_enabled if smart_crop is None else smart_crop

    job_id = uuid.uuid4().hex
    workspace = create_job_workspace(output_root, job_id)
    source_dir = ensure_dir(workspace / "source")
    clips_dir = ensure_dir(workspace / "clips")
    errors: list[str] = []

    _progress("downloading", 5, "Downloading video")
    source_info = _prepare_source(source, source_type, source_dir)
    source_video = SourceVideo.model_validate(source_info)
    validate_video_file(source_video.local_path)
    video_duration = source_video.duration or get_video_duration(source_video.local_path)

    _progress("transcribing", 20, "Transcribing audio with Whisper")
    transcript = TranscriptResult.model_validate(transcribe_video(source_video.local_path))

    _progress("analyzing", 50, "Detecting viral highlights with AI")
    highlights = detect_highlights(
        transcript.model_dump(),
        video_duration,
        requested_clips=requested_clips,
    )

    _progress("clipping", 60, f"Extracting {len(highlights)} clips")
    extracted = extract_all_clips(
        source_video.local_path,
        highlights,
        str(clips_dir),
        safe_slug(source_video.title),
    )

    _progress("rendering", 70, "Smart crop & subtitles")
    processed_clips: list[dict[str, Any]] = []
    for i, clip in enumerate(extracted, 1):
        _progress("rendering", 70 + int(20 * i / max(len(extracted), 1)), f"Rendering clip {i}/{len(extracted)}")
        current_path = clip["file_path"]
        try:
            if smart_crop and aspect_ratio == "9:16":
                vertical_path = unique_path(
                    clips_dir,
                    f"{Path(current_path).stem}-vertical",
                    ".mp4",
                )
                from app.services.smart_crop import process_video_to_vertical

                if process_video_to_vertical(current_path, str(vertical_path)):
                    clip["vertical_file_path"] = str(vertical_path)
                    current_path = str(vertical_path)
        except Exception as exc:
            message = f"smart crop failed for clip {clip['index']}: {exc}"
            logger.warning(message)
            errors.append(message)

        try:
            if burn_subtitles:
                from app.services.subtitle_burner import burn_subtitles as burn
                from app.services.subtitle_burner import generate_srt

                srt_path = unique_path(clips_dir, f"{Path(current_path).stem}", ".srt")
                final_path = unique_path(clips_dir, f"{Path(current_path).stem}-final", ".mp4")
                if generate_srt(
                    transcript.model_dump(),
                    clip_start=clip["start"],
                    clip_end=clip["end"],
                    output_path=str(srt_path),
                ) and burn(current_path, str(srt_path), str(final_path)):
                    clip["subtitled_file_path"] = str(final_path)
                    clip["metadata"]["srt_path"] = str(srt_path)
        except Exception as exc:
            message = f"subtitle burn failed for clip {clip['index']}: {exc}"
            logger.warning(message)
            errors.append(message)

        processed_clips.append(clip)

    storage = get_storage_backend()
    storage.save_file(source_video.local_path, f"sources/{job_id}/source.mp4")
    for clip in processed_clips:
        final_path = (
            clip.get("subtitled_file_path")
            or clip.get("vertical_file_path")
            or clip["file_path"]
        )
        key = f"clips/{job_id}/{Path(final_path).name}"
        storage_path = storage.save_file(final_path, key)
        clip["metadata"]["storage_path"] = storage_path
        clip["metadata"]["public_url"] = storage.public_url(key)

    result = PipelineResult(
        source=source_video,
        transcript=transcript,
        clips=processed_clips,
        errors=errors,
    ).model_dump()

    # Persist source video URL for clip editor re-cutting
    source_storage_key = f"sources/{job_id}/source.mp4"
    result["source_video_url"] = storage.public_url(source_storage_key)

    return result


def _prepare_source(source: str, source_type: str, source_dir: Path) -> dict[str, Any]:
    if source_type == "auto":
        source_type = "url" if is_url(source) else "local"

    if source_type in {"url", "youtube"}:
        return download_video(source, source_dir)

    if source_type != "local":
        raise ValueError(f"unsupported source_type: {source_type}")

    local = Path(source)
    if not local.exists():
        raise FileNotFoundError(f"source video not found: {source}")

    copied = copy_local_video(str(local), source_dir)
    if copied["local_path"] == str(local):
        destination = source_dir / f"{safe_slug(local.stem)}{local.suffix or '.mp4'}"
        shutil.copy2(local, destination)
        copied["local_path"] = str(destination)
    return copied
