from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from billiard.exceptions import SoftTimeLimitExceeded
from sqlalchemy import select, update

from app.database import SyncSessionLocal
from app.models.account_deletion_request import AccountDeletionRequest
from app.models.brand import BrandKit
from app.models.clip import Clip
from app.models.edit_delivery import EditDelivery
from app.models.job import Job
from app.models.job_delivery import JobDelivery
from app.models.user import User
from app.services.job_delivery import (
    LEASE_SECONDS,
    Heartbeat,
    OwnershipLost,
    assert_owner,
)
from app.utils.ffmpeg_utils import H264_DELIVERY_ARGS
from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)


class AccountDeletionPending(RuntimeError):
    """Cooperative cancellation signal for work owned by a frozen account."""


class JobAlreadyClaimed(RuntimeError):
    """Duplicate or late delivery; it must not mutate the existing job."""


class JobCancelled(RuntimeError):
    """Cooperative cancellation after an explicit user cancellation."""


@celery_app.task(name="sneepcut.placeholder")
def placeholder_task() -> dict[str, str]:
    return {"status": "pending", "message": "Processing tasks are wired in Phase 2"}


@celery_app.task(bind=True, name="sneepcut.process_video")
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


@celery_app.task(bind=True, name="sneepcut.process_job")
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
    user_instructions: str | None = None,
    source_storage_key: str | None = None,
) -> dict[str, Any]:
    from app.services.processing_pipeline import process_video_source

    claimed = False
    token = str(uuid.uuid4())
    heartbeat = None
    storage_attempt = None
    try:
        render_options = _mark_job_started(job_id, token)
        storage_attempt = render_options.get("attempt_id")
        claimed = True
        heartbeat = Heartbeat(job_id, token)
        heartbeat.__enter__()
        if source_storage_key:
            # Queue lifetime must not depend on a short-lived object read URL.
            # Upload ownership was checked by the API; validate it again at the
            # worker boundary before using the recorded durable object key.
            source = _job_upload_source(job_id, source_storage_key, storage_attempt)
        self.update_state(
            state="PROGRESS",
            meta={"progress": 5, "message": "Processing started"},
        )

        def _on_progress(status: str, pct: int, msg: str) -> None:
            _update_job_progress(job_id, status, pct, msg, token)
            self.update_state(state="PROGRESS", meta={"progress": pct, "message": msg})

        result = process_video_source(
            source=source,
            output_root=output_root,
            source_type=source_type,
            requested_clips=requested_clips,
            aspect_ratio=aspect_ratio,
            burn_subtitles=burn_subtitles,
            smart_crop=smart_crop,
            on_progress=_on_progress,
            user_instructions=user_instructions,
            storage_namespace=job_id,
            **render_options,
        )
        _mark_job_completed(job_id, result, token)
        self.update_state(
            state="PROGRESS",
            meta={"progress": 100, "message": "Processing complete"},
        )
        return result
    except (JobAlreadyClaimed, OwnershipLost):
        if claimed:
            _cleanup_job_storage(job_id, storage_attempt)
        return {"status": "ignored", "reason": "job_already_claimed_or_terminal"}
    except JobCancelled:
        _cleanup_job_storage(job_id, storage_attempt)
        return {"status": "cancelled", "reason": "user_cancelled"}
    except AccountDeletionPending:
        _mark_job_cancelled_for_deletion(job_id, token)
        _cleanup_job_storage(job_id, storage_attempt)
        return {
            "status": "cancelled",
            "reason": "account_deletion_pending",
        }
    except SoftTimeLimitExceeded:
        _mark_job_failed(
            job_id,
            "Processing exceeded the worker time limit. Retry with a shorter video "
            "or increase WORKER_SOFT_TIME_LIMIT and WORKER_TIME_LIMIT.",
            token,
        )
        raise
    except Exception as exc:
        _mark_job_failed(job_id, str(exc), token)
        raise
    finally:
        if heartbeat:
            heartbeat.__exit__(None, None, None)
        if claimed:
            _mark_job_processing_inactive(job_id, token)


def _account_deletion_pending(db, user_id: uuid.UUID) -> bool:
    return db.get(AccountDeletionRequest, user_id) is not None


