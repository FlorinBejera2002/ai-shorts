from contextlib import nullcontext

from billiard.exceptions import SoftTimeLimitExceeded
import pytest

from app.config import Settings, settings
from app.services import processing_pipeline
from app.workers import tasks
from app.workers.celery_app import celery_app


def test_worker_limits_are_bounded_and_configurable():
    custom = Settings(_env_file=None, worker_soft_time_limit=3600, worker_time_limit=3900)
    assert custom.worker_soft_time_limit == 3600
    assert celery_app.conf.task_soft_time_limit == settings.worker_soft_time_limit
    assert celery_app.conf.task_time_limit > celery_app.conf.task_soft_time_limit
    with pytest.raises(ValueError, match="must exceed"):
        Settings(_env_file=None, worker_soft_time_limit=3600, worker_time_limit=3600)
    with pytest.raises(ValueError):
        Settings(_env_file=None, whisper_cpu_threads=0)


def test_soft_timeout_persists_actionable_failure_and_releases_job(monkeypatch):
    failures = []
    inactive = []
    monkeypatch.setattr(tasks, "_mark_job_started", lambda *args: {})
    monkeypatch.setattr(tasks, "Heartbeat", lambda *args: nullcontext())
    monkeypatch.setattr(tasks, "_mark_job_failed", lambda job, message, token: failures.append(message))
    monkeypatch.setattr(tasks, "_mark_job_processing_inactive", lambda *args: inactive.append(args))
    monkeypatch.setattr(tasks.process_job_task, "update_state", lambda **kwargs: None)

    def timeout(**kwargs):
        raise SoftTimeLimitExceeded()

    monkeypatch.setattr(processing_pipeline, "process_video_source", timeout)
    with pytest.raises(SoftTimeLimitExceeded):
        tasks.process_job_task.run(job_id="synthetic-job", source="unused")
    assert len(failures) == 1 and "worker time limit" in failures[0]
    assert len(inactive) == 1
