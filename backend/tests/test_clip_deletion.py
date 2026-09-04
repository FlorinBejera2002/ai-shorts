import asyncio
import uuid
from types import SimpleNamespace

import pytest
from app.api import clips
from app.models.clip import Clip
from app.models.job import Job
from fastapi import HTTPException


class Db:
    def __init__(self, active=0):
        self.user_id = uuid.uuid4()
        self.job = SimpleNamespace(
            id=uuid.uuid4(), active_edit_tasks=active, processing_active=False
        )
        self.clip = SimpleNamespace(
            id=uuid.uuid4(),
            job_id=self.job.id,
            user_id=self.user_id,
            file_path=None,
            file_url=None,
            file_storage_key="clips/test/file.mp4",
            thumbnail_path=None,
            thumbnail_url=None,
            thumbnail_storage_key="clips/test/thumb.jpg",
        )
        self.deleted = False

    async def get(self, model, key, **kwargs):
        return self.clip if model is Clip else self.job if model is Job else None

    async def delete(self, obj):
        self.deleted = True

    async def commit(self):
        pass


def test_clip_deletion_is_retryable_and_preserves_row_after_storage_failure(
    monkeypatch,
):
    db = Db()

    class Storage:
        def delete_file(self, key):
            raise OSError("storage unavailable")

    monkeypatch.setattr(clips, "get_storage_backend", Storage)
    with pytest.raises(HTTPException) as error:
        asyncio.run(
            clips.delete_clip(db.clip.id, db=db, user=SimpleNamespace(id=db.user_id))
        )
    assert error.value.status_code == 502
    assert not db.deleted


def test_clip_deletion_waits_for_edits_without_touching_storage(monkeypatch):
    db = Db(active=1)
    monkeypatch.setattr(
        clips, "get_storage_backend", lambda: pytest.fail("must not access storage")
    )
    with pytest.raises(HTTPException) as error:
        asyncio.run(
            clips.delete_clip(db.clip.id, db=db, user=SimpleNamespace(id=db.user_id))
        )
    assert error.value.status_code == 409


def test_clip_deletion_removes_objects_and_edit_namespaces_before_row(monkeypatch):
    db = Db()
    keys, prefixes = [], []

    class Storage:
        def delete_file(self, key):
            assert not db.deleted
            keys.append(key)

        def delete_prefix(self, prefix):
            assert not db.deleted
            prefixes.append(prefix)

    monkeypatch.setattr(clips, "get_storage_backend", Storage)
    response = asyncio.run(
        clips.delete_clip(db.clip.id, db=db, user=SimpleNamespace(id=db.user_id))
    )
    assert response.status_code == 204
    assert len(keys) == 2 and len(prefixes) == 2 and db.deleted