def _ensure_account_active(db, user_id: uuid.UUID) -> None:
    if _account_deletion_pending(db, user_id):
        raise AccountDeletionPending("account deletion is pending")


def _update_job_progress(
    job_id: str, status: str, progress: int, message: str, token: str | None = None
) -> None:
    with SyncSessionLocal() as db:
        job = db.get(Job, uuid.UUID(job_id), with_for_update=True)
        if not job:
            raise AccountDeletionPending("job was deleted")
        assert_owner(db, job, token)
        if job.status == "cancelled":
            raise JobCancelled("job was cancelled")
        if job.status in {"completed", "failed"}:
            raise JobAlreadyClaimed("job is terminal")
        _ensure_account_active(db, job.user_id)
        job.status = status
        job.progress = progress
        job.progress_message = message
        db.commit()


def _mark_job_started(job_id: str, token: str | None = None) -> dict[str, Any]:
    with SyncSessionLocal() as db:
        job = db.get(Job, uuid.UUID(job_id), with_for_update=True)
        if not job:
            raise AccountDeletionPending("job was deleted")
        if job.status != "pending" or job.processing_active:
            raise JobAlreadyClaimed("job is already claimed or terminal")
        delivery = db.get(JobDelivery, job.id, with_for_update=True)
        if delivery:
            if not token:
                raise OwnershipLost("execution token required")
            delivery.token = token
            delivery.execution_count += 1
            delivery.lease_until = datetime.now(timezone.utc) + timedelta(
                seconds=LEASE_SECONDS
            )
        _ensure_account_active(db, job.user_id)
        from app.services.storage import storage_key_from_reference

        user = db.get(User, job.user_id)
        kit = db.scalar(select(BrandKit).where(BrandKit.user_id == job.user_id))
        brand = {
            "user_id": str(job.user_id),
            "apply_brand": bool(job.include_brand and kit),
            "hide_platform_badge": bool(
                user and user.plan == "agency" and kit and kit.hide_platform_badge
            ),
        }
        if job.include_brand and kit:
            brand.update(
                {
                    name: getattr(kit, name)
                    for name in (
                        "primary_color",
                        "secondary_color",
                        "font_family",
                        "apply_brand_colors",
                        "apply_brand_font",
                        "subtitle_font",
                        "subtitle_color",
                        "subtitle_bg_color",
                        "subtitle_bg_opacity",
                        "subtitle_position",
                        "watermark_position",
                        "watermark_opacity",
                    )
                }
            )
            brand["logo_key"] = storage_key_from_reference(kit.logo_path)
        job.status = "downloading"
        job.progress = 5
        job.progress_message = "Processing started"
        job.started_at = datetime.now(timezone.utc)
        job.processing_active = True
        db.commit()
        return {
            **({"attempt_id": token} if delivery else {}),
            "language": job.language,
            "subtitle_style": job.subtitle_style,
            "brand_settings": brand,
        }


