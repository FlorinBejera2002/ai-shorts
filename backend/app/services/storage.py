from __future__ import annotations

import logging
import shutil
from pathlib import Path
from typing import Protocol

from app.config import settings
from app.utils.file_utils import ensure_dir

logger = logging.getLogger(__name__)


class StorageBackend(Protocol):
    def save_file(self, source_path: str | Path, key: str) -> str:
        ...

    def delete_file(self, key: str) -> None:
        ...

    def exists(self, key: str) -> bool:
        ...

    def public_url(self, key: str) -> str | None:
        ...


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

    def delete_file(self, key: str) -> None:
        path = self._path_for_key(key)
        if path.exists():
            path.unlink()

    def exists(self, key: str) -> bool:
        return self._path_for_key(key).exists()

    def public_url(self, key: str) -> str | None:
        if settings.app_env != "development":
            return None
        normalized_key = key.replace("\\", "/").lstrip("/")
        return f"/media/{normalized_key}"


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

    def delete_file(self, key: str) -> None:
        self.client.delete_object(Bucket=self.bucket, Key=key)

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


def get_storage_backend() -> StorageBackend:
    if settings.storage_type.lower() in {"s3", "r2"}:
        if not settings.aws_access_key_id or not settings.aws_secret_access_key:
            logger.warning("S3 storage requested without credentials; using local storage")
            return LocalStorage()
        return S3Storage()
    return LocalStorage()
