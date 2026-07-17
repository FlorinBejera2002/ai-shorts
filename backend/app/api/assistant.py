# NOTE: no `from __future__ import annotations` here — string annotations cannot
# be resolved through slowapi's wrapper and break FastAPI request-body modeling
import logging
import uuid

from fastapi import (
    APIRouter,
    Body,
    Depends,
    HTTPException,
    Query,
    Request,
    Response,
    status,
)
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.api.rate_limit import limiter
from app.database import get_db
from app.models.chat import ChatMessage
from app.models.clip import Clip
from app.models.job import Job
from app.models.user import User
from app.schemas.assistant import ChatHistory, ChatMessageRead, ChatRequest, ChatResponse
from app.services.assistant import MAX_HISTORY_MESSAGES, run_assistant

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/assistant", tags=["assistant"])


async def _load_clip_context(
    db: AsyncSession, clip_id: uuid.UUID, user: User
) -> tuple[Clip, list[dict] | None]:
    clip = await db.get(Clip, clip_id)
    if not clip or clip.user_id != user.id:
        raise HTTPException(status_code=404, detail="Clip not found")
    transcript_chunks: list[dict] | None = None
    job = await db.get(Job, clip.job_id)
    if job and isinstance(job.transcript_segments, list) and job.transcript_segments:
        transcript_chunks = job.transcript_segments
    elif clip.transcript_text:
        # Legacy clips without stored chunks: plain text still helps the model
        transcript_chunks = [{"s": None, "e": None, "text": clip.transcript_text[:20000]}]
    return clip, transcript_chunks


@router.post("/chat", response_model=ChatResponse)
@limiter.limit("60/hour")
async def assistant_chat(
    request: Request,
    # Explicit Body(): slowapi's wrapper hides module globals from FastAPI's
    # annotation resolution, which otherwise models this as a query param
    payload: ChatRequest = Body(),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ChatResponse:
    clip_id: uuid.UUID | None = None
    transcript_chunks: list[dict] | None = None

    if payload.context == "editor":
        if not payload.clip_id:
            raise HTTPException(status_code=400, detail="clip_id is required for editor chat")
        clip, transcript_chunks = await _load_clip_context(db, payload.clip_id, user)
        clip_id = clip.id

    history_result = await db.execute(
        select(ChatMessage)
        .where(
            ChatMessage.user_id == user.id,
            ChatMessage.context == payload.context,
            ChatMessage.clip_id == clip_id,
        )
        .order_by(ChatMessage.created_at.desc())
        .limit(MAX_HISTORY_MESSAGES)
    )
    history = [
        {"role": m.role, "content": m.content}
        for m in reversed(list(history_result.scalars().all()))
    ]

    try:
        result = run_assistant(
            context=payload.context,
            message=payload.message,
            history=history,
            create_state=payload.create_state,
            editor_state=payload.editor_state,
            transcript_chunks=transcript_chunks,
        )
    except ValueError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:  # Gemini/network failures must not 500 opaquely
        logger.exception("Assistant call failed")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Assistant is temporarily unavailable",
        ) from exc

    db.add(
        ChatMessage(
            user_id=user.id,
            clip_id=clip_id,
            context=payload.context,
            role="user",
            content=payload.message,
        )
    )
    db.add(
        ChatMessage(
            user_id=user.id,
            clip_id=clip_id,
            context=payload.context,
            role="assistant",
            content=result["reply"],
            actions=result["actions"] or None,
        )
    )
    await db.commit()

    return ChatResponse(reply=result["reply"], actions=result["actions"])


@router.get("/history", response_model=ChatHistory)
async def assistant_history(
    context: str = Query(pattern="^(create|editor)$"),
    clip_id: uuid.UUID | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ChatHistory:
    result = await db.execute(
        select(ChatMessage)
        .where(
            ChatMessage.user_id == user.id,
            ChatMessage.context == context,
            ChatMessage.clip_id == clip_id,
        )
        .order_by(ChatMessage.created_at.desc())
        .limit(50)
    )
    messages = [
        ChatMessageRead(
            id=m.id,
            role=m.role,
            content=m.content,
            actions=m.actions,
            created_at=m.created_at,
        )
        for m in reversed(list(result.scalars().all()))
    ]
    return ChatHistory(messages=messages)


@router.delete(
    "/history", status_code=status.HTTP_204_NO_CONTENT, response_class=Response
)
async def clear_assistant_history(
    context: str = Query(pattern="^(create|editor)$"),
    clip_id: uuid.UUID | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    await db.execute(
        delete(ChatMessage).where(
            ChatMessage.user_id == user.id,
            ChatMessage.context == context,
            ChatMessage.clip_id == clip_id,
        )
    )
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
