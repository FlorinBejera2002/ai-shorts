from __future__ import annotations

import asyncio
import uuid
from types import SimpleNamespace

import pytest
from app.api import account, deps
from app.models.account_deletion_request import AccountDeletionRequest
from app.models.job import Job
from app.models.job_delivery import JobDelivery
from app.models.user import User
from app.workers import tasks
from fastapi import HTTPException


class _Rows:
    def __init__(self, rows, *, one=None) -> None:
        self.rows = rows
        self.one = one

    def all(self):
        return self.rows

    def one_or_none(self):
        return self.one


class _CleanupDb:
    def __init__(self, user_id: uuid.UUID, *, active=False) -> None:
        self.user_id = user_id
        self.active = active
        self.execute_count = 0

    async def get(self, model, key):
        assert model is AccountDeletionRequest
        assert key == self.user_id
        return SimpleNamespace(user_id=key, billing_cancellation_completed=True)

    async def scalar(self, statement):
        self.last_active_statement = str(statement)
        return uuid.uuid4() if self.active else None

    async def execute(self, statement):
        self.execute_count += 1
        if self.execute_count == 1:
            return _Rows(
                [
                    SimpleNamespace(
                        id=uuid.UUID("00000000-0000-0000-0000-000000000123"),
                        source_file_path=f"/app/media/uploads/{self.user_id}/input.mp4",
                        source_video_url="/media/sources/legacy/source.mp4?expires=1&sig=x",
                        source_storage_key=(
                            "sources/00000000-0000-0000-0000-000000000123/source.mp4"
                        ),
                    )
                ]
            )
        if self.execute_count == 2:
            return _Rows(
                [
                    SimpleNamespace(
                        file_path="/tmp/work.mp4",
                        file_url="/media/clips/legacy.mp4?expires=1&sig=x",
                        file_storage_key="clips/stable.mp4",
                        thumbnail_path="/tmp/thumb.jpg",
                        thumbnail_url="/media/clips/legacy.jpg?expires=1&sig=x",
                        thumbnail_storage_key="clips/stable.jpg",
                    )
                ]
            )
        return _Rows([], one=None)


class _CleanupStorage:
    def __init__(self) -> None:
        self.prefixes = []
        self.keys = []

    def delete_prefix(self, prefix):
        self.prefixes.append(prefix)
        return 0

    def delete_file(self, key):
        self.keys.append(key)


def test_account_cleanup_covers_stable_legacy_and_unlinked_namespaces(
    monkeypatch,
) -> None:
    user_id = uuid.uuid4()
    db = _CleanupDb(user_id)
    storage = _CleanupStorage()
    monkeypatch.setattr(account, "get_storage_backend", lambda: storage)

    response = asyncio.run(
        account.delete_owned_media(user=SimpleNamespace(id=user_id), db=db)
    )

    job_id = "00000000-0000-0000-0000-000000000123"
    assert response["complete"] is True
    assert f"uploads/{user_id}/" in storage.prefixes
    assert f"sources/{job_id}/" in storage.prefixes
    assert f"clips/{job_id}/" in storage.prefixes
    assert f"work/{job_id}/" in storage.prefixes
    assert "clips/stable.mp4" in storage.keys
    assert "clips/stable.jpg" in storage.keys
    assert "clips/legacy.mp4" in storage.keys
    assert "clips/legacy.jpg" in storage.keys


def test_account_cleanup_refuses_while_a_writer_is_active(monkeypatch) -> None:
    user_id = uuid.uuid4()
    db = _CleanupDb(user_id, active=True)
    monkeypatch.setattr(
        account,
        "get_storage_backend",
        lambda: pytest.fail("storage must not be touched while work is active"),
    )

    with pytest.raises(HTTPException) as error:
        asyncio.run(account.delete_owned_media(user=SimpleNamespace(id=user_id), db=db))
    assert error.value.status_code == 409
    assert "processing_active" in db.last_active_statement
    assert "active_edit_tasks" in db.last_active_statement


class _AsyncMarkerDb:
    async def get(self, model, key):
        return SimpleNamespace(user_id=key)


def test_pending_deletion_blocks_ordinary_authenticated_work() -> None:
    with pytest.raises(HTTPException) as error:
        asyncio.run(deps.ensure_account_active(_AsyncMarkerDb(), uuid.uuid4()))
    assert error.value.status_code == 409


class _WorkerDb:
    def __init__(self, job, user, marker) -> None:
        self.job = job
        self.user = user
        self.marker = marker
        self.commits = 0
        self.added = []

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def get(self, model, key, **kwargs):
        if model is JobDelivery:
            return None
        if model is Job:
            return self.job
        if model is AccountDeletionRequest:
            return self.marker
        if model is User:
            return self.user
        raise AssertionError(model)

    def add(self, value):
        self.added.append(value)

    def commit(self):
        self.commits += 1


def test_job_failure_during_deletion_cancels_without_refunding(monkeypatch) -> None:
    user_id = uuid.uuid4()
    job = SimpleNamespace(
        id=uuid.uuid4(),
        user_id=user_id,
        status="rendering",
        progress_message=None,
        completed_at=None,
        credits_charged=50,
    )
    user = SimpleNamespace(id=user_id, credits=10)
    db = _WorkerDb(job, user, marker=SimpleNamespace(user_id=user_id))
    monkeypatch.setattr(tasks, "SyncSessionLocal", lambda: db)

    tasks._mark_job_failed(str(job.id), "interrupted")

    assert job.status == "cancelled"
    assert user.credits == 10
    assert db.commits == 1


def test_job_completion_persists_clips_and_terminal_state_atomically(
    monkeypatch,
) -> None:
    user_id = uuid.uuid4()
    job = SimpleNamespace(
        id=uuid.uuid4(),
        user_id=user_id,
        status="rendering",
        aspect_ratio="9:16",
        source_storage_key=None,
        source_video_url=None,
        transcript_segments=None,
        error_message=None,
        progress=90,
        progress_message=None,
        completed_at=None,
    )
    db = _WorkerDb(job, SimpleNamespace(id=user_id), marker=None)
    monkeypatch.setattr(tasks, "SyncSessionLocal", lambda: db)
    result = {
        "source_storage_key": f"sources/{job.id}/source.mp4",
        "source_video_url": None,
        "transcript": {"text": "hello", "segments": []},
        "clips": [
            {
                "index": 1,
                "start": 1,
                "end": 6,
                "duration": 5,
                "title": "Clip",
                "file_size": 42,
                "resolution": "1080x1920",
                "metadata": {
                    "storage_key": f"clips/{job.id}/clip.mp4",
                    "storage_path": f"clips/{job.id}/clip.mp4",
                    "thumbnail_storage_key": f"clips/{job.id}/thumb.jpg",
                    "thumbnail_storage_path": f"clips/{job.id}/thumb.jpg",
                },
            }
        ],
        "errors": [],
    }

    tasks._mark_job_completed(str(job.id), result)

    assert db.commits == 1
    assert job.status == "completed"
    assert len(db.added) == 1
    assert db.added[0].file_storage_key == f"clips/{job.id}/clip.mp4"
    assert db.added[0].thumbnail_storage_key == f"clips/{job.id}/thumb.jpg"


def test_missing_job_is_a_cooperative_cancellation(monkeypatch) -> None:
    db = _WorkerDb(None, None, marker=None)
    monkeypatch.setattr(tasks, "SyncSessionLocal", lambda: db)
    with pytest.raises(tasks.AccountDeletionPending, match="job was deleted"):
        tasks._mark_job_started(str(uuid.uuid4()))
