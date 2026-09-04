from pathlib import Path
from types import SimpleNamespace

import pytest
from app.config import settings
from app.workers.tasks import _local_storage_input, _recut_source_key


def test_legacy_recut_uses_recorded_storage_identifier_not_database_id(tmp_path):
    job = SimpleNamespace(
        id="database-job",
        source_storage_key=None,
        source_video_url="/media/sources/original-random-id/source.mp4?expires=1&sig=old",
        source_file_path=None,
    )

    class Storage:
        def download_file(self, key, destination):
            assert key == "sources/original-random-id/source.mp4"
            Path(destination).write_bytes(b"source")
            return destination

    key = _recut_source_key(job)
    local = _local_storage_input(Storage(), key, None, tmp_path / "source.mp4")
    assert local.read_bytes() == b"source"
    assert job.source_storage_key == key


def test_canonical_key_wins_over_stale_signed_url():
    job = SimpleNamespace(
        source_storage_key="sources/job/attempts/run/source.mp4",
        source_video_url="/media/sources/old/source.mp4",
    )
    assert _recut_source_key(job) == "sources/job/attempts/run/source.mp4"


def test_untrusted_remote_source_reference_is_not_downloaded(monkeypatch):
    monkeypatch.setattr(settings, "aws_public_base_url", None)
    job = SimpleNamespace(
        source_storage_key=None,
        source_video_url="https://untrusted.example/private",
        source_file_path=None,
    )
    with pytest.raises(ValueError, match="no longer available"):
        _recut_source_key(job)
