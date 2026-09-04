"""Real PostgreSQL/ASGI tests; opt in with SNEEPCUT_TEST_DATABASE_URL.

Only a loopback database named sneepcut_integration_test is accepted. Each
test uses a fresh schema, never public tables, and removes only that schema.
The broker is a controlled boundary: no paid processing/network job is run.
"""

from __future__ import annotations

import asyncio
import os
import subprocess
import sys
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

import httpx
import pytest
from alembic import command
from alembic.config import Config
from app.api import jobs
from app.api.deps import get_current_user
from app.database import Base, get_db
from app.models.brand import BrandKit
from app.models.job import Job
from app.models.job_delivery import JobDelivery
from app.models.user import User
from app.services import job_delivery
from app.workers import tasks
from fastapi import FastAPI, HTTPException
from sqlalchemy import create_engine, func, inspect, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool


@pytest.fixture
def harness(monkeypatch):
    raw = os.environ.get("SNEEPCUT_TEST_DATABASE_URL")
    if not raw:
        pytest.skip(
            "set SNEEPCUT_TEST_DATABASE_URL to a disposable local PostgreSQL database"
        )
    url = make_url(raw)
    assert url.host in {"localhost", "127.0.0.1", "::1"}
    assert url.database == "sneepcut_integration_test"
    schema = f"test_jobs_{uuid.uuid4().hex}"
    admin = create_engine(url, poolclass=NullPool)
    with admin.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    sync = create_engine(url, connect_args={"options": f"-csearch_path={schema}"})
    async_engine = create_async_engine(
        url.set(drivername="postgresql+asyncpg"),
        poolclass=NullPool,
        connect_args={"server_settings": {"search_path": schema}},
    )
    sessions = sessionmaker(sync, expire_on_commit=False)
    async_sessions = async_sessionmaker(async_engine, expire_on_commit=False)
    migration = Config()
    migration.set_main_option(
        "script_location", str(Path(__file__).parents[1] / "alembic")
    )
    with sync.begin() as connection:
        migration.attributes["connection"] = connection
        command.upgrade(migration, "head")
    user_id = uuid.uuid4()
    with sessions() as db:
        db.add(
            User(
                id=user_id,
                email=f"{user_id}@example.invalid",
                provider="credentials",
                credits=100,
            )
        )
        db.commit()

    async def database():
        async with async_sessions() as db:
            yield db

    async def identity():
        # Deliberately stale credit count: reservation must query current SQL state.
        return SimpleNamespace(id=user_id, credits=100)

    def validate(source_type, source_url):
        if source_url == "https://invalid.example.invalid/video":
            raise HTTPException(status_code=400, detail="Invalid test source")

    monkeypatch.setattr(jobs.limiter, "enabled", False)
    monkeypatch.setattr(jobs, "validate_source_url", validate)
    monkeypatch.setattr(jobs.process_job_task, "apply_async", lambda **kwargs: None)
    monkeypatch.setattr(
        jobs.process_job_task,
        "AsyncResult",
        lambda *args: SimpleNamespace(revoke=lambda **kw: None),
    )
    monkeypatch.setattr(tasks, "SyncSessionLocal", sessions)
    monkeypatch.setattr(job_delivery, "SyncSessionLocal", sessions)
    app = FastAPI()
    app.include_router(jobs.router)
    app.dependency_overrides[get_db] = database
    app.dependency_overrides[get_current_user] = identity

    async def request(method, path, **kwargs):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            return await client.request(method, path, **kwargs)

    def balance():
        with sessions() as db:
            return db.get(User, user_id).credits

    def count():
        with sessions() as db:
            return db.scalar(select(func.count()).select_from(Job))

    def seed_job(**kwargs):
        with sessions() as db:
            job = Job(
                user_id=user_id,
                source_type="youtube",
                source_url="https://youtube.com/watch?v=fixture",
                credits_charged=50,
                celery_task_id=str(uuid.uuid4()),
                **kwargs,
            )
            db.add(job)
            db.commit()
            return str(job.id)

    yield SimpleNamespace(
        request=request,
        balance=balance,
        count=count,
        seed_job=seed_job,
        sessions=sessions,
        user_id=user_id,
        database_url=raw,
        schema=schema,
    )
    asyncio.run(async_engine.dispose())
    sync.dispose()
    with admin.begin() as connection:
        connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
    admin.dispose()


PAYLOAD = {
    "source_type": "youtube",
    "source_url": "https://youtube.com/watch?v=fixture",
    "num_clips_requested": 5,
}