def _mark_job_completed(
    job_id: str, result: dict[str, Any], token: str | None = None
) -> None:
    with SyncSessionLocal() as db:
        job = db.get(Job, uuid.UUID(job_id), with_for_update=True)
        if not job:
            raise AccountDeletionPending("job was deleted")
        assert_owner(db, job, token)
        if job.status == "cancelled":
            raise JobCancelled("job was cancelled")
        if job.status in {"completed", "failed"}:
            raise JobAlreadyClaimed("job is terminal")
        _ensure_account_active(db, job.user_id)
        job.source_storage_key = result.get("source_storage_key")
        job.source_video_url = result.get("source_video_url")
        # Compact transcript chunks power the editor AI assistant
        try:
            raw_segments = (result.get("transcript") or {}).get("segments") or []
            compact = [
                {
                    "s": round(float(seg.get("start", 0)), 2),
                    "e": round(float(seg.get("end", 0)), 2),
                    "text": (seg.get("text") or "").strip(),
                }
                for seg in raw_segments
                if (seg.get("text") or "").strip()
            ]
            job.transcript_segments = compact[:2000] or None
        except (TypeError, ValueError):
            job.transcript_segments = None

        transcript_text = result.get("transcript", {}).get("text")
        for clip_data in result.get("clips", []):
            metadata = clip_data.get("metadata") or {}
            file_storage_key = metadata.get("storage_key")
            file_path = metadata.get("storage_path") or file_storage_key
            if not file_storage_key or not file_path:
                raise RuntimeError("processed clip is missing its durable storage key")
            thumbnail_storage_key = metadata.get("thumbnail_storage_key")
            thumbnail_path = (
                metadata.get("thumbnail_storage_path")
                or thumbnail_storage_key
                or clip_data.get("thumbnail_path")
            )
            db.add(
                Clip(
                    job_id=job.id,
                    user_id=job.user_id,
                    title=clip_data.get("title")
                    or f"Clip {clip_data.get('index', '')}".strip(),
                    hook_text=clip_data.get("hook_text"),
                    viral_score=int(metadata.get("viral_score") or 0),
                    score_reason=metadata.get("score_reason"),
                    start_time=float(clip_data.get("start") or 0),
                    end_time=float(clip_data.get("end") or 0),
                    duration=float(clip_data.get("duration") or 0),
                    segments=[
                        {**segment, "order": index}
                        for index, segment in enumerate(clip_data.get("segments") or [])
                    ]
                    or None,
                    file_path=file_path,
                    file_url=metadata.get("public_url"),
                    file_storage_key=file_storage_key,
                    tiktok_file_storage_key=metadata.get("tiktok_storage_key"),
                    thumbnail_path=thumbnail_path,
                    thumbnail_url=metadata.get("thumbnail_url"),
                    thumbnail_storage_key=thumbnail_storage_key,
                    file_size=int(clip_data.get("file_size") or 0),
                    resolution=clip_data.get("resolution") or "unknown",
                    aspect_ratio=job.aspect_ratio,
                    has_subtitles=bool(clip_data.get("subtitled_file_path")),
                    contains_platform_badge=(
                        metadata.get("contains_platform_badge")
                        if isinstance(metadata.get("contains_platform_badge"), bool)
                        else None
                    ),
                    transcript_text=transcript_text,
                    caption_tiktok=metadata.get("raw", {}).get(
                        "video_description_for_tiktok"
                    ),
                    caption_instagram=metadata.get("raw", {}).get(
                        "video_description_for_instagram"
                    ),
                    caption_youtube=metadata.get("raw", {}).get(
                        "video_title_for_youtube_short"
                    ),
                    suggested_hashtags=metadata.get("raw", {}).get(
                        "suggested_hashtags"
                    ),
                )
            )

        # This second check closes the long processing window. The status and
        # every Clip row become visible in one commit, never as a partial job.
        _ensure_account_active(db, job.user_id)
        job.error_message = "\n".join(result.get("errors", [])) or None
        job.status = "completed"
        job.progress = 100
        job.progress_message = "Complete"
        job.completed_at = datetime.now(timezone.utc)
        db.commit()


