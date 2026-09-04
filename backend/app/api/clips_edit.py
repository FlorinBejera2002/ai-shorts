# NOTE: no `from __future__ import annotations` here — string annotations cannot
# be resolved through slowapi's wrapper and break FastAPI request-body modeling
from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import ensure_account_active, get_current_user
from app.api.rate_limit import limiter
from app.config import settings
from app.database import get_db
from app.models.clip import Clip
from app.models.job import Job
from app.models.user import User
from app.schemas.clip import RecutRequest
from app.workers.tasks import recut_clip_task, trim_clip_task

router = APIRouter(prefix="/api/clips", tags=["clips-edit"])


class TrimRequest(BaseModel):
    start_time: float = Field(ge=0)
    end_time: float = Field(gt=0)
    burn_subtitles: bool = True


async def _begin_edit(db: AsyncSession, job: Job, user: User) -> None:
    await ensure_account_active(db, user.id)
    result = await db.execute(
        update(Job)
        .where(Job.id == job.id, Job.user_id == user.id)
        .values(active_edit_tasks=Job.active_edit_tasks + 1)
    )
    if result.rowcount != 1:
        raise HTTPException(status_code=409, detail="Job is no longer available")
    await db.commit()


async def _rollback_edit_tracking(db: AsyncSession, job_id: UUID) -> None:
    await db.execute(
        update(Job)
        .where(Job.id == job_id, Job.active_edit_tasks > 0)
        .values(active_edit_tasks=Job.active_edit_tasks - 1)
    )
    await db.commit()


@router.post("/{clip_id}/trim", status_code=status.HTTP_202_ACCEPTED)
@limiter.limit("20/hour")
async def trim_clip(
    request: Request,
    clip_id: UUID,
    # Explicit Body(): see assistant.py — slowapi wrapper breaks annotation resolution
    payload: TrimRequest = Body(),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    clip = await db.get(Clip, clip_id)
    if not clip or clip.user_id != user.id:
        raise HTTPException(status_code=404, detail="Clip not found")

    if not clip.file_path:
        raise HTTPException(status_code=400, detail="Clip has no source file")

    duration = payload.end_time - payload.start_time
    if duration < 3:
        raise HTTPException(status_code=400, detail="Trimmed clip must be at least 3 seconds")
    if duration > settings.max_clip_duration:
        raise HTTPException(status_code=400, detail=f"Clip cannot exceed {settings.max_clip_duration} seconds")

    job = await db.get(Job, clip.job_id)
    if not job:
        raise HTTPException(status_code=409, detail="Clip job is no longer available")
    await _begin_edit(db, job, user)
    try:
        task = trim_clip_task.delay(
            clip_id=str(clip.id),
            start_time=payload.start_time,
            end_time=payload.end_time,
            burn_subtitles=payload.burn_subtitles,
            job_id=str(job.id),
        )
    except Exception as exc:
        await _rollback_edit_tracking(db, job.id)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Editing service unavailable",
        ) from exc

    return {"task_id": task.id, "status": "trimming"}


@router.post("/{clip_id}/recut", status_code=status.HTTP_202_ACCEPTED)
@limiter.limit("20/hour")
async def recut_clip(
    request: Request,
    clip_id: UUID,
    # Explicit Body(): see assistant.py — slowapi wrapper breaks annotation resolution
    payload: RecutRequest = Body(),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    clip = await db.get(Clip, clip_id)
    if not clip or clip.user_id != user.id:
        raise HTTPException(status_code=404, detail="Clip not found")

    job = await db.get(Job, clip.job_id)
    if not job or not job.source_storage_key:
        raise HTTPException(status_code=400, detail="Source video not available")

    await _begin_edit(db, job, user)
    try:
        task = recut_clip_task.delay(
            clip_id=str(clip.id),
            segments=[s.model_dump() for s in payload.segments],
            job_id=str(job.id),
        )
    except Exception as exc:
        await _rollback_edit_tracking(db, job.id)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Editing service unavailable",
        ) from exc

    return {"task_id": task.id, "status": "processing"}