def test_concurrent_creation_cannot_overspend(harness):
    async def run():
        return await asyncio.gather(
            *(harness.request("POST", "/api/jobs", json=PAYLOAD) for _ in range(12))
        )

    responses = asyncio.run(run())
    assert sorted(r.status_code for r in responses) == [201, 201] + [402] * 10
    assert harness.balance() == 0
    assert harness.count() == 2


def test_fast_worker_state_is_not_overwritten_after_publish(harness, monkeypatch):
    def publish(**kwargs):
        tasks._mark_job_started(kwargs["kwargs"]["job_id"], str(uuid.uuid4()))

    monkeypatch.setattr(jobs.process_job_task, "apply_async", publish)
    response = asyncio.run(harness.request("POST", "/api/jobs", json=PAYLOAD))
    assert response.status_code == 201
    assert response.json()["status"] == "downloading"
    assert response.json()["processing_active"] is True
    assert response.json()["celery_task_id"]


def test_publish_failure_keeps_durable_intent_until_cancelled(harness, monkeypatch):
    def fail(**kwargs):
        raise ConnectionError("broker unavailable")

    monkeypatch.setattr(jobs.process_job_task, "apply_async", fail)

    async def run():
        return await asyncio.gather(
            *(harness.request("POST", "/api/jobs", json=PAYLOAD) for _ in range(2))
        )

    responses = asyncio.run(run())
    assert all(r.status_code == 201 for r in responses)
    assert harness.balance() == 0
    with harness.sessions() as db:
        failed = list(db.scalars(select(Job)))
        assert len(failed) == 2
        assert all(j.status == "pending" for j in failed)
        assert db.scalar(select(func.count()).select_from(JobDelivery)) == 2
    for job in failed:
        asyncio.run(harness.request("POST", f"/api/jobs/{job.id}/cancel"))
        asyncio.run(harness.request("POST", f"/api/jobs/{job.id}/cancel"))
    assert harness.balance() == 100


def test_ambiguous_publish_does_not_refund_running_job(harness, monkeypatch):
    def publish(**kwargs):
        tasks._mark_job_started(kwargs["kwargs"]["job_id"], str(uuid.uuid4()))
        raise ConnectionError("acknowledgement lost after delivery")

    monkeypatch.setattr(jobs.process_job_task, "apply_async", publish)
    response = asyncio.run(harness.request("POST", "/api/jobs", json=PAYLOAD))
    assert response.status_code == 201
    assert response.json()["status"] == "downloading"
    assert harness.balance() == 50


def test_entire_batch_validated_before_any_side_effect(harness):
    response = asyncio.run(
        harness.request(
            "POST",
            "/api/jobs/batch",
            json={
                "source_urls": [
                    PAYLOAD["source_url"],
                    "https://invalid.example.invalid/video",
                ]
            },
        )
    )
    assert response.status_code == 400
    assert harness.count() == 0
    assert harness.balance() == 100


def test_batch_reports_net_charge_after_partial_publish_failure(harness, monkeypatch):
    calls = []

    def publish(**kwargs):
        calls.append(kwargs)
        if len(calls) == 2:
            raise ConnectionError("broker unavailable")

    monkeypatch.setattr(jobs.process_job_task, "apply_async", publish)
    response = asyncio.run(
        harness.request(
            "POST",
            "/api/jobs/batch",
            json={"source_urls": [PAYLOAD["source_url"], PAYLOAD["source_url"]]},
        )
    )
    assert response.status_code == 201
    assert response.json()["total_credits"] == 100
    assert [j["status"] for j in response.json()["jobs"]] == ["pending", "pending"]
    assert harness.balance() == 0


def test_concurrent_cancellation_and_worker_failure_refund_once(harness):
    job_id = harness.seed_job(status="rendering", processing_active=True)

    async def run():
        return await asyncio.gather(
            *(harness.request("POST", f"/api/jobs/{job_id}/cancel") for _ in range(8)),
            asyncio.to_thread(tasks._mark_job_failed, job_id, "worker failed"),
        )

    results = asyncio.run(run())
    assert all(r.status_code == 200 for r in results[:-1])
    assert (
        harness.balance() == 150
    )  # Seeded job's charge was not debited in this fixture.


def test_duplicate_worker_delivery_cannot_claim_or_clear_active_work(harness):
    job_id = harness.seed_job(status="pending", processing_active=False)

    def claim():
        try:
            tasks._mark_job_started(job_id)
            return "claimed"
        except tasks.JobAlreadyClaimed:
            return "ignored"

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(lambda _: claim(), range(2))) == ["claimed", "ignored"]
    result = tasks.process_job_task.run(job_id=job_id, source="unused")
    assert result["status"] == "ignored"
    with harness.sessions() as db:
        assert db.get(Job, uuid.UUID(job_id)).processing_active is True