@celery_app.task(bind=True, name="sneepcut.trim_clip")
def trim_clip_task(
    self,
    clip_id: str,
    start_time: float,
    end_time: float,
    burn_subtitles: bool = True,
    job_id: str | None = None,
    edit_token: str | None = None,
) -> dict[str, Any]:
    import subprocess

    from app.config import settings
    from app.services.storage import get_storage_backend
    from app.utils.file_utils import ensure_dir, safe_slug

    tracked_job_id: uuid.UUID | None = None
    new_storage_key: str | None = None
    new_tiktok_storage_key: str | None = None
    task_token = None
    storage = None
    try:
        tracked_job_id = uuid.UUID(job_id) if job_id else None
        storage = get_storage_backend()
        with SyncSessionLocal() as db:
            clip = db.get(Clip, uuid.UUID(clip_id))
            if not clip or not clip.file_path:
                raise ValueError("Clip not found or no source file")
            tracked_job_id = tracked_job_id or clip.job_id
            if clip.job_id != tracked_job_id:
                raise ValueError("Clip does not belong to the tracked job")
            job = db.get(Job, tracked_job_id)
            if not job:
                raise ValueError("Job not found")
            edit_token = _claim_edit(db, job.id, edit_token)
            _ensure_account_active(db, job.user_id)

            task_token = safe_slug(
                edit_token or getattr(self.request, "id", None) or uuid.uuid4().hex
            )
            work_dir = ensure_dir(
                Path(settings.local_media_root)
                / "work"
                / str(job.id)
                / "edits"
                / clip_id
                / task_token
            )
            source = _local_storage_input(
                storage,
                clip.file_storage_key,
                clip.file_path,
                work_dir / "source.mp4",
            )
            output = work_dir / "trimmed.mp4"

            tiktok_source: Path | None = None
            tiktok_output: Path | None = None
            if clip.tiktok_file_storage_key:
                tiktok_source = _local_storage_input(
                    storage,
                    clip.tiktok_file_storage_key,
                    None,
                    work_dir / "tiktok-source.mp4",
                )
                tiktok_output = work_dir / "tiktok-trimmed.mp4"

            def _trim(source_path: Path, output_path: Path) -> None:
                cmd = [
                    "ffmpeg",
                    "-y",
                    "-ss",
                    str(start_time),
                    "-to",
                    str(end_time),
                    "-i",
                    str(source_path),
                    *H264_DELIVERY_ARGS,
                    str(output_path),
                ]
                result = subprocess.run(
                    cmd, capture_output=True, text=True, timeout=300, check=False
                )
                if result.returncode != 0:
                    raise RuntimeError(f"FFmpeg trim failed: {result.stderr[:500]}")

            _trim(source, output)
            if tiktok_source and tiktok_output:
                _trim(tiktok_source, tiktok_output)
            _ensure_account_active(db, job.user_id)

            new_storage_key = f"clips/{job.id}/edits/{clip.id}/trim-{task_token}.mp4"
            storage_path = storage.save_file(output, new_storage_key)
            tiktok_storage_path: str | None = None
            if tiktok_output:
                new_tiktok_storage_key = (
                    f"clips/{job.id}/edits/{clip.id}/tiktok/trim-{task_token}.mp4"
                )
                tiktok_storage_path = storage.save_file(
                    tiktok_output, new_tiktok_storage_key
                )
            _ensure_account_active(db, job.user_id)

            previous_storage_key = clip.file_storage_key
            previous_tiktok_storage_key = clip.tiktok_file_storage_key
            _assert_edit_owner(db, job.id, edit_token)
            clip.file_path = storage_path
            clip.file_url = storage.public_url(new_storage_key)
            clip.file_storage_key = new_storage_key
            clip.tiktok_file_storage_key = (
                new_tiktok_storage_key if tiktok_storage_path else None
            )
            clip.start_time = start_time
            clip.end_time = end_time
            clip.duration = round(end_time - start_time, 3)
            clip.file_size = output.stat().st_size
            _complete_edit_delivery(db, job.id, edit_token)
            db.commit()

            if previous_storage_key and previous_storage_key != new_storage_key:
                _delete_superseded_object(storage, previous_storage_key)
            if previous_tiktok_storage_key:
                _delete_superseded_object(storage, previous_tiktok_storage_key)

            return {
                "clip_id": clip_id,
                "file_path": storage_path,
                "file_storage_key": new_storage_key,
                "tiktok_file_storage_key": new_tiktok_storage_key,
                "duration": clip.duration,
            }
    except (AccountDeletionPending, OwnershipLost):
        if storage and new_storage_key:
            _delete_superseded_object(storage, new_storage_key)
        if storage and new_tiktok_storage_key:
            _delete_superseded_object(storage, new_tiktok_storage_key)
        return {"status": "cancelled", "reason": "account_deletion_pending"}
    except Exception:
        if storage and new_storage_key:
            _delete_superseded_object(storage, new_storage_key)
        if storage and new_tiktok_storage_key:
            _delete_superseded_object(storage, new_tiktok_storage_key)
        raise
    finally:
        if tracked_job_id:
            if storage and task_token:
                _cleanup_edit_workspace(storage, tracked_job_id, clip_id, task_token)
            _finish_edit_tracking(tracked_job_id, edit_token)


