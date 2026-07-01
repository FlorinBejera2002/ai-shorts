import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status

from app.api.deps import get_current_user
from app.api.rate_limit import limiter
from app.config import settings
from app.models.user import User
from app.utils.file_utils import ensure_dir, safe_slug

router = APIRouter(prefix="/api/upload", tags=["upload"])

ALLOWED_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".webm"}
ALLOWED_CONTENT_TYPES = {
    "video/mp4",
    "video/quicktime",
    "video/x-msvideo",
    "video/x-matroska",
    "video/webm",
    "application/octet-stream",
}
VIDEO_SIGNATURES = (
    b"\x1a\x45\xdf\xa3",  # Matroska/WebM
    b"RIFF",  # AVI starts with RIFF and is validated further below.
)


def looks_like_supported_video(header: bytes, suffix: str) -> bool:
    if suffix in {".mp4", ".mov"} and len(header) >= 12 and header[4:8] == b"ftyp":
        return True
    if suffix in {".mkv", ".webm"} and header.startswith(VIDEO_SIGNATURES[0]):
        return True
    if suffix == ".avi" and header.startswith(b"RIFF") and header[8:12] == b"AVI ":
        return True
    return False


@router.post("", status_code=status.HTTP_201_CREATED)
@limiter.limit("12/hour")
async def upload_video(
    request: Request,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
) -> dict[str, str | int]:
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Unsupported video format")
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported content type")

    header = await file.read(64)
    if not looks_like_supported_video(header, suffix):
        raise HTTPException(status_code=400, detail="Invalid video file")

    upload_dir = ensure_dir(Path(settings.local_media_root) / "uploads" / str(user.id))
    filename = f"{uuid.uuid4().hex}-{safe_slug(Path(file.filename or 'video').stem)}{suffix}"
    destination = upload_dir / filename
    max_bytes = settings.max_upload_size_mb * 1024 * 1024
    written = 0

    with destination.open("wb") as output:
        output.write(header)
        written += len(header)
        while chunk := await file.read(1024 * 1024):
            written += len(chunk)
            if written > max_bytes:
                destination.unlink(missing_ok=True)
                raise HTTPException(status_code=413, detail="File too large")
            output.write(chunk)

    return {
        "file_path": str(destination),
        "file_name": filename,
        "file_size": written,
        "content_type": file.content_type or "application/octet-stream",
    }
