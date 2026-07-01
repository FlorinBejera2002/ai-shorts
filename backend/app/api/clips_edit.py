from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
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


@router.post("/{clip_id}/trim", status_code=status.HTTP_202_ACCEPTED)
@limiter.limit("20/hour")
async def trim_clip(
    request: Request,
    clip_id: UUID,
    payload: TrimRequest,
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

    task = trim_clip_task.delay(
        clip_id=str(clip.id),
        start_time=payload.start_time,
        end_time=payload.end_time,
        burn_subtitles=payload.burn_subtitles,
    )

    return {"task_id": task.id, "status": "trimming"}


@router.post("/{clip_id}/recut", status_code=status.HTTP_202_ACCEPTED)
@limiter.limit("20/hour")
async def recut_clip(
    request: Request,
    clip_id: UUID,
    payload: RecutRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    clip = await db.get(Clip, clip_id)
    if not clip or clip.user_id != user.id:
        raise HTTPException(status_code=404, detail="Clip not found")

    job = await db.get(Job, clip.job_id)
    if not job or not job.source_video_url:
        raise HTTPException(status_code=400, detail="Source video not available")

    task = recut_clip_task.delay(
        clip_id=str(clip.id),
        segments=[s.model_dump() for s in payload.segments],
    )

    return {"task_id": task.id, "status": "processing"}
