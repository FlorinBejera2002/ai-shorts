from __future__ import annotations

import re
import shutil
import uuid
from pathlib import Path


_SAFE_CHARS_RE = re.compile(r"[^a-zA-Z0-9._-]+")


def safe_slug(value: str, fallback: str = "video", max_length: int = 80) -> str:
    slug = _SAFE_CHARS_RE.sub("-", value.strip().lower())
    slug = re.sub(r"-{2,}", "-", slug).strip("-._")
    if not slug:
        slug = fallback
    return slug[:max_length].strip("-._") or fallback


def ensure_dir(path: str | Path) -> Path:
    directory = Path(path)
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def unique_path(directory: str | Path, stem: str, suffix: str) -> Path:
    directory_path = ensure_dir(directory)
    suffix = suffix if suffix.startswith(".") else f".{suffix}"
    safe_stem = safe_slug(stem)
    candidate = directory_path / f"{safe_stem}{suffix}"
    counter = 2
    while candidate.exists():
        candidate = directory_path / f"{safe_stem}-{counter}{suffix}"
        counter += 1
    return candidate


def create_job_workspace(output_root: str | Path, job_id: str | None = None) -> Path:
    root = ensure_dir(output_root)
    safe_job_id = safe_slug(job_id or uuid.uuid4().hex, fallback=uuid.uuid4().hex)
    return ensure_dir(root / "work" / safe_job_id)


def cleanup_path(path: str | Path) -> None:
    target = Path(path).resolve()
    if not target.exists():
        return
    if len(target.parts) < 3:
        raise ValueError(f"refusing to remove unsafe path: {target}")
    if target.is_dir():
        shutil.rmtree(target)
    else:
        target.unlink()
