from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.database import get_db
from app.models.clip import Clip
from app.models.user import User
from app.schemas.clip import ClipList, ClipRead

router = APIRouter(prefix="/api/clips", tags=["clips"])


@router.get("", response_model=ClipList)
async def list_clips(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ClipList:
    result = await db.execute(
        select(Clip).where(Clip.user_id == user.id).order_by(desc(Clip.created_at)).limit(200)
    )
    return ClipList(clips=list(result.scalars().all()))


@router.get("/{clip_id}", response_model=ClipRead)
async def get_clip(
    clip_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Clip:
    from sqlalchemy.orm import selectinload
    result = await db.execute(
        select(Clip).where(Clip.id == clip_id).options(selectinload(Clip.job))
    )
    clip = result.scalar_one_or_none()
    if not clip or clip.user_id != user.id:
        raise HTTPException(status_code=404, detail="Clip not found")
    return clip


@router.delete("/{clip_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
async def delete_clip(
    clip_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    clip = await db.get(Clip, clip_id)
    if not clip or clip.user_id != user.id:
        raise HTTPException(status_code=404, detail="Clip not found")
    await db.delete(clip)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
