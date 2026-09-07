"""Retry broker delivery without repeating an edit after the worker claims it.

The job row is always locked before the edit delivery. Claiming rotates the job
reservation token; stale/duplicate deliveries cannot publish output or release a
new owner's reservation. A lost worker expires after its bounded reservation;
edits are not replayed against potentially replaced media.
"""

import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import case, or_, select

from app.database import SyncSessionLocal
from app.models.edit_delivery import EditDelivery
from app.models.job import Job

logger = logging.getLogger(__name__)
DISPATCH_SECONDS = 60


def publish_edit(delivery_id: str) -> bool:
    from app.workers.tasks import recut_clip_task, trim_clip_task

    with SyncSessionLocal() as db:
        job_id = db.scalar(
            select(EditDelivery.job_id).where(EditDelivery.id == UUID(delivery_id))
        )
        if not job_id:
            return False
        job = db.get(Job, job_id, with_for_update=True)
        delivery = db.get(EditDelivery, UUID(delivery_id), with_for_update=True)
        now = datetime.now(timezone.utc)
        if not job or not delivery or delivery.state != "pending":
            return False
        if (
            job.active_edit_token != delivery.reservation_token
            or not job.edit_deadline
            or job.edit_deadline <= now
        ):
            delivery.state = "expired"
            delivery.last_error = "Editing reservation expired; retry the edit"
            delivery.completed_at = now
            db.commit()
            return False
        if delivery.next_dispatch_at > now:
            return False
        delivery.next_dispatch_at = now + timedelta(seconds=DISPATCH_SECONDS)
        delivery.dispatch_count += 1
        payload, task_id, kind = dict(delivery.payload), delivery.task_id, delivery.kind
        db.commit()
    try:
        task = trim_clip_task if kind == "trim" else recut_clip_task
        task.apply_async(kwargs=payload, task_id=task_id, retry=False)
    except Exception:
        with SyncSessionLocal() as db:
            job = db.get(Job, job_id, with_for_update=True)
            delivery = db.get(EditDelivery, UUID(delivery_id), with_for_update=True)
            if job and delivery and delivery.state == "pending":
                delivery.last_error = "broker_publish_failed"
                db.commit()
        logger.warning(
            "Edit %s remains durably queued after publish failure", delivery_id
        )
        return False
    return True


def recover_and_dispatch_edits(limit: int = 50) -> dict[str, int]:
    now = datetime.now(timezone.utc)
    expired = 0
    with SyncSessionLocal() as db:
        # Job reservation expiry is authoritative even if a stale worker later
        # finishes encoding. Its final write must still pass the fencing check.
        owner = case(
            (EditDelivery.state == "running", EditDelivery.execution_token),
            else_=EditDelivery.reservation_token,
        )
        candidates = list(
            db.execute(
                select(EditDelivery.id, EditDelivery.job_id)
                .join(Job)
                .where(
                    EditDelivery.state.in_(("pending", "running")),
                    or_(
                        Job.active_edit_token.is_distinct_from(owner),
                        Job.edit_deadline.is_(None),
                        Job.edit_deadline <= now,
                    ),
                )
                .order_by(EditDelivery.created_at)
                .limit(limit)
            )
        )
        for delivery_id, job_id in candidates:
            job = db.get(Job, job_id, with_for_update=True)
            delivery = db.get(EditDelivery, delivery_id, with_for_update=True)
            if not job or not delivery or delivery.state not in {"pending", "running"}:
                continue
            token = (
                delivery.execution_token
                if delivery.state == "running"
                else delivery.reservation_token
            )
            if (
                job.active_edit_token == token
                and job.edit_deadline
                and job.edit_deadline > now
            ):
                continue
            if job.active_edit_token == token:
                job.active_edit_tasks = 0
                job.active_edit_token = None
                job.edit_deadline = None
            delivery.state, delivery.completed_at = "expired", now
            delivery.last_error = "Editing reservation expired; retry the edit"
            expired += 1
        db.commit()
        pending = list(
            db.scalars(
                select(EditDelivery.id)
                .where(
                    EditDelivery.state == "pending",
                    EditDelivery.next_dispatch_at <= now,
                )
                .order_by(EditDelivery.next_dispatch_at)
                .limit(limit)
            )
        )
    return {
        "edits_dispatched": sum(publish_edit(str(i)) for i in pending),
        "edits_expired": expired,
    }
