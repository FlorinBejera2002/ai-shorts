from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from app.database import SyncSessionLocal
from app.models.clip import Clip
from app.models.job import Job
from app.models.user import User
from app.workers.celery_app import celery_app


@celery_app.task(name="clipforge.placeholder")
def placeholder_task() -> dict[str, str]:
    return {"status": "pending", "message": "Processing tasks are wired in Phase 2"}


@celery_app.task(bind=True, name="clipforge.process_video")
def process_video_task(
    self,
    source: str,
    output_root: str | None = None,
    source_type: str = "auto",
    requested_clips: int = 5,
    aspect_ratio: str = "9:16",
    burn_subtitles: bool | None = None,
    smart_crop: bool | None = None,
) -> dict[str, Any]:
    from app.services.processing_pipeline import process_video_source

    self.update_state(
        state="PROGRESS",
        meta={"progress": 1, "message": "Starting processing"},
    )
    result = process_video_source(
        source=source,
        output_root=output_root,
        source_type=source_type,
        requested_clips=requested_clips,
        aspect_ratio=aspect_ratio,
        burn_subtitles=burn_subtitles,
        smart_crop=smart_crop,
    )
    self.update_state(
        state="PROGRESS",
        meta={"progress": 100, "message": "Processing complete"},
    )
    return result


@celery_app.task(bind=True, name="clipforge.process_job")
def process_job_task(
    self,
    job_id: str,
    source: str,
    output_root: str | None = None,
    source_type: str = "auto",
    requested_clips: int = 5,
    aspect_ratio: str = "9:16",
    burn_subtitles: bool | None = None,
    smart_crop: bool | None = None,
) -> dict[str, Any]:
    from app.services.processing_pipeline import process_video_source

    _mark_job_started(job_id)
    self.update_state(
        state="PROGRESS",
        meta={"progress": 5, "message": "Processing started"},
    )

    def _on_progress(status: str, pct: int, msg: str) -> None:
        self.update_state(state="PROGRESS", meta={"progress": pct, "message": msg})
        _update_job_progress(job_id, status, pct, msg)

    try:
        result = process_video_source(
            source=source,
            output_root=output_root,
            source_type=source_type,
            requested_clips=requested_clips,
            aspect_ratio=aspect_ratio,
            burn_subtitles=burn_subtitles,
            smart_crop=smart_crop,
            on_progress=_on_progress,
        )
        _mark_job_completed(job_id, result)
        self.update_state(
            state="PROGRESS",
            meta={"progress": 100, "message": "Processing complete"},
        )
        return result
    except Exception as exc:
        _mark_job_failed(job_id, str(exc))
        raise


def _update_job_progress(job_id: str, status: str, progress: int, message: str) -> None:
    with SyncSessionLocal() as db:
        job = db.get(Job, uuid.UUID(job_id))
        if not job:
            return
        job.status = status
        job.progress = progress
        job.progress_message = message
        db.commit()


def _mark_job_started(job_id: str) -> None:
    with SyncSessionLocal() as db:
        job = db.get(Job, uuid.UUID(job_id))
        if not job:
            return
        job.status = "downloading"
        job.progress = 5
        job.progress_message = "Processing started"
        job.started_at = datetime.now(timezone.utc)
        db.commit()


