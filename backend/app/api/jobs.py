import ipaddress
import logging
import socket
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse
from uuid import UUID, uuid4

from fastapi import APIRouter, Body, Depends, HTTPException, Request, status
from sqlalchemy import desc, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.api.deps import ensure_account_active, get_current_user
from app.api.rate_limit import limiter
from app.config import settings
from app.database import get_db
from app.models.account_deletion_request import AccountDeletionRequest
from app.models.job import Job
from app.models.job_delivery import JobDelivery
from app.models.user import User
from app.schemas.job import (
    BatchJobCreate,
    BatchJobResult,
    JobCreate,
    JobList,
    JobRead,
    JobStatus,
)
from app.workers.tasks import process_job_task

router = APIRouter(prefix="/api/jobs", tags=["jobs"])
logger = logging.getLogger(__name__)
TERMINAL_STATUSES = {"completed", "failed", "cancelled"}

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
        raise HTTPException(
            status_code=400, detail="Only YouTube URLs are allowed for YouTube jobs"
        )
    try:
        for info in socket.getaddrinfo(hostname, None):
            address = ipaddress.ip_address(info[4][0])
            if (
                address.is_private
                or address.is_loopback
                or address.is_link_local
                or address.is_multicast
            ):
                raise HTTPException(
                    status_code=400, detail="Private network URLs are not allowed"
                )
    except socket.gaierror as exc:
        raise HTTPException(
            status_code=400, detail="Source URL host could not be resolved"
        ) from exc


def validate_user_upload_path(source_file_path: str | None, user: User) -> None:
    if not source_file_path:
        return
    media_root = Path(settings.local_media_root).resolve()
    user_upload_root = (media_root / "uploads" / str(user.id)).resolve()
    requested_path = Path(source_file_path).resolve()
    if (
        requested_path.parent != user_upload_root
        or requested_path.name.startswith(".")
        or requested_path.suffix.lower()
        not in {".mp4", ".mov", ".avi", ".mkv", ".webm"}
    ):
        raise HTTPException(status_code=400, detail="Invalid uploaded file path")
    if not requested_path.is_file():
        raise HTTPException(status_code=400, detail="Uploaded file was not found")


def calculate_credit_cost(
    num_clips: int, video_duration_minutes: float | None = None
) -> int:
    duration_cost = int((video_duration_minutes or 0) * 10)
    return duration_cost + (num_clips * 10)


async def _reserve_credits(db: AsyncSession, user_id: UUID, amount: int) -> None:
    # Check and debit in one statement: stale authenticated User objects must
    # never overwrite another request's debit/refund.
    reserved = await db.scalar(
        update(User)
        .where(
            User.id == user_id,
            User.credits >= amount,
            ~select(AccountDeletionRequest.user_id)
            .where(AccountDeletionRequest.user_id == user_id)
            .exists(),
        )
        .values(credits=User.credits - amount)
        .returning(User.id)
        .execution_options(synchronize_session=False)
    )
    if reserved is None:
        await ensure_account_active(db, user_id)
        raise HTTPException(status_code=402, detail="Insufficient credits")


async def _dispatch_job(db: AsyncSession, job: Job) -> None:
    # Persist task identity before publishing. Never reset status after publish:
    # a fast worker can already have started or even completed the job.
    from app.services.job_delivery import publish_job

    await run_in_threadpool(publish_job, str(job.id))
    await db.refresh(job)


def _delivery(job: Job, payload) -> JobDelivery:
    return JobDelivery(
        job_id=job.id,
        payload={
            "job_id": str(job.id),
            "source": job.source_url or job.source_file_path,
            "source_type": "youtube" if job.source_type == "youtube" else "auto",
            "requested_clips": job.num_clips_requested,
            "aspect_ratio": job.aspect_ratio,
            "burn_subtitles": payload.burn_subtitles,
            "smart_crop": payload.smart_crop,
            "user_instructions": job.user_instructions,
        },
    )


@router.post("", response_model=JobRead, status_code=status.HTTP_201_CREATED)
@limiter.limit("30/hour")
async def create_job(
    request: Request,
    payload: JobCreate = Body(),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Job:
    credits_charged = calculate_credit_cost(payload.num_clips_requested)

    source = payload.source_url or payload.source_file_path
    if not source:
        raise HTTPException(status_code=400, detail="Missing source")
    await run_in_threadpool(
        validate_source_url, payload.source_type, payload.source_url
    )
    await run_in_threadpool(validate_user_upload_path, payload.source_file_path, user)
    await _reserve_credits(db, user.id, credits_charged)

    job = Job(
        id=uuid4(),
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
        user_instructions=payload.user_instructions,
        credits_charged=credits_charged,
        celery_task_id=str(uuid4()),
    )
    db.add(job)
    db.add(_delivery(job, payload))
    await db.commit()
    await db.refresh(job)

    await _dispatch_job(db, job)
    return job


@router.get("", response_model=JobList)
async def list_jobs(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> JobList:
    result = await db.execute(
        select(Job)
        .where(Job.user_id == user.id)
        .order_by(desc(Job.created_at))
        .limit(100)
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

    # The worker persists every progress transition. Polling must not block the
    # async API on synchronous Redis result-backend calls (or fail if Redis is down).
    return JobStatus(job=JobRead.model_validate(job))


@router.post("/{job_id}/cancel", response_model=JobRead)
async def cancel_job(
    job_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Job:
    job = await db.get(Job, job_id, with_for_update=True, populate_existing=True)
    if not job or job.user_id != user.id:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status in TERMINAL_STATUSES:
        return job
    job.status = "cancelled"
    job.progress_message = "Cancelled"
    job.completed_at = datetime.now(timezone.utc)
    await db.execute(
        update(User)
        .where(User.id == user.id)
        .values(credits=User.credits + job.credits_charged)
        .execution_options(synchronize_session=False)
    )
    await db.commit()
    await db.refresh(job)
    if job.celery_task_id:
        try:
            # Cooperative stop preserves worker finally/cleanup handlers.
            await run_in_threadpool(
                process_job_task.AsyncResult(job.celery_task_id).revoke,
                terminate=False,
            )
        except Exception:
            logger.warning(
                "Could not revoke cancelled job %s; database cancellation remains authoritative",
                job.id,
            )
    return job


@router.post(
    "/batch", response_model=BatchJobResult, status_code=status.HTTP_201_CREATED
)
@limiter.limit("5/hour")
async def create_batch_jobs(
    request: Request,
    payload: BatchJobCreate = Body(),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> BatchJobResult:
    total_credits = calculate_credit_cost(payload.num_clips_requested) * len(
        payload.source_urls
    )
    # Validate the whole batch before any charge, row creation or queue publish.
    for url in payload.source_urls:
        await run_in_threadpool(validate_source_url, "youtube", url)
    await _reserve_credits(db, user.id, total_credits)

    created_jobs: list[Job] = []
    for url in payload.source_urls:
        per_job_cost = calculate_credit_cost(payload.num_clips_requested)
        job = Job(
            id=uuid4(),
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
            user_instructions=payload.user_instructions,
            credits_charged=per_job_cost,
            celery_task_id=str(uuid4()),
        )
        db.add(job)
        db.add(_delivery(job, payload))
        created_jobs.append(job)

    await db.commit()
    for job in created_jobs:
        await _dispatch_job(db, job)

    return BatchJobResult(
        jobs=[JobRead.model_validate(j) for j in created_jobs],
        total_credits=total_credits,
    )
