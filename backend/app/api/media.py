from __future__ import annotations

from urllib.parse import parse_qs, urlsplit

from fastapi import APIRouter, Header, HTTPException, Query, Response, status

from app.utils.signed_url import verify_signature

router = APIRouter(prefix="/api/media", tags=["media"])


@router.get("/verify")
async def verify_media_url(
    path: str = Query(...),
    expires: str = Query(...),
    sig: str = Query(...),
) -> dict[str, bool]:
    if not verify_signature(path, expires, sig):
        raise HTTPException(status_code=403, detail="Invalid or expired URL")
    return {"valid": True}


@router.get(
    "/verify-request", response_class=Response, status_code=status.HTTP_204_NO_CONTENT
)
async def verify_media_request(
    x_original_uri: str | None = Header(default=None),
) -> Response:
    """Authorize nginx's internal auth subrequest for a signed media URL."""
    if not x_original_uri or len(x_original_uri) > 4096:
        raise HTTPException(status_code=403, detail="Invalid or expired URL")

    parsed = urlsplit(x_original_uri)
    query = parse_qs(parsed.query, keep_blank_values=True)
    expires = query.get("expires", [""])
    signatures = query.get("sig", [""])
    if (
        not parsed.path.startswith("/media/")
        or len(expires) != 1
        or len(signatures) != 1
        or not verify_signature(parsed.path, expires[0], signatures[0])
    ):
        raise HTTPException(status_code=403, detail="Invalid or expired URL")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
