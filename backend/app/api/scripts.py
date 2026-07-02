from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import get_current_user
from app.models.user import User
from app.schemas.script import (
    ScriptGenerateRequest,
    ScriptGenerateResponse,
)
from app.services.script_generator import generate_script

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/scripts", tags=["scripts"])


@router.post("/generate", response_model=ScriptGenerateResponse)
async def generate_script_endpoint(
    body: ScriptGenerateRequest,
    user: User = Depends(get_current_user),
):
    try:
        script_data = generate_script(
            topic=body.topic,
            platform=body.platform,
            duration=body.duration,
            tone=body.tone,
            target_audience=body.target_audience,
            language=body.language,
            style=body.style,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        logger.error("Script generation failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Script generation failed. Please try again.",
        ) from exc

    return ScriptGenerateResponse(script=script_data, credits_charged=0)