@celery_app.task(bind=True, name="sneepcut.recut_clip")
def recut_clip_task(
    self,
    clip_id: str,
    segments: list[dict],
    job_id: str | None = None,
    edit_token: str | None = None,
) -> dict[str, Any]:
    from app.config import settings
    from app.services.clip_generator import extract_clip, generate_thumbnail
    from app.services.storage import get_storage_backend
    from app.utils.file_utils import ensure_dir, safe_slug

    tracked_job_id: uuid.UUID | None = None
    new_storage_keys: list[str] = []
    task_token = None
    storage = None
    try:
        tracked_job_id = uuid.UUID(job_id) if job_id else None
        storage = get_storage_backend()
        with SyncSessionLocal() as db:
            clip = db.get(Clip, uuid.UUID(clip_id))
            if not clip:
                raise ValueError(f"Clip {clip_id} not found")
            tracked_job_id = tracked_job_id or clip.job_id
            if clip.job_id != tracked_job_id:
                raise ValueError("Clip does not belong to the tracked job")
            job = db.get(Job, tracked_job_id)
            if not job:
                raise ValueError("Source video not available")
            edit_token = _claim_edit(db, job.id, edit_token)
            _ensure_account_active(db, job.user_id)

            task_token = safe_slug(
                edit_token or getattr(self.request, "id", None) or uuid.uuid4().hex
            )
            work_dir = ensure_dir(
                Path(settings.local_media_root)
                / "work"
                / str(job.id)
                / "edits"
                / clip_id
                / task_token
            )
            source_path = _local_storage_input(
                storage,
                _recut_source_key(job),
                None,
                work_dir / "source.mp4",
            )
            output_path = work_dir / "recut.mp4"

            sorted_segs = sorted(segments, key=lambda segment: segment["order"])
            if not extract_clip(str(source_path), str(output_path), sorted_segs):
                raise RuntimeError("FFmpeg extraction failed")

            thumbnail_path = work_dir / "recut-thumb.jpg"
            thumbnail_created = generate_thumbnail(
                str(output_path), str(thumbnail_path), timestamp=1.0
            )
            _ensure_account_active(db, job.user_id)

            file_storage_key = f"clips/{job.id}/edits/{clip.id}/recut-{task_token}.mp4"
            new_storage_keys.append(file_storage_key)
            file_storage_path = storage.save_file(output_path, file_storage_key)
            thumbnail_storage_key: str | None = None
            thumbnail_storage_path: str | None = None
            if thumbnail_created and thumbnail_path.is_file():
                thumbnail_storage_key = (
                    f"clips/{job.id}/edits/{clip.id}/recut-{task_token}.jpg"
                )
                new_storage_keys.append(thumbnail_storage_key)
                thumbnail_storage_path = storage.save_file(
                    thumbnail_path, thumbnail_storage_key
                )
            _ensure_account_active(db, job.user_id)

            old_storage_keys = {
                key
                for key in (
                    clip.file_storage_key,
                    clip.thumbnail_storage_key,
                    clip.tiktok_file_storage_key,
                )
                if key
            }
            _assert_edit_owner(db, job.id, edit_token)
            clip.file_path = file_storage_path
            clip.file_url = storage.public_url(file_storage_key)
            clip.file_storage_key = file_storage_key
            # A recut changes the content timeline, so the generated TikTok
            # derivative no longer represents this edit.
            clip.tiktok_file_storage_key = None
            # Recut uses the original source and does not apply the app badge.
            # A trim operates on the rendered clip and preserves its provenance.
            clip.contains_platform_badge = False
            clip.segments = segments
            clip.start_time = min(segment["start"] for segment in segments)
            clip.end_time = max(segment["end"] for segment in segments)
            clip.duration = sum(
                segment["end"] - segment["start"] for segment in segments
            )
            clip.file_size = output_path.stat().st_size
            clip.thumbnail_path = thumbnail_storage_path
            clip.thumbnail_url = (
                storage.public_url(thumbnail_storage_key)
                if thumbnail_storage_key
                else None
            )
            clip.thumbnail_storage_key = thumbnail_storage_key
            _complete_edit_delivery(db, job.id, edit_token)
            db.commit()

            for old_storage_key in old_storage_keys - set(new_storage_keys):
                _delete_superseded_object(storage, old_storage_key)

            return {
                "status": "completed",
                "clip_id": clip_id,
                "file_storage_key": file_storage_key,
                "thumbnail_storage_key": thumbnail_storage_key,
            }
    except (AccountDeletionPending, OwnershipLost):
        if storage:
            for storage_key in new_storage_keys:
                _delete_superseded_object(storage, storage_key)
        return {"status": "cancelled", "reason": "account_deletion_pending"}
    except Exception:
        if storage:
            for storage_key in new_storage_keys:
                _delete_superseded_object(storage, storage_key)
        raise
    finally:
        if tracked_job_id:
            if storage and task_token:
                _cleanup_edit_workspace(storage, tracked_job_id, clip_id, task_token)
            _finish_edit_tracking(tracked_job_id, edit_token)


