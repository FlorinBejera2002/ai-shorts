from __future__ import annotations

import logging
import shutil
from pathlib import Path
from typing import Protocol
from urllib.parse import urlparse

from app.config import settings
from app.utils.file_utils import ensure_dir

logger = logging.getLogger(__name__)


def storage_key_from_reference(value: str | None) -> str | None:
    if not value:
        return None

    normalized = value.replace("\\", "/").strip()
    if normalized.startswith(("http://", "https://")):
        configured_base = settings.aws_public_base_url
        if not configured_base:
            return None
        parsed = urlparse(normalized)
        public_base = urlparse(configured_base)
        if (parsed.scheme, parsed.netloc) != (public_base.scheme, public_base.netloc):
            return None
        base_path = public_base.path.rstrip("/")
        if base_path and not parsed.path.startswith(f"{base_path}/"):
            return None
        normalized = parsed.path[len(base_path) :].lstrip("/")
    elif normalized.startswith(("/media/", "media/")):
        # Signed local URLs carry expiry/signature query parameters. Only the
        # path is a storage reference.
        normalized = urlparse(normalized).path

    media_root = str(settings.local_media_root).replace("\\", "/").rstrip("/")
    if normalized == media_root:
        return None
    if normalized.startswith(f"{media_root}/"):
        normalized = normalized[len(media_root) + 1 :]
    elif normalized.startswith("/media/"):
        normalized = normalized[len("/media/") :]
    elif normalized.startswith("media/"):
        normalized = normalized[len("media/") :]
    elif normalized.startswith("/"):
        return None

    key = normalized.lstrip("/")
    if not key or key.startswith("../") or "/../" in f"/{key}/":
        return None
    return key


class StorageBackend(Protocol):
    def save_file(self, source_path: str | Path, key: str) -> str: ...

    def download_file(self, key: str, destination_path: str | Path) -> str: ...

    def delete_file(self, key: str) -> None: ...

    def delete_prefix(self, prefix: str) -> int: ...

    def exists(self, key: str) -> bool: ...

    def public_url(self, key: str) -> str | None: ...

    def signed_read_url(self, key: str, expires_in: int = 14400) -> str | None: ...


class LocalStorage:
    def __init__(self, root: str | Path | None = None) -> None:
        self.root = ensure_dir(root or settings.local_media_root)

    def _path_for_key(self, key: str) -> Path:
        safe_key = key.replace("\\", "/").lstrip("/")
        path = (self.root / safe_key).resolve()
        if self.root.resolve() not in path.parents and path != self.root.resolve():
            raise ValueError(f"unsafe storage key: {key}")
        return path

    def save_file(self, source_path: str | Path, key: str) -> str:
        source = Path(source_path)
        destination = self._path_for_key(key)
        ensure_dir(destination.parent)
        if source.resolve() != destination.resolve():
            shutil.copy2(source, destination)
        return str(destination)

    def download_file(self, key: str, destination_path: str | Path) -> str:
        source = self._path_for_key(key)
        if not source.is_file():
            raise FileNotFoundError(f"storage object not found: {key}")
        destination = Path(destination_path)
        ensure_dir(destination.parent)
        if source.resolve() != destination.resolve():
            shutil.copy2(source, destination)
        return str(destination)

    def delete_file(self, key: str) -> None:
        path = self._path_for_key(key)
        if path.exists():
            path.unlink()

    def delete_prefix(self, prefix: str) -> int:
        path = self._path_for_key(prefix.rstrip("/"))
        if path == self.root.resolve():
            raise ValueError("refusing to delete the storage root")
        if not path.exists():
            return 0
        if path.is_file():
            path.unlink()
            return 1
        deleted = sum(1 for candidate in path.rglob("*") if candidate.is_file())
        shutil.rmtree(path)
        return deleted

    def exists(self, key: str) -> bool:
        return self._path_for_key(key).exists()

    def public_url(self, key: str) -> str | None:
        if settings.app_env != "development":
            return None
        normalized_key = key.replace("\\", "/").lstrip("/")
        return f"/media/{normalized_key}"

    def signed_read_url(self, key: str, expires_in: int = 14400) -> str | None:
        # Local media is protected by nginx auth_request + the application's
        # HMAC URL. The API layer generates that URL from the stable key.
        return None


class S3Storage:
    def __init__(self) -> None:
        try:
            import boto3
        except ImportError as exc:
            raise RuntimeError("boto3 is required for S3 storage") from exc

        client_kwargs = {
            "aws_access_key_id": settings.aws_access_key_id,
            "aws_secret_access_key": settings.aws_secret_access_key,
            "region_name": settings.aws_region,
        }
        if settings.aws_endpoint_url:
            client_kwargs["endpoint_url"] = settings.aws_endpoint_url
        self.client = boto3.client("s3", **client_kwargs)
        self.bucket = settings.aws_s3_bucket

    def save_file(self, source_path: str | Path, key: str) -> str:
        self.client.upload_file(str(source_path), self.bucket, key)
        return key

    def download_file(self, key: str, destination_path: str | Path) -> str:
        destination = Path(destination_path)
        ensure_dir(destination.parent)
        self.client.download_file(self.bucket, key, str(destination))
        return str(destination)

    def delete_file(self, key: str) -> None:
        self.client.delete_object(Bucket=self.bucket, Key=key)

    def delete_prefix(self, prefix: str) -> int:
        normalized = prefix.replace("\\", "/").strip().lstrip("/").rstrip("/")
        if not normalized or normalized.startswith("../") or "/../" in f"/{normalized}/":
            raise ValueError(f"unsafe storage prefix: {prefix}")
        object_prefix = f"{normalized}/"
        deleted = 0
        continuation_token: str | None = None
        while True:
            request: dict[str, str] = {
                "Bucket": self.bucket,
                "Prefix": object_prefix,
            }
            if continuation_token:
                request["ContinuationToken"] = continuation_token
            page = self.client.list_objects_v2(**request)
            objects = [{"Key": item["Key"]} for item in page.get("Contents", [])]
            if objects:
                response = self.client.delete_objects(
                    Bucket=self.bucket,
                    Delete={"Objects": objects, "Quiet": True},
                )
                if response.get("Errors"):
                    raise RuntimeError(
                        f"storage failed to delete {len(response['Errors'])} objects"
                    )
                deleted += len(objects)
            if not page.get("IsTruncated"):
                break
            continuation_token = page.get("NextContinuationToken")
            if not continuation_token:
                raise RuntimeError("storage listing was truncated without a token")
        return deleted

    def exists(self, key: str) -> bool:
        try:
            self.client.head_object(Bucket=self.bucket, Key=key)
            return True
        except Exception:
            return False

    def public_url(self, key: str) -> str | None:
        if settings.aws_public_base_url:
            return f"{settings.aws_public_base_url.rstrip('/')}/{key}"
        return None

    def signed_read_url(self, key: str, expires_in: int = 14400) -> str | None:
        return self.client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self.bucket, "Key": key},
            ExpiresIn=expires_in,
        )


def get_storage_backend() -> StorageBackend:
    if settings.storage_type.lower() in {"s3", "r2"}:
        if not settings.aws_access_key_id or not settings.aws_secret_access_key:
            if settings.app_env == "production":
                raise RuntimeError(
                    "S3/R2 storage credentials are required in production"
                )
            logger.warning(
                "S3 storage requested without credentials; using local storage"
            )
            return LocalStorage()
        return S3Storage()
    return LocalStorage()
