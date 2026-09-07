"""Durable native-API edit intents against migrated disposable PostgreSQL."""

import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

import pytest
from app.models.clip import Clip
from app.models.edit_delivery import EditDelivery
from app.models.job import Job
from app.services import edit_delivery
from app.services.job_delivery import OwnershipLost
from app.workers import tasks
from test_job_integration import harness  # noqa: F401 — shared isolated fixture


@pytest.fixture
def edit(harness, monkeypatch):
    monkeypatch.setattr(edit_delivery, "SyncSessionLocal", harness.sessions)
    reservation, delivery_id, task_id, clip_id = (
        str(uuid.uuid4()),
        uuid.uuid4(),
        str(uuid.uuid4()),
        uuid.uuid4(),
    )
    job_id = uuid.UUID(
        harness.seed_job(
            status="completed",
            active_edit_tasks=1,
            active_edit_token=reservation,
            edit_deadline=datetime.now(timezone.utc) + timedelta(hours=1),
        )
    )
    payload = {
        "clip_id": str(clip_id),
        "job_id": str(job_id),
        "edit_token": reservation,
        "start_time": 0,
        "end_time": 5,
        "burn_subtitles": False,
    }
    with harness.sessions() as db:
        db.add(
            Clip(
                id=clip_id,
                job_id=job_id,
                user_id=harness.user_id,
                title="Fixture",
                start_time=0,
                end_time=10,
                duration=10,
                file_path="clips/fixture.mp4",
                resolution="1080x1920",
            )
        )
        db.flush()
        db.add(
            EditDelivery(
                id=delivery_id,
                job_id=job_id,
                clip_id=clip_id,
                kind="trim",
                task_id=task_id,
                reservation_token=reservation,
                payload=payload,
            )
        )
        db.commit()
    return harness, job_id, clip_id, delivery_id, reservation, task_id, payload


def test_publish_failure_retains_reservation_and_retries_same_task(edit, monkeypatch):
    harness, job_id, _, delivery_id, reservation, task_id, payload = edit

    def unavailable(**kwargs):
        raise ConnectionError("broker unavailable")

    monkeypatch.setattr(tasks.trim_clip_task, "apply_async", unavailable)
    assert edit_delivery.publish_edit(str(delivery_id)) is False
    with harness.sessions() as db:
        delivery = db.get(EditDelivery, delivery_id)
        assert (
            delivery.state == "pending"
            and delivery.last_error == "broker_publish_failed"
        )
        assert db.get(Job, job_id).active_edit_token == reservation
        delivery.next_dispatch_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        db.commit()
    calls = []
    monkeypatch.setattr(
        tasks.trim_clip_task, "apply_async", lambda **kw: calls.append(kw)
    )
    assert edit_delivery.recover_and_dispatch_edits()["edits_dispatched"] == 1
    assert calls == [{"kwargs": payload, "task_id": task_id, "retry": False}]
    assert harness.balance() == 100


def test_ambiguous_publish_cannot_overwrite_worker_claim_or_clear_successor(
    edit, monkeypatch
):
    harness, job_id, _, delivery_id, reservation, _, _ = edit
    owners = []

    def claimed_then_disconnect(**kwargs):
        with harness.sessions() as db:
            owners.append(tasks._claim_edit(db, job_id, kwargs["kwargs"]["edit_token"]))
        raise ConnectionError("acknowledgement lost")

    monkeypatch.setattr(tasks.trim_clip_task, "apply_async", claimed_then_disconnect)
    assert edit_delivery.publish_edit(str(delivery_id)) is False
    assert edit_delivery.publish_edit(str(delivery_id)) is False
    tasks._finish_edit_tracking(job_id, reservation)
    with harness.sessions() as db:
        delivery = db.get(EditDelivery, delivery_id)
        assert delivery.state == "running" and delivery.last_error is None
        assert delivery.execution_token == owners[0]
        assert db.get(Job, job_id).active_edit_token == owners[0]
    with harness.sessions() as db, pytest.raises(OwnershipLost):
        tasks._claim_edit(db, job_id, reservation)


def test_completion_is_atomic_with_output_and_releases_reservation(edit):
    harness, job_id, clip_id, delivery_id, reservation, _, _ = edit
    with harness.sessions() as db:
        owner = tasks._claim_edit(db, job_id, reservation)
    with harness.sessions() as db:
        tasks._assert_edit_owner(db, job_id, owner)
        db.get(Clip, clip_id).title = "Edited result"
        tasks._complete_edit_delivery(db, job_id, owner)
        db.commit()
    tasks._finish_edit_tracking(job_id, owner)
    with harness.sessions() as db:
        assert db.get(Clip, clip_id).title == "Edited result"
        assert db.get(EditDelivery, delivery_id).state == "completed"
        assert db.get(Job, job_id).active_edit_tasks == 0
        assert db.get(Job, job_id).active_edit_token is None