def test_cancelled_job_cannot_resume_or_publish_clips(harness):
    job_id = harness.seed_job(status="cancelled", processing_active=True)
    with pytest.raises(tasks.JobCancelled):
        tasks._update_job_progress(job_id, "clipping", 60, "late update")
    with pytest.raises(tasks.JobCancelled):
        tasks._mark_job_completed(job_id, {"clips": []})
    with harness.sessions() as db:
        assert db.get(Job, uuid.UUID(job_id)).status == "cancelled"


def test_status_polling_does_not_contact_redis(harness, monkeypatch):
    job_id = harness.seed_job(status="rendering", progress=72)
    monkeypatch.setattr(
        jobs.process_job_task,
        "AsyncResult",
        lambda *args: pytest.fail("Redis must not be queried"),
    )
    response = asyncio.run(harness.request("GET", f"/api/jobs/{job_id}"))
    assert response.status_code == 200
    assert response.json()["job"]["progress"] == 72
    assert response.json()["celery_meta"] is None


def test_mixed_sources_and_unknown_options_are_rejected(harness):
    for extra in [{"source_file_path": "/some/file.mp4"}, {"admin": True}]:
        response = asyncio.run(
            harness.request("POST", "/api/jobs", json=PAYLOAD | extra)
        )
        assert response.status_code == 422
    assert harness.balance() == 100
    assert harness.count() == 0


def test_migrated_schema_contains_every_backend_model_column(harness):
    with harness.sessions() as db:
        inspector = inspect(db.get_bind())
        for table in Base.metadata.sorted_tables:
            actual = {column["name"] for column in inspector.get_columns(table.name)}
            expected = set(table.columns.keys())
            assert expected <= actual, f"{table.name}: missing {expected - actual}"


def test_badge_migration_round_trip_preserves_existing_brand(harness):
    with harness.sessions() as db:
        db.add(BrandKit(user_id=harness.user_id, primary_color="#123456"))
        db.commit()
        engine = db.get_bind()
    migration = Config()
    migration.set_main_option(
        "script_location", str(Path(__file__).parents[1] / "alembic")
    )
    with engine.begin() as connection:
        migration.attributes["connection"] = connection
        command.downgrade(migration, "20260903_0007")
        command.upgrade(migration, "head")
    with harness.sessions() as db:
        brand = db.scalar(select(BrandKit).where(BrandKit.user_id == harness.user_id))
        assert brand.primary_color == "#123456"
        assert brand.hide_platform_badge is False


def test_worker_receives_persisted_language_and_subtitle_style(harness):
    job_id = harness.seed_job(status="pending", language="ro", subtitle_style="bold")
    options = tasks._mark_job_started(job_id)
    assert options["language"] == "ro"
    assert options["subtitle_style"] == "bold"
    assert options["brand_settings"]["hide_platform_badge"] is False


@pytest.mark.parametrize(
    "plan,hidden", [("free", False), ("pro", False), ("agency", True)]
)
def test_badge_removal_requires_server_side_entitlement(harness, plan, hidden):
    with harness.sessions() as db:
        db.get(User, harness.user_id).plan = plan
        db.add(BrandKit(user_id=harness.user_id, hide_platform_badge=True))
        db.commit()
    job_id = harness.seed_job(status="pending", include_brand=True)
    brand = tasks._mark_job_started(job_id)["brand_settings"]
    assert brand["apply_brand"] is True
    assert brand["hide_platform_badge"] is hidden


def test_outbox_recovers_crash_before_publish_with_exact_options(harness, monkeypatch):
    monkeypatch.setattr(job_delivery, "publish_job", lambda job_id: False)
    payload = PAYLOAD | {
        "smart_crop": False,
        "burn_subtitles": False,
        "user_instructions": "Keep the opening",
    }
    response = asyncio.run(harness.request("POST", "/api/jobs", json=payload))
    assert response.status_code == 201
    with harness.sessions() as db:
        delivery = db.get(JobDelivery, uuid.UUID(response.json()["id"]))
        assert delivery.payload["smart_crop"] is False
        assert delivery.payload["burn_subtitles"] is False
        assert delivery.payload["user_instructions"] == "Keep the opening"
        assert delivery.dispatch_count == 0
    assert harness.balance() == 50


def _expired_delivery(harness, *, status="rendering", executions=1):
    job_id = harness.seed_job(status=status, processing_active=True)
    token = str(uuid.uuid4())
    with harness.sessions() as db:
        db.add(
            JobDelivery(
                job_id=uuid.UUID(job_id),
                payload={"job_id": job_id, "source": "test"},
                token=token,
                execution_count=executions,
                lease_until=datetime.now(timezone.utc) - timedelta(seconds=1),
            )
        )
        db.commit()
    return job_id, token


