import uuid
import warnings
from pathlib import Path
from tempfile import NamedTemporaryFile

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from PIL import Image, UnidentifiedImageError
from starlette.concurrency import run_in_threadpool

from app.api.deps import get_current_user
from app.api.rate_limit import limiter
from app.models.user import User
from app.services.storage import get_storage_backend, storage_key_from_reference
from app.utils.file_utils import safe_slug
from app.utils.signed_url import make_signed_media_url

router = APIRouter(prefix="/api/brand", tags=["brand"])

MAX_LOGO_SIZE_MB = 5
ALLOWED_LOGO_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}
DELETABLE_LOGO_EXTENSIONS = ALLOWED_LOGO_EXTENSIONS | {".svg"}
ALLOWED_LOGO_CONTENT_TYPES = {
    "image/png",
    "image/jpeg",
    "image/webp",
    "application/octet-stream",
}
EXPECTED_CONTENT_TYPE = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
}
EXPECTED_IMAGE_FORMAT = {
    ".png": "PNG",
    ".jpg": "JPEG",
    ".jpeg": "JPEG",
    ".webp": "WEBP",
}


def looks_like_supported_image(header: bytes, suffix: str) -> bool:
    if suffix == ".png" and header.startswith(b"\x89PNG\r\n\x1a\n"):
        return True
    if suffix in {".jpg", ".jpeg"} and header.startswith(b"\xff\xd8\xff"):
        return True
    if suffix == ".webp" and header.startswith(b"RIFF") and header[8:12] == b"WEBP":
        return True
    return False


def content_type_matches_extension(content_type: str | None, suffix: str) -> bool:
    normalized = (content_type or "").split(";", 1)[0].strip().lower()
    return normalized in {
        EXPECTED_CONTENT_TYPE.get(suffix),
        "application/octet-stream",
    }


def is_valid_stored_image(path: Path, suffix: str) -> bool:
    """Fully parse the uploaded raster so a forged magic prefix is not accepted."""
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(path) as image:
                if image.format != EXPECTED_IMAGE_FORMAT.get(suffix):
                    return False
                if image.width <= 0 or image.height <= 0:
                    return False
                image.verify()
        return True
    except (
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
        OSError,
        SyntaxError,
        UnidentifiedImageError,
        ValueError,
    ):
        return False


def _owned_logo_key(
    reference: str, user_id: uuid.UUID, *, allow_legacy_svg: bool = False
) -> str:
    key = storage_key_from_reference(reference)
    expected_parent = f"brand/{user_id}"
    if not key or Path(key).as_posix().rsplit("/", 1)[0] != expected_parent:
        raise HTTPException(status_code=403, detail="Cannot access this file")
    extensions = (
        DELETABLE_LOGO_EXTENSIONS
        if allow_legacy_svg
        else ALLOWED_LOGO_EXTENSIONS
    )
    if Path(key).suffix.lower() not in extensions:
        raise HTTPException(status_code=403, detail="Cannot access this file")
    return key


def _fresh_logo_url(storage, key: str) -> str:
    return storage.signed_read_url(key) or make_signed_media_url(key)


@router.get("/logo")
async def get_logo_url(
    logo_path: str,
    user: User = Depends(get_current_user),
) -> dict[str, str]:
    """Resolve a stable, user-owned storage key to a short-lived read URL."""
    key = _owned_logo_key(logo_path, user.id)
    storage = get_storage_backend()
    if not await run_in_threadpool(storage.exists, key):
        raise HTTPException(status_code=404, detail="Logo not found")
    logo_url = await run_in_threadpool(_fresh_logo_url, storage, key)
    return {"logo_url": logo_url}


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
    if not content_type_matches_extension(file.content_type, suffix):
        raise HTTPException(status_code=400, detail="Unsupported content type")

    header = await file.read(512)
    if not looks_like_supported_image(header, suffix):
        raise HTTPException(status_code=400, detail="Invalid image file")

    filename = f"logo-{uuid.uuid4().hex}-{safe_slug(Path(file.filename or 'logo').stem)}{suffix}"
    logo_key = f"brand/{user.id}/{filename}"
    max_bytes = MAX_LOGO_SIZE_MB * 1024 * 1024
    written = 0
    temporary_path: Path | None = None

    try:
        with NamedTemporaryFile("wb", suffix=suffix, delete=False) as output:
            temporary_path = Path(output.name)
            output.write(header)
            written += len(header)
            while chunk := await file.read(1024 * 1024):
                written += len(chunk)
                if written > max_bytes:
                    raise HTTPException(status_code=413, detail="Image too large")
                output.write(chunk)

        if not await run_in_threadpool(is_valid_stored_image, temporary_path, suffix):
            raise HTTPException(status_code=400, detail="Invalid image file")

        storage = get_storage_backend()
        await run_in_threadpool(storage.save_file, temporary_path, logo_key)
    finally:
        if temporary_path:
            temporary_path.unlink(missing_ok=True)

    # Persist this stable key. Read URLs are deliberately generated on demand.
    return {"logo_path": logo_key}


@router.delete("/logo", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("30/hour")
async def delete_logo(
    request: Request,
    logo_path: str,
    user: User = Depends(get_current_user),
) -> None:
    # SVG uploads were supported historically. They cannot be read or uploaded
    # anymore, but owners must still be able to remove an existing SVG object.
    key = _owned_logo_key(logo_path, user.id, allow_legacy_svg=True)
    storage = get_storage_backend()
    await run_in_threadpool(storage.delete_file, key)