def test_failure_releases_reservation_once_under_concurrency(edit):
    harness, job_id, _, delivery_id, reservation, _, _ = edit
    with harness.sessions() as db:
        owner = tasks._claim_edit(db, job_id, reservation)
    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(lambda _: tasks._finish_edit_tracking(job_id, owner), range(4)))
    with harness.sessions() as db:
        assert db.get(Job, job_id).active_edit_tasks == 0
        assert db.get(EditDelivery, delivery_id).state == "failed"


def test_expired_reservation_fences_late_worker_and_never_replays_output(
    edit, monkeypatch
):
    harness, job_id, _, delivery_id, reservation, _, _ = edit
    with harness.sessions() as db:
        owner = tasks._claim_edit(db, job_id, reservation)
        db.get(Job, job_id).edit_deadline = datetime.now(timezone.utc) - timedelta(
            seconds=1
        )
        db.commit()
    monkeypatch.setattr(
        tasks.trim_clip_task,
        "apply_async",
        lambda **kw: pytest.fail("must not replay an expired execution"),
    )
    assert edit_delivery.recover_and_dispatch_edits() == {
        "edits_dispatched": 0,
        "edits_expired": 1,
    }
    with harness.sessions() as db:
        assert db.get(Job, job_id).active_edit_tasks == 0
        assert db.get(EditDelivery, delivery_id).state == "expired"
        with pytest.raises(OwnershipLost):
            tasks._assert_edit_owner(db, job_id, owner)


def test_concurrent_dispatchers_publish_only_one_copy_per_window(edit, monkeypatch):
    _, _, _, delivery_id, _, _, _ = edit
    calls = []
    monkeypatch.setattr(
        tasks.trim_clip_task, "apply_async", lambda **kw: calls.append(kw)
    )
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(
            pool.map(lambda _: edit_delivery.publish_edit(str(delivery_id)), range(8))
        )
    assert sum(results) == 1 and len(calls) == 1


def test_upload_source_is_downloaded_from_owned_stable_key_at_execution(
    edit, monkeypatch, tmp_path
):
    from app.config import settings
    from app.services import storage

    harness, job_id, _, _, _, _, _ = edit
    key = f"uploads/{harness.user_id}/source.mp4"
    with harness.sessions() as db:
        db.get(Job, job_id).source_storage_key = key
        db.commit()
    calls = []

    class Storage:
        def download_file(self, actual, destination):
            calls.append(actual)
            destination.write_bytes(b"synthetic media")
            return destination

    monkeypatch.setattr(storage, "get_storage_backend", Storage)
    monkeypatch.setattr(settings, "local_media_root", str(tmp_path))
    output = tasks._job_upload_source(str(job_id), key, str(uuid.uuid4()))
    assert calls == [key] and output.endswith("uploaded-source.mp4")
    for invalid in (
        f"uploads/{uuid.uuid4()}/source.mp4",
        f"uploads/{harness.user_id}/../secret.mp4",
        "sources/other/source.mp4",
    ):
        with pytest.raises(ValueError):
            tasks._job_upload_source(str(job_id), invalid, str(uuid.uuid4()))
    assert calls == [key]


def test_trim_worker_storage_failure_cleans_output_and_records_failed_edit(
    edit, monkeypatch, tmp_path
):
    import subprocess

    from app.config import settings
    from app.services import storage

    harness, job_id, clip_id, delivery_id, reservation, _, payload = edit
    monkeypatch.setattr(settings, "local_media_root", str(tmp_path))
    with harness.sessions() as db:
        clip = db.get(Clip, clip_id)
        source = tmp_path / "source.mp4"
        source.write_bytes(b"fixture")
        clip.file_path, clip.file_storage_key = str(source), "clips/original.mp4"
        db.commit()

    def encode(command, **kwargs):
        from pathlib import Path

        Path(command[-1]).write_bytes(b"encoded fixture")
        return type("Result", (), {"returncode": 0})()

    deleted = []

    class Storage:
        def save_file(self, path, key):
            raise OSError("ambiguous partial object upload")

        def delete_file(self, key):
            deleted.append(key)

    monkeypatch.setattr(subprocess, "run", encode)
    monkeypatch.setattr(storage, "get_storage_backend", Storage)
    with pytest.raises(OSError):
        tasks.trim_clip_task.run(**payload)
    assert len(deleted) == 1 and deleted[0].startswith(
        f"clips/{job_id}/edits/{clip_id}/trim-"
    )
    with harness.sessions() as db:
        assert db.get(Clip, clip_id).file_storage_key == "clips/original.mp4"
        assert db.get(Job, job_id).active_edit_tasks == 0
        assert db.get(EditDelivery, delivery_id).state == "failed"


