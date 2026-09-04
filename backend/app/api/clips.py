from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user
from app.database import get_db
from app.models.clip import Clip
from app.models.job import Job
from app.models.user import User
from app.schemas.clip import ClipList, ClipRead
from app.services.storage import get_storage_backend, storage_key_from_reference
from app.utils.signed_url import make_signed_media_url

router = APIRouter(prefix="/api/clips", tags=["clips"])


def _fresh_read_url(
    storage, storage_key: str | None, fallback: str | None
) -> str | None:
    key = storage_key or storage_key_from_reference(fallback)
    if not key:
        return fallback
    remote_url = storage.signed_read_url(key)
    return remote_url or make_signed_media_url(key)


def _clip_response(clip: Clip, storage) -> ClipRead:
    response = ClipRead.model_validate(clip)
    return response.model_copy(
        update={
            "file_url": _fresh_read_url(
                storage, clip.file_storage_key, clip.file_url or clip.file_path
            ),
            "thumbnail_url": _fresh_read_url(
                storage,
                clip.thumbnail_storage_key,
                clip.thumbnail_url or clip.thumbnail_path,
            ),
            "source_video_url": _fresh_read_url(
                storage, clip.source_storage_key, clip.source_video_url
            ),
        }
    )


@router.get("", response_model=ClipList)
async def list_clips(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ClipList:
    result = await db.execute(
        select(Clip)
        .where(Clip.user_id == user.id)
        .options(selectinload(Clip.job))
        .order_by(desc(Clip.created_at))
        .limit(200)
    )
    storage = get_storage_backend()
    return ClipList(
        clips=[_clip_response(clip, storage) for clip in result.scalars().all()]
    )


@router.get("/{clip_id}", response_model=ClipRead)
async def get_clip(
    clip_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ClipRead:
    result = await db.execute(
        select(Clip).where(Clip.id == clip_id).options(selectinload(Clip.job))
    )
    clip = result.scalar_one_or_none()
    if not clip or clip.user_id != user.id:
        raise HTTPException(status_code=404, detail="Clip not found")
    return _clip_response(clip, get_storage_backend())


@router.delete(
    "/{clip_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response
)
async def delete_clip(
    clip_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    clip = await db.get(Clip, clip_id)
    if not clip or clip.user_id != user.id:
        raise HTTPException(status_code=404, detail="Clip not found")

    job = await db.get(Job, clip.job_id, with_for_update=True, populate_existing=True)
    if job and (job.active_edit_tasks or job.processing_active):
        raise HTTPException(
            status_code=409, detail="Wait for active processing to finish"
        )

    keys = {
        key
        for value in (
            clip.file_path,
            clip.file_url,
            clip.file_storage_key,
            clip.thumbnail_path,
            clip.thumbnail_url,
            clip.thumbnail_storage_key,
        )
        if (key := storage_key_from_reference(value))
    }
    try:
        storage = get_storage_backend()
        for key in sorted(keys):
            storage.delete_file(key)
        storage.delete_prefix(f"clips/{clip.job_id}/edits/{clip.id}/")
        storage.delete_prefix(f"work/{clip.job_id}/edits/{clip.id}/")
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Clip media could not be removed; the clip was not deleted",
        ) from exc

    await db.delete(clip)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
