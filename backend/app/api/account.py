from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_authenticated_user
from app.database import get_db
from app.models.account_deletion_request import AccountDeletionRequest
from app.models.brand import BrandKit
from app.models.clip import Clip
from app.models.job import Job
from app.models.user import User
from app.services.storage import get_storage_backend, storage_key_from_reference

router = APIRouter(prefix="/api/account", tags=["account"])
logger = logging.getLogger(__name__)

TERMINAL_JOB_STATUSES = {"completed", "failed", "cancelled"}


async def _account_has_active_work(db: AsyncSession, user_id) -> bool:
    active_job = await db.scalar(
        select(Job.id)
        .where(
            Job.user_id == user_id,
            or_(
                Job.status.not_in(TERMINAL_JOB_STATUSES),
                Job.processing_active.is_(True),
                Job.active_edit_tasks > 0,
            ),
        )
        .limit(1)
    )
    return active_job is not None


@router.delete("/media")
async def delete_owned_media(
    user: User = Depends(get_authenticated_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, int | bool]:
    deletion_request = await db.get(AccountDeletionRequest, user.id)
    if not deletion_request:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Account deletion has not been requested",
        )
    if not deletion_request.billing_cancellation_completed:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Billing cancellation must complete before media cleanup",
        )
    if await _account_has_active_work(db, user.id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Account media cleanup is waiting for active work to stop",
        )

    jobs = (
        await db.execute(
            select(
                Job.id,
                Job.source_file_path,
                Job.source_video_url,
                Job.source_storage_key,
            ).where(Job.user_id == user.id)
        )
    ).all()
    clips = (
        await db.execute(
            select(
                Clip.file_path,
                Clip.file_url,
                Clip.file_storage_key,
                Clip.tiktok_file_storage_key,
                Clip.thumbnail_path,
                Clip.thumbnail_url,
                Clip.thumbnail_storage_key,
            ).where(Clip.user_id == user.id)
        )
    ).all()
    brand = (
        await db.execute(
            select(
                BrandKit.logo_path,
                BrandKit.intro_video_path,
                BrandKit.outro_video_path,
                BrandKit.watermark_path,
            ).where(BrandKit.user_id == user.id)
        )
    ).one_or_none()

    candidates: set[str] = set()
    prefixes = {
        f"uploads/{user.id}/",
        f"brand/{user.id}/",
    }
    for job in jobs:
        for value in (
            job.source_file_path,
            job.source_video_url,
            job.source_storage_key,
        ):
            key = storage_key_from_reference(value)
            if key:
                candidates.add(key)
        # Prefixes cover deterministic current storage plus historical recut
        # layouts and every partial object left by an interrupted worker.
        prefixes.update(
            {
                f"sources/{job.id}/",
                f"clips/{job.id}/",
                f"work/{job.id}/",
                f"{job.id}/clips/",
            }
        )
    for clip in clips:
        for value in (
            clip.file_path,
            clip.file_url,
            clip.file_storage_key,
            clip.tiktok_file_storage_key,
            clip.thumbnail_path,
            clip.thumbnail_url,
            clip.thumbnail_storage_key,
        ):
            key = storage_key_from_reference(value)
            if key:
                candidates.add(key)
    if brand:
        for value in brand:
            key = storage_key_from_reference(value)
            if key:
                candidates.add(key)

    storage = get_storage_backend()
    failures = 0
    deleted = 0
    for prefix in sorted(prefixes):
        try:
            deleted += storage.delete_prefix(prefix)
        except Exception:
            failures += 1
            logger.warning(
                "Account media prefix cleanup failed for user %s",
                user.id,
                exc_info=True,
            )
    for key in sorted(candidates):
        try:
            storage.delete_file(key)
            deleted += 1
        except Exception:
            failures += 1
            logger.warning(
                "Account media object cleanup failed for user %s",
                user.id,
                exc_info=True,
            )

    if failures:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=(
                "Some account media could not be removed. "
                "No database records were deleted."
            ),
        )

    # A worker that was already between cooperative checkpoints may have
    # changed state while storage was being removed. Refuse finalization so a
    # retry performs cleanup again after the worker has fully quiesced.
    if await _account_has_active_work(db, user.id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Account media cleanup is waiting for active work to stop",
        )

    return {"deleted": deleted, "complete": True}