def test_expired_worker_is_fenced_from_progress_completion_failure_and_finally(harness):
    job_id, old = _expired_delivery(harness)
    assert job_delivery.recover_and_dispatch()["recovered"] == 1
    new = str(uuid.uuid4())
    tasks._mark_job_started(job_id, new)
    with pytest.raises(job_delivery.OwnershipLost):
        tasks._update_job_progress(job_id, "rendering", 99, "stale", old)
    with pytest.raises(job_delivery.OwnershipLost):
        tasks._mark_job_completed(job_id, {"clips": []}, old)
    with pytest.raises(job_delivery.OwnershipLost):
        tasks._mark_job_failed(job_id, "stale failure", old)
    tasks._mark_job_processing_inactive(job_id, old)
    with harness.sessions() as db:
        assert db.get(Job, uuid.UUID(job_id)).processing_active is True
        assert db.get(JobDelivery, uuid.UUID(job_id)).token == new
    assert harness.balance() == 100


def test_recovery_exhaustion_refunds_only_once_under_concurrency(harness):
    job_id, _ = _expired_delivery(harness, executions=job_delivery.MAX_EXECUTIONS)
    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(lambda _: job_delivery.recover_and_dispatch(), range(4)))
    with harness.sessions() as db:
        assert db.get(Job, uuid.UUID(job_id)).status == "failed"
    assert harness.balance() == 150  # fixture seeded, not charged


def test_cancelled_expired_worker_never_requeues_or_refunds_again(harness):
    job_id, _ = _expired_delivery(harness, status="cancelled")
    assert job_delivery.recover_and_dispatch() == {
        "dispatched": 0,
        "recovered": 0,
        "exhausted": 0,
    }
    with harness.sessions() as db:
        assert not db.get(Job, uuid.UUID(job_id)).processing_active
    assert harness.balance() == 100


def test_unacknowledged_dispatch_is_replayed_without_new_charge(harness, monkeypatch):
    calls = []
    monkeypatch.setattr(
        jobs.process_job_task, "apply_async", lambda **kw: calls.append(kw)
    )
    response = asyncio.run(harness.request("POST", "/api/jobs", json=PAYLOAD))
    job_id = uuid.UUID(response.json()["id"])
    assert len(calls) == 1
    with harness.sessions() as db:
        db.get(JobDelivery, job_id).next_dispatch_at = datetime.now(
            timezone.utc
        ) - timedelta(seconds=1)
        db.commit()
    assert job_delivery.recover_and_dispatch()["dispatched"] == 1
    assert len(calls) == 2
    assert calls[0]["kwargs"] == calls[1]["kwargs"]
    assert calls[0]["task_id"] == calls[1]["task_id"]
    assert harness.balance() == 50


def test_worker_process_exit_after_claim_can_be_recovered(harness):
    job_id = harness.seed_job(status="pending")
    token = str(uuid.uuid4())
    with harness.sessions() as db:
        db.add(
            JobDelivery(
                job_id=uuid.UUID(job_id), payload={"job_id": job_id, "source": "test"}
            )
        )
        db.commit()
    script = f"""
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.workers import tasks
engine = create_engine({harness.database_url!r}, connect_args={{'options': '-csearch_path={harness.schema}'}})
tasks.SyncSessionLocal = sessionmaker(engine, expire_on_commit=False)
tasks._mark_job_started({job_id!r}, {token!r})
os._exit(137)
"""
    result = subprocess.run(
        [sys.executable, "-c", script], cwd=Path(__file__).parents[1], timeout=30
    )
    assert result.returncode == 137
    with harness.sessions() as db:
        job = db.get(Job, uuid.UUID(job_id))
        assert job.processing_active
        delivery = db.get(JobDelivery, job.id)
        assert delivery.token == token
        # Advance the lease clock rather than sleeping three minutes.
        delivery.lease_until = datetime.now(timezone.utc) - timedelta(seconds=1)
        db.commit()
    assert job_delivery.recover_and_dispatch()["recovered"] == 1


def test_live_lease_is_not_recovered(harness):
    job_id, _ = _expired_delivery(harness)
    with harness.sessions() as db:
        db.get(JobDelivery, uuid.UUID(job_id)).lease_until = datetime.now(
            timezone.utc
        ) + timedelta(seconds=60)
        db.commit()
    assert job_delivery.recover_and_dispatch()["recovered"] == 0
