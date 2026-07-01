from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

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
