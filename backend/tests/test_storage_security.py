import pytest
from app.config import settings
from app.services.storage import (
    LocalStorage,
    S3Storage,
    get_storage_backend,
    storage_key_from_reference,
)


@pytest.mark.parametrize(
    ("reference", "expected"),
    [
        ("/app/media/clips/user/video.mp4", "clips/user/video.mp4"),
        ("/media/thumbnails/user/image.jpg", "thumbnails/user/image.jpg"),
        (
            "/media/clips/user/video.mp4?expires=123&sig=abc",
            "clips/user/video.mp4",
        ),
        ("https://media.example/clips/user/video.mp4", None),
        ("../secret", None),
        ("/etc/passwd", None),
    ],
)
def test_storage_references_are_reduced_to_safe_keys(reference, expected) -> None:
    assert storage_key_from_reference(reference) == expected


def test_production_remote_storage_misconfiguration_fails_closed(monkeypatch) -> None:
    monkeypatch.setattr(settings, "app_env", "production")
    monkeypatch.setattr(settings, "storage_type", "r2")
    monkeypatch.setattr(settings, "aws_access_key_id", None)
    monkeypatch.setattr(settings, "aws_secret_access_key", None)

    with pytest.raises(RuntimeError, match="required in production"):
        get_storage_backend()


def test_only_configured_public_storage_origin_is_reduced_to_a_key(monkeypatch) -> None:
    monkeypatch.setattr(settings, "aws_public_base_url", "https://cdn.example/media")
    assert (
        storage_key_from_reference("https://cdn.example/media/clips/user/video.mp4")
        == "clips/user/video.mp4"
    )
    assert storage_key_from_reference("https://evil.example/media/private.mp4") is None


def test_local_delete_prefix_removes_only_the_exact_namespace(tmp_path) -> None:
    storage = LocalStorage(tmp_path)
    first = tmp_path / "clips" / "job-1" / "nested" / "clip.mp4"
    adjacent = tmp_path / "clips" / "job-10" / "clip.mp4"
    first.parent.mkdir(parents=True)
    adjacent.parent.mkdir(parents=True)
    first.write_bytes(b"first")
    adjacent.write_bytes(b"adjacent")

    assert storage.delete_prefix("clips/job-1/") == 1
    assert not first.exists()
    assert adjacent.exists()

    with pytest.raises(ValueError, match="storage root"):
        storage.delete_prefix("")


class _FakeS3Client:
    def __init__(self, *, errors=False) -> None:
        self.errors = errors
        self.list_calls = []
        self.delete_calls = []

    def list_objects_v2(self, **kwargs):
        self.list_calls.append(kwargs)
        return {
            "Contents": [{"Key": f"{kwargs['Prefix']}one.mp4"}],
            "IsTruncated": False,
        }

    def delete_objects(self, **kwargs):
        self.delete_calls.append(kwargs)
        return {"Errors": [{"Key": "failed"}]} if self.errors else {}

    def generate_presigned_url(self, operation, *, Params, ExpiresIn):
        return f"https://private.example/{Params['Key']}?ttl={ExpiresIn}"


def _fake_s3_storage(*, errors=False) -> S3Storage:
    storage = object.__new__(S3Storage)
    storage.client = _FakeS3Client(errors=errors)
    storage.bucket = "private-media"
    return storage


def test_s3_prefix_deletion_is_directory_scoped_and_checks_partial_failure() -> None:
    storage = _fake_s3_storage()
    assert storage.delete_prefix("clips/job-1/") == 1
    assert storage.client.list_calls[0]["Prefix"] == "clips/job-1/"

    failing = _fake_s3_storage(errors=True)
    with pytest.raises(RuntimeError, match="failed to delete"):
        failing.delete_prefix("clips/job-1/")


def test_s3_private_objects_get_fresh_presigned_urls() -> None:
    storage = _fake_s3_storage()
    assert storage.signed_read_url("clips/job/clip.mp4", 60) == (
        "https://private.example/clips/job/clip.mp4?ttl=60"
    )
