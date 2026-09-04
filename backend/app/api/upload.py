import base64
import binascii
import hashlib
import hmac
import json
import os
import re
import time
import uuid
from pathlib import Path
from typing import Any

from fastapi import (
    APIRouter,
    Depends,
    Header,
    HTTPException,
    Request,
    status,
)
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.datastructures import UploadFile

from app.api.deps import enforce_content_role, ensure_account_active, get_current_user
from app.api.rate_limit import limiter
from app.config import settings
from app.database import get_db
from app.models.user import User
from app.services.upload_scanner import require_clean_upload
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
UPLOAD_TOKEN_KEYS = {
    "version",
    "userId",
    "nonce",
    "expiresAt",
    "fileName",
    "fileSize",
    "contentType",
}
UPLOAD_NONCE_PREFIX = "upload-nonce:"


def _decode_base64url(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    decoded = base64.b64decode(value + padding, altchars=b"-_", validate=True)

    # Reject alternate, non-canonical encodings whose unused trailing bits decode
    # to the same bytes. Otherwise changing the final token character can appear
    # to tamper with a token while leaving the verified signature unchanged.
    canonical_value = base64.urlsafe_b64encode(decoded).decode("ascii").rstrip("=")
    if not hmac.compare_digest(value, canonical_value):
        raise ValueError("Non-canonical base64url value")

    return decoded


def verify_upload_token(
    token: str, *, secret: str, now: int | None = None
) -> dict[str, Any]:
    if len(secret) < 32 or not token or len(token) > 4096:
        raise ValueError("invalid upload token")
    try:
        encoded_payload, encoded_signature = token.split(".")
        supplied_signature = _decode_base64url(encoded_signature)
        expected_signature = hmac.new(
            secret.encode("utf-8"), encoded_payload.encode("ascii"), hashlib.sha256
        ).digest()
        if not hmac.compare_digest(supplied_signature, expected_signature):
            raise ValueError("invalid upload token")
        payload = json.loads(_decode_base64url(encoded_payload))
    except (ValueError, UnicodeError, binascii.Error, json.JSONDecodeError) as exc:
        raise ValueError("invalid upload token") from exc

    if not isinstance(payload, dict) or set(payload) != UPLOAD_TOKEN_KEYS:
        raise ValueError("invalid upload token")
    current_time = int(time.time()) if now is None else now
    expires_at = payload.get("expiresAt")
    file_size = payload.get("fileSize")
    if (
        payload.get("version") != 1
        or not isinstance(expires_at, int)
        or expires_at <= current_time
        or expires_at > current_time + 10 * 60
        or not isinstance(file_size, int)
        or isinstance(file_size, bool)
        or file_size < 1
        or file_size > settings.max_upload_size_mb * 1024 * 1024
        or not isinstance(payload.get("fileName"), str)
        or not isinstance(payload.get("contentType"), str)
        or not isinstance(payload.get("nonce"), str)
        or not re.fullmatch(r"[0-9a-f]{32}", payload["nonce"])
    ):
        raise ValueError("invalid upload token")
    try:
        uuid.UUID(str(payload.get("userId")))
    except ValueError as exc:
        raise ValueError("invalid upload token") from exc
    return payload


async def get_upload_user(
    request: Request,
    authorization: str | None = Header(default=None),
    x_internal_api_key: str | None = Header(default=None),
    x_user_id: str | None = Header(default=None),
    x_user_email: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
) -> User:
    if authorization:
        scheme, _, token = authorization.partition(" ")
        if scheme.lower() != "bearer" or not token:
            raise HTTPException(status_code=401, detail="Invalid upload authorization")
        try:
            claims = verify_upload_token(token, secret=settings.upload_token_secret)
        except ValueError as exc:
            raise HTTPException(
                status_code=401, detail="Invalid upload authorization"
            ) from exc
        user = await db.get(User, uuid.UUID(claims["userId"]))
        if not user:
            raise HTTPException(status_code=401, detail="Invalid upload authorization")
        await ensure_account_active(db, user.id)
        enforce_content_role(user, request.method)
        request.state.upload_claims = claims
        return user

    return await get_current_user(
        request=request,
        x_internal_api_key=x_internal_api_key,
        x_user_id=x_user_id,
        x_user_email=x_user_email,
        db=db,
    )


def looks_like_supported_video(header: bytes, suffix: str) -> bool:
    if suffix in {".mp4", ".mov"} and len(header) >= 12 and header[4:8] == b"ftyp":
        return True
    if suffix in {".mkv", ".webm"} and header.startswith(VIDEO_SIGNATURES[0]):
        return True
    return suffix == ".avi" and header.startswith(b"RIFF") and header[8:12] == b"AVI "


def validate_direct_upload_headers(
    claims: dict[str, Any],
    *,
    content_length: str | None,
    content_type: str | None,
) -> None:
    try:
        length = int(content_length or "")
    except ValueError as exc:
        raise ValueError("Content-Length is required") from exc

    if length != claims["fileSize"]:
        raise ValueError("Upload size does not match authorization")
    if (content_type or "").split(";", 1)[0].strip().lower() != claims["contentType"]:
        raise ValueError("Upload content type does not match authorization")


async def consume_upload_nonce(claims: dict[str, Any]) -> None:
    ttl = max(1, claims["expiresAt"] - int(time.time()))
    redis = Redis.from_url(
        settings.redis_url,
        socket_connect_timeout=5,
        socket_timeout=5,
        retry_on_timeout=False,
    )
    try:
        claimed = await redis.set(
            f"{UPLOAD_NONCE_PREFIX}{claims['nonce']}",
            claims["userId"],
            ex=ttl,
            nx=True,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Upload authorization is temporarily unavailable",
        ) from exc
    finally:
        await redis.aclose()

    if not claimed:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Upload authorization was already used",
        )


