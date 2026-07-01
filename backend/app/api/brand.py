import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status

from app.api.deps import get_current_user
from app.api.rate_limit import limiter
from app.config import settings
from app.models.user import User
from app.utils.file_utils import ensure_dir, safe_slug
from app.utils.signed_url import make_signed_media_url

router = APIRouter(prefix="/api/brand", tags=["brand"])

MAX_LOGO_SIZE_MB = 5
ALLOWED_LOGO_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".svg"}
ALLOWED_LOGO_CONTENT_TYPES = {
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/svg+xml",
    "application/octet-stream",
}


def looks_like_supported_image(header: bytes, suffix: str) -> bool:
    if suffix in {".png"} and header.startswith(b"\x89PNG\r\n\x1a\n"):
        return True
    if suffix in {".jpg", ".jpeg"} and header.startswith(b"\xff\xd8\xff"):
        return True
    if suffix == ".webp" and header.startswith(b"RIFF") and header[8:12] == b"WEBP":
        return True
    if suffix == ".svg":
        text = header.decode("utf-8", errors="ignore").lstrip().lower()
        return text.startswith("<?xml") or text.startswith("<svg")
    return False


def _logo_dir(user_id: uuid.UUID) -> Path:
    return ensure_dir(Path(settings.local_media_root) / "brand" / str(user_id))


@router.post("/logo", status_code=status.HTTP_201_CREATED)
@limiter.limit("10/hour")
async def upload_logo(
    request: Request,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
) -> dict[str, str]:
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_LOGO_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Unsupported image format")
    if file.content_type not in ALLOWED_LOGO_CONTENT_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported content type")

    header = await file.read(512)
    if not looks_like_supported_image(header, suffix):
        raise HTTPException(status_code=400, detail="Invalid image file")

    logo_dir = _logo_dir(user.id)
    filename = f"logo-{uuid.uuid4().hex}-{safe_slug(Path(file.filename or 'logo').stem)}{suffix}"
    destination = logo_dir / filename
    max_bytes = MAX_LOGO_SIZE_MB * 1024 * 1024
    written = 0

    with destination.open("wb") as output:
        output.write(header)
        written += len(header)
        while chunk := await file.read(1024 * 1024):
            written += len(chunk)
            if written > max_bytes:
                destination.unlink(missing_ok=True)
                raise HTTPException(status_code=413, detail="Image too large")
            output.write(chunk)

    return {
        "logo_path": str(destination),
        "logo_url": make_signed_media_url(str(destination)),
    }


@router.delete("/logo", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("30/hour")
async def delete_logo(
    request: Request,
    logo_path: str,
    user: User = Depends(get_current_user),
) -> None:
    expected_dir = _logo_dir(user.id).resolve()
    target = Path(logo_path).resolve()
    if expected_dir not in target.parents:
        raise HTTPException(status_code=403, detail="Cannot delete this file")
    target.unlink(missing_ok=True)