def _mark_job_completed(job_id: str, result: dict[str, Any]) -> None:
    from app.utils.signed_url import make_signed_media_url

    with SyncSessionLocal() as db:
        job = db.get(Job, uuid.UUID(job_id))
        if not job:
            return
        job.status = "completed"
        job.progress = 100
        job.progress_message = "Complete"
        job.completed_at = datetime.now(timezone.utc)
        job.source_video_url = result.get("source_video_url")
        db.commit()

        transcript_text = result.get("transcript", {}).get("text")
        clip_errors: list[str] = []
        for clip_data in result.get("clips", []):
            try:
                final_path = (
                    clip_data.get("subtitled_file_path")
                    or clip_data.get("vertical_file_path")
                    or clip_data.get("file_path")
                    or ""
                )
                metadata = clip_data.get("metadata") or {}
                file_url = metadata.get("public_url") or make_signed_media_url(final_path)
                thumb_path = clip_data.get("thumbnail_path") or ""
                thumb_url = metadata.get("thumbnail_url") or make_signed_media_url(thumb_path)
                db.add(
                    Clip(
                        job_id=job.id,
                        user_id=job.user_id,
                        title=clip_data.get("title") or f"Clip {clip_data.get('index', '')}".strip(),
                        hook_text=clip_data.get("hook_text"),
                        viral_score=int(metadata.get("viral_score") or 0),
                        score_reason=metadata.get("score_reason"),
                        start_time=float(clip_data.get("start") or 0),
                        end_time=float(clip_data.get("end") or 0),
                        duration=float(clip_data.get("duration") or 0),
                        file_path=final_path,
                        file_url=file_url,
                        thumbnail_path=thumb_path,
                        thumbnail_url=thumb_url,
                        file_size=int(clip_data.get("file_size") or 0),
                        resolution=clip_data.get("resolution") or "unknown",
                        aspect_ratio=job.aspect_ratio,
                        has_subtitles=bool(clip_data.get("subtitled_file_path")),
                        transcript_text=transcript_text,
                        caption_tiktok=metadata.get("raw", {}).get("video_description_for_tiktok"),
                        caption_instagram=metadata.get("raw", {}).get("video_description_for_instagram"),
                        caption_youtube=metadata.get("raw", {}).get("video_title_for_youtube_short"),
                        suggested_hashtags=metadata.get("raw", {}).get("suggested_hashtags"),
                    )
                )
                db.commit()
            except Exception as exc:
                db.rollback()
                clip_errors.append(f"Clip {clip_data.get('index', '?')}: {exc}")

        all_errors = list(result.get("errors", [])) + clip_errors
        if all_errors:
            job = db.get(Job, uuid.UUID(job_id))
            if job:
                job.error_message = "\n".join(all_errors)
                db.commit()


@celery_app.task(bind=True, name="clipforge.trim_clip")
def trim_clip_task(
    self,
    clip_id: str,
    start_time: float,
    end_time: float,
    burn_subtitles: bool = True,
) -> dict[str, Any]:
    import subprocess
    from pathlib import Path

    from app.config import settings
    from app.utils.signed_url import make_signed_media_url

    with SyncSessionLocal() as db:
        clip = db.get(Clip, uuid.UUID(clip_id))
        if not clip or not clip.file_path:
            raise ValueError("Clip not found or no source file")

        source = Path(clip.file_path)
        if not source.is_file():
            raise ValueError(f"Source file not found: {source}")

        trimmed_name = f"{source.stem}_trimmed{source.suffix}"
        output = source.parent / trimmed_name

        cmd = [
            "ffmpeg", "-y",
            "-ss", str(start_time),
            "-to", str(end_time),
            "-i", str(source),
            "-c:v", "libx264",
            "-preset", "fast",
            "-crf", "23",
            "-c:a", "aac",
            "-b:a", "128k",
            str(output),
        ]

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        if result.returncode != 0:
            raise RuntimeError(f"FFmpeg trim failed: {result.stderr[:500]}")

        clip.file_path = str(output)
        clip.file_url = make_signed_media_url(str(output))
        clip.start_time = start_time
        clip.end_time = end_time
        clip.duration = round(end_time - start_time, 3)
        clip.file_size = output.stat().st_size
        db.commit()

        return {
            "clip_id": clip_id,
            "file_path": str(output),
            "duration": clip.duration,
        }


def _mark_job_failed(job_id: str, error_message: str) -> None:
    with SyncSessionLocal() as db:
        job = db.get(Job, uuid.UUID(job_id))
        if not job:
            return
        job.status = "failed"
        job.progress_message = "Failed"
        job.error_message = error_message
        job.completed_at = datetime.now(timezone.utc)
        user = db.get(User, job.user_id)
        if user:
            user.credits += job.credits_charged
        db.commit()