@router.put("/direct", status_code=status.HTTP_201_CREATED)
@limiter.limit("12/hour")
async def upload_video_direct(
    request: Request,
    user: User = Depends(get_upload_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str | int]:
    """Authenticate before streaming a large raw video body to durable storage."""
    claims = getattr(request.state, "upload_claims", None)
    if not claims:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Direct upload authorization is required",
        )
    if settings.storage_type.lower() not in {"local", "filesystem"}:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Direct uploads require configured durable filesystem storage",
        )

    try:
        validate_direct_upload_headers(
            claims,
            content_length=request.headers.get("content-length"),
            content_type=request.headers.get("content-type"),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    # Claim immediately before reading the body. A token is intentionally
    # single-use, including when an upload disconnects partway through.
    await consume_upload_nonce(claims)

    suffix = Path(claims["fileName"]).suffix.lower()
    upload_dir = ensure_dir(Path(settings.local_media_root) / "uploads" / str(user.id))
    filename = f"{uuid.uuid4().hex}-{safe_slug(Path(claims['fileName']).stem)}{suffix}"
    destination = upload_dir / filename
    partial = destination.with_name(f".{destination.name}.part")
    written = 0
    header = bytearray()

    try:
        with partial.open("xb") as output:
            async for chunk in request.stream():
                if not chunk:
                    continue
                written += len(chunk)
                if written > claims["fileSize"]:
                    raise ValueError("Upload exceeds its authorized size")
                if len(header) < 64:
                    header.extend(chunk[: 64 - len(header)])
                output.write(chunk)
            output.flush()
            os.fsync(output.fileno())

        if written != claims["fileSize"]:
            raise ValueError("Upload size does not match authorization")
        if not looks_like_supported_video(bytes(header), suffix):
            raise ValueError("Invalid video file")
        await require_clean_upload(partial)
        os.replace(partial, destination)
        await ensure_account_active(db, user.id)
    except HTTPException:
        partial.unlink(missing_ok=True)
        destination.unlink(missing_ok=True)
        raise
    except ValueError as exc:
        partial.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        partial.unlink(missing_ok=True)
        destination.unlink(missing_ok=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Upload could not be stored",
        ) from exc
    finally:
        partial.unlink(missing_ok=True)

    return {
        "file_path": str(destination),
        "file_name": filename,
        "file_size": written,
        "content_type": claims["contentType"],
    }


@router.post("", status_code=status.HTTP_201_CREATED)
@limiter.limit("12/hour")
async def upload_video(
    request: Request,
    user: User = Depends(get_upload_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str | int]:
    if getattr(request.state, "upload_claims", None):
        raise HTTPException(
            status_code=400,
            detail="Signed uploads must use the direct upload endpoint",
        )

    max_bytes = settings.max_upload_size_mb * 1024 * 1024
    try:
        content_length = int(request.headers.get("content-length") or "")
    except ValueError as exc:
        raise HTTPException(
            status_code=411, detail="Content-Length is required"
        ) from exc
    if content_length < 1 or content_length > max_bytes + 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large")

    # Parse multipart only after the internal user authentication dependency has
    # succeeded, so an anonymous request cannot force a multi-gigabyte spool.
    form = await request.form()
    file = form.get("file")
    if not isinstance(file, UploadFile):
        raise HTTPException(status_code=400, detail="A video file is required")

    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Unsupported video format")
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported content type")

    claims = getattr(request.state, "upload_claims", None)
    if claims and (
        claims["fileName"] != (file.filename or "")
        or claims["contentType"] != (file.content_type or "application/octet-stream")
        or (file.size is not None and claims["fileSize"] != file.size)
    ):
        raise HTTPException(
            status_code=400, detail="Upload does not match authorization"
        )

    header = await file.read(64)
    if not looks_like_supported_video(header, suffix):
        raise HTTPException(status_code=400, detail="Invalid video file")

    upload_dir = ensure_dir(Path(settings.local_media_root) / "uploads" / str(user.id))
    filename = (
        f"{uuid.uuid4().hex}-{safe_slug(Path(file.filename or 'video').stem)}{suffix}"
    )
    destination = upload_dir / filename
    written = 0

    partial = destination.with_name(f".{destination.name}.part")
    try:
        with partial.open("xb") as output:
            output.write(header)
            written += len(header)
            while chunk := await file.read(1024 * 1024):
                written += len(chunk)
                if written > max_bytes:
                    raise HTTPException(status_code=413, detail="File too large")
                output.write(chunk)
            output.flush()
            os.fsync(output.fileno())
        await require_clean_upload(partial)
        await ensure_account_active(db, user.id)
        os.replace(partial, destination)
    except BaseException:
        partial.unlink(missing_ok=True)
        destination.unlink(missing_ok=True)
        raise
    finally:
        await file.close()

    return {
        "file_path": str(destination),
        "file_name": filename,
        "file_size": written,
        "content_type": file.content_type or "application/octet-stream",
    }
