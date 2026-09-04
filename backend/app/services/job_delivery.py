"""At-least-once delivery with database fencing, not broker result state.

All mutation paths lock Job before JobDelivery. Never hold database locks while
talking to Redis. An acknowledgement is not proof that a worker claimed a job.
"""

import logging
import threading
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import select, update

from app.database import SyncSessionLocal
from app.models.job import Job
from app.models.job_delivery import JobDelivery
from app.models.user import User

logger = logging.getLogger(__name__)
LEASE_SECONDS = 180
DISPATCH_SECONDS = 60
MAX_EXECUTIONS = 3
TERMINAL = {"completed", "failed", "cancelled"}


class OwnershipLost(RuntimeError):
    pass


def assert_owner(db, job, token):
    delivery = db.get(JobDelivery, job.id, with_for_update=True)
    if delivery and (
        not token
        or delivery.token != token
        or (delivery.lease_until and delivery.lease_until < datetime.now(timezone.utc))
    ):
        raise OwnershipLost("worker no longer owns this execution")
    return delivery


def publish_job(job_id: str) -> bool:
    from app.workers.tasks import process_job_task

    with SyncSessionLocal() as db:
        job = db.get(Job, UUID(job_id), with_for_update=True)
        if not job or job.status != "pending":
            return False
        delivery = db.get(JobDelivery, job.id, with_for_update=True)
        now = datetime.now(timezone.utc)
        if not delivery or delivery.next_dispatch_at > now:
            return False
        delivery.next_dispatch_at = now + timedelta(seconds=DISPATCH_SECONDS)
        delivery.dispatch_count += 1
        payload, task_id = dict(delivery.payload), job.celery_task_id
        db.commit()
    try:
        process_job_task.apply_async(kwargs=payload, task_id=task_id, retry=False)
    except Exception:
        # Keep the durable intent and charge. Cancellation still refunds once.
        # A timer republishes after outages or an API crash before this call.
        with SyncSessionLocal() as db:
            job = db.get(Job, UUID(job_id), with_for_update=True)
            if job and job.status == "pending":
                delivery = db.get(JobDelivery, job.id, with_for_update=True)
                delivery.last_error = "broker_publish_failed"
                db.commit()
        logger.warning("Job %s remains durably queued after publish failure", job_id)
        return False
    return True


def recover_and_dispatch(limit: int = 50) -> dict[str, int]:
    now = datetime.now(timezone.utc)
    recovered = exhausted = 0
    with SyncSessionLocal() as db:
        jobs = list(
            db.scalars(
                select(Job)
                .join(JobDelivery)
                .where(JobDelivery.lease_until < now, Job.processing_active.is_(True))
                .order_by(JobDelivery.lease_until)
                .limit(limit)
                .with_for_update(of=Job, skip_locked=True)
            )
        )
        for job in jobs:
            delivery = db.get(JobDelivery, job.id, with_for_update=True)
            if not delivery.lease_until or delivery.lease_until >= now:
                continue
            delivery.token = None  # Fence old callbacks before replaying.
            delivery.lease_until = None
            job.processing_active = False
            if job.status in TERMINAL:
                continue
            if delivery.execution_count >= MAX_EXECUTIONS:
                job.status = "failed"
                job.error_message = "Processing stopped repeatedly; credits refunded"
                job.completed_at = now
                db.execute(
                    update(User)
                    .where(User.id == job.user_id)
                    .values(credits=User.credits + job.credits_charged)
                )
                exhausted += 1
            else:
                job.status, job.progress = "pending", 0
                job.progress_message = "Recovering interrupted processing"
                delivery.next_dispatch_at = now
                recovered += 1
        db.commit()
        pending = list(
            db.scalars(
                select(JobDelivery.job_id)
                .join(Job)
                .where(Job.status == "pending", JobDelivery.next_dispatch_at <= now)
                .order_by(JobDelivery.next_dispatch_at)
                .limit(limit)
            )
        )
    sent = sum(publish_job(str(job_id)) for job_id in pending)
    return {"dispatched": sent, "recovered": recovered, "exhausted": exhausted}


class Heartbeat:
    def __init__(self, job_id, token):
        self.job_id, self.token = UUID(job_id), token
        self.stop = threading.Event()
        self.thread = threading.Thread(target=self._run, daemon=True)

    def __enter__(self):
        self.thread.start()
        return self

    def __exit__(self, *args):
        self.stop.set()
        self.thread.join(timeout=2)

    def _run(self):
        while not self.stop.wait(30):
            try:
                with SyncSessionLocal() as db:
                    job = db.get(Job, self.job_id, with_for_update=True)
                    if not job or job.status in TERMINAL:
                        return
                    delivery = assert_owner(db, job, self.token)
                    if not delivery:
                        return
                    delivery.lease_until = datetime.now(timezone.utc) + timedelta(
                        seconds=LEASE_SECONDS
                    )
                    db.commit()
            except OwnershipLost:
                return
            except Exception:
                logger.warning(
                    "Worker heartbeat unavailable for %s", self.job_id, exc_info=True
                )


def main():
    import time

    while True:
        try:
            result = recover_and_dispatch()
            if any(result.values()):
                logger.warning("Job delivery reconciliation: %s", result)
        except Exception:
            logger.exception("Job delivery reconciliation failed; retrying")
        time.sleep(10)


if __name__ == "__main__":
    main()