def _recut_source_key(job) -> str:
    from app.services.storage import storage_key_from_reference

    # Old jobs persisted a signed URL containing a generated storage identifier,
    # not the database job id. Resolve the recorded reference, never guess a path.
    key = job.source_storage_key or storage_key_from_reference(job.source_video_url)
    if not key:
        key = storage_key_from_reference(job.source_file_path)
    if not key:
        raise ValueError("Source video is no longer available for recut")
    job.source_storage_key = key
    return key


def _local_storage_input(
    storage,
    storage_key: str | None,
    existing_path: str | None,
    destination: Path,
) -> Path:
    if existing_path:
        candidate = Path(existing_path)
        if candidate.is_file():
            return candidate
    if not storage_key:
        raise FileNotFoundError("durable storage key is missing")
    return Path(storage.download_file(storage_key, destination))


def _delete_superseded_object(storage, storage_key: str) -> None:
    try:
        storage.delete_file(storage_key)
    except Exception:
        logger.warning("Could not remove superseded storage object", exc_info=True)


def _cleanup_edit_workspace(storage, job_id, clip_id, token):
    from app.services.storage import LocalStorage

    try:
        LocalStorage().delete_prefix(f"work/{job_id}/edits/{clip_id}/{token}")
    except Exception:
        logger.warning("Edit workspace cleanup failed for %s", job_id, exc_info=True)


def _assert_edit_owner(db, job_id, token):
    job = db.get(Job, job_id, with_for_update=True, populate_existing=True)
    if not job:
        raise OwnershipLost()
    current = getattr(job, "active_edit_token", None)
    if token is None and current is None:
        return job  # Legacy tasks are supported only across a drained rollout.
    deadline = getattr(job, "edit_deadline", None)
    if current != token or not deadline or deadline <= datetime.now(timezone.utc):
        raise OwnershipLost()
    return job


def _claim_edit(db, job_id, reservation):
    job = _assert_edit_owner(db, job_id, reservation)
    if reservation is None:
        return None
    token = str(uuid.uuid4())
    delivery = db.scalar(
        select(EditDelivery)
        .where(
            EditDelivery.job_id == job_id,
            EditDelivery.reservation_token == reservation,
        )
        .with_for_update()
    )
    if delivery:
        if delivery.state != "pending":
            raise OwnershipLost()
        delivery.execution_token = token
        delivery.state = "running"
        delivery.last_error = None
    job.active_edit_token = token
    job.edit_deadline = datetime.now(timezone.utc) + timedelta(hours=1)
    db.commit()
    return token


def _complete_edit_delivery(db, job_id, token):
    if token:
        db.execute(
            update(EditDelivery)
            .where(
                EditDelivery.job_id == job_id,
                EditDelivery.execution_token == token,
                EditDelivery.state == "running",
            )
            .values(state="completed", completed_at=datetime.now(timezone.utc))
        )
        db.execute(
            update(Job)
            .where(Job.id == job_id, Job.active_edit_token == token)
            .values(active_edit_tasks=0, active_edit_token=None, edit_deadline=None)
        )