def test_trim_worker_completes_persisted_output_and_cleans_superseded_key(
    edit, monkeypatch, tmp_path
):
    import subprocess

    from app.config import settings
    from app.services import storage

    harness, job_id, clip_id, delivery_id, _, _, payload = edit
    monkeypatch.setattr(settings, "local_media_root", str(tmp_path))
    source = tmp_path / "source.mp4"
    source.write_bytes(b"fixture")
    with harness.sessions() as db:
        clip = db.get(Clip, clip_id)
        clip.file_path, clip.file_storage_key = str(source), "clips/original.mp4"
        db.commit()

    def encode(command, **kwargs):
        from pathlib import Path

        Path(command[-1]).write_bytes(b"encoded fixture")
        return type("Result", (), {"returncode": 0})()

    deleted, saved = [], []

    class Storage:
        def save_file(self, path, key):
            saved.append(key)
            return key

        def public_url(self, key):
            return "https://fixture.invalid/" + key

        def delete_file(self, key):
            deleted.append(key)

    monkeypatch.setattr(subprocess, "run", encode)
    monkeypatch.setattr(storage, "get_storage_backend", Storage)
    result = tasks.trim_clip_task.run(**payload)
    assert (
        result["duration"] == 5
        and len(saved) == 1
        and deleted == ["clips/original.mp4"]
    )
    with harness.sessions() as db:
        clip = db.get(Clip, clip_id)
        assert clip.file_storage_key == saved[0] and clip.file_size == len(
            b"encoded fixture"
        )
        assert db.get(EditDelivery, delivery_id).state == "completed"
        assert db.get(Job, job_id).active_edit_tasks == 0


def test_recut_ambiguous_upload_failure_cleans_attempt_object(
    edit, monkeypatch, tmp_path
):
    from app.config import settings
    from app.services import clip_generator, storage

    harness, job_id, clip_id, delivery_id, reservation, _, _ = edit
    monkeypatch.setattr(settings, "local_media_root", str(tmp_path))
    with harness.sessions() as db:
        db.get(Job, job_id).source_storage_key = f"sources/{job_id}/source.mp4"
        db.commit()

    def encode(source, output, segments):
        from pathlib import Path

        Path(output).write_bytes(b"encoded")
        return True

    deleted = []

    class Storage:
        def download_file(self, key, destination):
            destination.write_bytes(b"fixture")
            return destination

        def save_file(self, path, key):
            raise OSError("ambiguous upload failure")

        def delete_file(self, key):
            deleted.append(key)

    monkeypatch.setattr(storage, "get_storage_backend", Storage)
    monkeypatch.setattr(clip_generator, "extract_clip", encode)
    monkeypatch.setattr(clip_generator, "generate_thumbnail", lambda *a, **kw: False)
    with pytest.raises(OSError):
        tasks.recut_clip_task.run(
            clip_id=str(clip_id),
            job_id=str(job_id),
            edit_token=reservation,
            segments=[{"start": 0, "end": 5, "order": 0}],
        )
    assert len(deleted) == 1 and deleted[0].startswith(
        f"clips/{job_id}/edits/{clip_id}/recut-"
    )
    with harness.sessions() as db:
        assert db.get(EditDelivery, delivery_id).state == "failed"
        assert db.get(Job, job_id).active_edit_tasks == 0


def test_additive_edit_migration_roundtrip_preserves_existing_accounts_jobs_clips(edit):
    from pathlib import Path

    from alembic import command
    from alembic.config import Config
    from sqlalchemy import text

    harness, job_id, clip_id, _, _, _, _ = edit
    cfg = Config()
    cfg.set_main_option("script_location", str(Path(__file__).parents[1] / "alembic"))
    with harness.sessions() as db:
        engine = db.get_bind()
    with engine.begin() as connection:
        cfg.attributes["connection"] = connection
        command.downgrade(cfg, "20260904_0004")
        assert (
            connection.scalar(
                text("SELECT credits FROM users WHERE id=:id"), {"id": harness.user_id}
            )
            == 100
        )
        assert (
            connection.scalar(
                text("SELECT title FROM clips WHERE id=:id"), {"id": clip_id}
            )
            == "Fixture"
        )
        command.upgrade(cfg, "head")
        assert (
            connection.scalar(
                text("SELECT active_edit_tasks FROM jobs WHERE id=:id"), {"id": job_id}
            )
            == 1
        )
        assert connection.scalar(text("SELECT count(*) FROM edit_deliveries")) == 0
