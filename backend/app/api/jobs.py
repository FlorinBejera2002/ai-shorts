from __future__ import annotations

import ipaddress
import socket
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.api.rate_limit import limiter
from app.config import settings
from app.database import get_db
from app.models.job import Job
from app.models.user import User
from app.schemas.job import BatchJobCreate, BatchJobResult, JobCreate, JobList, JobRead, JobStatus
from app.workers.tasks import process_job_task

router = APIRouter(prefix="/api/jobs", tags=["jobs"])

YOUTUBE_HOSTS = {
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "youtu.be",
    "www.youtu.be",
}


def validate_source_url(source_type: str, source_url: str | None) -> None:
    if not source_url:
        return
    parsed = urlparse(source_url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise HTTPException(status_code=400, detail="Invalid source URL")
    hostname = parsed.hostname.lower()
    if source_type == "youtube" and hostname not in YOUTUBE_HOSTS:
        raise HTTPException(status_code=400, detail="Only YouTube URLs are allowed for YouTube jobs")
    try:
        for info in socket.getaddrinfo(hostname, None):
            address = ipaddress.ip_address(info[4][0])
            if address.is_private or address.is_loopback or address.is_link_local or address.is_multicast:
                raise HTTPException(status_code=400, detail="Private network URLs are not allowed")
    except socket.gaierror as exc:
        raise HTTPException(status_code=400, detail="Source URL host could not be resolved") from exc


def validate_user_upload_path(source_file_path: str | None, user: User) -> None:
    if not source_file_path:
        return
    media_root = Path(settings.local_media_root).resolve()
    user_upload_root = (media_root / "uploads" / str(user.id)).resolve()
    requested_path = Path(source_file_path).resolve()
    if user_upload_root not in requested_path.parents:
        raise HTTPException(status_code=400, detail="Invalid uploaded file path")
    if not requested_path.is_file():
        raise HTTPException(status_code=400, detail="Uploaded file was not found")


def calculate_credit_cost(num_clips: int, video_duration_minutes: float | None = None) -> int:
    duration_cost = int((video_duration_minutes or 0) * 10)
    return duration_cost + (num_clips * 10)


@router.post("", response_model=JobRead, status_code=status.HTTP_201_CREATED)
@limiter.limit("30/hour")
async def create_job(
    request: Request,
    payload: JobCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Job:
    credits_charged = calculate_credit_cost(payload.num_clips_requested)
    if user.credits < credits_charged:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="Insufficient credits",
        )

    source = payload.source_url or payload.source_file_path
    if not source:
        raise HTTPException(status_code=400, detail="Missing source")
    validate_source_url(payload.source_type, payload.source_url)
    validate_user_upload_path(payload.source_file_path, user)

    job = Job(
        user_id=user.id,
        source_type=payload.source_type,
        source_url=payload.source_url,
        source_file_path=payload.source_file_path,
        status="pending",
        progress=0,
        progress_message="Queued",
        num_clips_requested=payload.num_clips_requested,
        aspect_ratio=payload.aspect_ratio,
        language=payload.language,
        subtitle_style=payload.subtitle_style,
        include_brand=payload.include_brand,
        credits_charged=credits_charged,
    )
    user.credits -= credits_charged
    db.add(job)
    await db.commit()
    await db.refresh(job)

    try:
        task = process_job_task.delay(
            job_id=str(job.id),
            source=source,
            source_type="youtube" if payload.source_type == "youtube" else "auto",
            requested_clips=payload.num_clips_requested,
            aspect_ratio=payload.aspect_ratio,
            burn_subtitles=payload.burn_subtitles,
            smart_crop=payload.smart_crop,
        )
    except Exception:
        user.credits += credits_charged
        job.status = "failed"
        job.error_message = "Failed to queue processing task"
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Processing service unavailable",
        )
    job.celery_task_id = task.id
    job.status = "pending"
    job.progress_message = "Queued for processing"
    await db.commit()
    await db.refresh(job)
    return job


@router.get("", response_model=JobList)
async def list_jobs(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> JobList:
    result = await db.execute(
        select(Job).where(Job.user_id == user.id).order_by(desc(Job.created_at)).limit(100)
    )
    return JobList(jobs=list(result.scalars().all()))


@router.get("/{job_id}", response_model=JobStatus)
async def get_job(
    job_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> JobStatus:
    job = await db.get(Job, job_id)
    if not job or job.user_id != user.id:
        raise HTTPException(status_code=404, detail="Job not found")

    celery_state = None
    celery_meta = None
    if job.celery_task_id:
        async_result = process_job_task.AsyncResult(job.celery_task_id)
        celery_state = async_result.state
        celery_meta = async_result.info if isinstance(async_result.info, dict) else None
    return JobStatus(job=JobRead.model_validate(job), celery_state=celery_state, celery_meta=celery_meta)


@router.post("/{job_id}/cancel", response_model=JobRead)
async def cancel_job(
    job_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Job:
    job = await db.get(Job, job_id)
    if not job or job.user_id != user.id:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status in {"completed", "failed", "cancelled"}:
        return job
    if job.celery_task_id:
        process_job_task.AsyncResult(job.celery_task_id).revoke(terminate=True)
    job.status = "cancelled"
    job.progress_message = "Cancelled"
    job.completed_at = datetime.now(timezone.utc)
    user.credits += job.credits_charged
    await db.commit()
    await db.refresh(job)
    return job


@router.post("/batch", response_model=BatchJobResult, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/hour")
async def create_batch_jobs(
    request: Request,
    payload: BatchJobCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> BatchJobResult:
    total_credits = calculate_credit_cost(payload.num_clips_requested) * len(payload.source_urls)
    if user.credits < total_credits:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=f"Insufficient credits. Need {total_credits}, have {user.credits}",
        )

    created_jobs: list[Job] = []
    for url in payload.source_urls:
        validate_source_url("youtube", url)
        per_job_cost = calculate_credit_cost(payload.num_clips_requested)
        job = Job(
            user_id=user.id,
            source_type="youtube",
            source_url=url,
            status="pending",
            progress=0,
            progress_message="Queued (batch)",
            num_clips_requested=payload.num_clips_requested,
            aspect_ratio=payload.aspect_ratio,
            language=payload.language,
            subtitle_style=payload.subtitle_style,
            include_brand=payload.include_brand,
            credits_charged=per_job_cost,
        )
        user.credits -= per_job_cost
        db.add(job)
        await db.commit()
        await db.refresh(job)

        try:
            task = process_job_task.delay(
                job_id=str(job.id),
                source=url,
                source_type="youtube",
                requested_clips=payload.num_clips_requested,
                aspect_ratio=payload.aspect_ratio,
                burn_subtitles=payload.burn_subtitles,
                smart_crop=payload.smart_crop,
            )
            job.celery_task_id = task.id
            job.progress_message = "Queued for processing"
            await db.commit()
            await db.refresh(job)
        except Exception:
            user.credits += per_job_cost
            job.status = "failed"
            job.error_message = "Failed to queue processing task"
            await db.commit()

        created_jobs.append(job)

    return BatchJobResult(
        jobs=[JobRead.model_validate(j) for j in created_jobs],
        total_credits=total_credits,
    )