def _finish_edit_tracking(job_id: uuid.UUID, token: str | None = None) -> None:
    with SyncSessionLocal() as db:
        # Match dispatcher/claim lock order, including failure paths.
        job = db.get(Job, job_id, with_for_update=True)
        if not job or job.active_edit_token != token:
            return
        db.execute(
            update(Job)
            .where(
                Job.id == job_id,
                Job.active_edit_tasks > 0,
                Job.active_edit_token == token,
            )
            .values(
                active_edit_tasks=Job.active_edit_tasks - 1,
                active_edit_token=None,
                edit_deadline=None,
            )
        )
        if token:
            db.execute(
                update(EditDelivery)
                .where(
                    EditDelivery.job_id == job_id,
                    EditDelivery.execution_token == token,
                    EditDelivery.state == "running",
                )
                .values(
                    state="failed",
                    completed_at=datetime.now(timezone.utc),
                    last_error="Editing failed; retry the edit",
                )
            )
        db.commit()


def _job_upload_source(job_id: str, key: str, attempt: str) -> str:
    from app.config import settings
    from app.services.storage import get_storage_backend, storage_key_from_reference
    from app.utils.file_utils import ensure_dir

    with SyncSessionLocal() as db:
        job = db.get(Job, uuid.UUID(job_id))
        if not job:
            raise AccountDeletionPending("job was deleted")
        normalized = storage_key_from_reference(key)
        if (
            normalized != key
            or not key.startswith(f"uploads/{job.user_id}/")
            or len(key.split("/")) != 3
            or job.source_storage_key != key
        ):
            raise ValueError("Uploaded source does not belong to the job owner")
    destination = (
        ensure_dir(
            Path(settings.local_media_root)
            / "work"
            / job_id
            / "attempts"
            / str(uuid.UUID(attempt))
        )
        / "uploaded-source.mp4"
    )
    return str(get_storage_backend().download_file(key, destination))


def _mark_job_cancelled_for_deletion(job_id: str, token: str | None = None) -> None:
    with SyncSessionLocal() as db:
        job = db.get(Job, uuid.UUID(job_id), with_for_update=True)
        if not job or job.status in {"completed", "failed", "cancelled"}:
            return
        delivery = db.get(JobDelivery, job.id, with_for_update=True)
        if delivery and delivery.token is not None:
            assert_owner(db, job, token)
        job.status = "cancelled"
        job.progress_message = "Cancelled for account deletion"
        job.completed_at = datetime.now(timezone.utc)
        db.commit()


def _mark_job_processing_inactive(job_id: str, token: str | None = None) -> None:
    with SyncSessionLocal() as db:
        job = db.get(Job, uuid.UUID(job_id), with_for_update=True)
        if not job or not job.processing_active:
            return
        try:
            delivery = assert_owner(db, job, token)
        except OwnershipLost:
            return
        if delivery:
            delivery.lease_until = None
        job.processing_active = False
        db.commit()


def _cleanup_job_storage(job_id: str, token: str | None = None) -> None:
    from app.services.storage import get_storage_backend

    storage = get_storage_backend()
    prefixes = (
        f"sources/{job_id}/",
        f"clips/{job_id}/",
        f"work/{job_id}/",
        f"{job_id}/clips/",
    )
    if token:
        prefixes = (
            f"sources/{job_id}/attempts/{token}/",
            f"clips/{job_id}/attempts/{token}/",
            f"work/{job_id}/attempts/{token}/",
        )
    for prefix in prefixes:
        try:
            storage.delete_prefix(prefix)
        except Exception:
            logger.warning(
                "Could not clean cancelled job storage prefix %s",
                prefix,
                exc_info=True,
            )


def _mark_job_failed(job_id: str, error_message: str, token: str | None = None) -> None:
    with SyncSessionLocal() as db:
        job = db.get(Job, uuid.UUID(job_id), with_for_update=True)
        if not job:
            return
        if job.status in {"completed", "failed", "cancelled"}:
            return
        assert_owner(db, job, token)
        if _account_deletion_pending(db, job.user_id):
            job.status = "cancelled"
            job.progress_message = "Cancelled for account deletion"
            job.completed_at = datetime.now(timezone.utc)
            db.commit()
            return
        job.status = "failed"
        job.progress_message = "Failed"
        job.error_message = error_message
        job.completed_at = datetime.now(timezone.utc)
        db.execute(
            update(User)
            .where(User.id == job.user_id)
            .values(credits=User.credits + job.credits_charged)
            .execution_options(synchronize_session=False)
        )
        db.commit()
