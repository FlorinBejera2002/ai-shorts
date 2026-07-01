from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from app.config import settings
from app.schemas.processing import TranscriptResult, TranscriptSegment, TranscriptWord
from app.utils.ffmpeg_utils import get_video_duration, has_audio_stream, validate_video_file

logger = logging.getLogger(__name__)

_model = None
_model_key: tuple[str, str, str] | None = None


def _get_model():
    global _model, _model_key
    key = (
        settings.whisper_model_size,
        settings.whisper_device,
        settings.whisper_compute_type,
    )
    if _model is not None and _model_key == key:
        return _model

    try:
        from faster_whisper import WhisperModel
    except ImportError as exc:
        raise RuntimeError("faster-whisper is required for transcription") from exc

    _model = WhisperModel(
        settings.whisper_model_size,
        device=settings.whisper_device,
        compute_type=settings.whisper_compute_type,
    )
    _model_key = key
    logger.info("Loaded Faster-Whisper model %s", settings.whisper_model_size)
    return _model


def transcribe_video(video_path: str) -> dict[str, Any]:
    path = Path(video_path)
    validate_video_file(path)
    if not has_audio_stream(path):
        raise ValueError(f"video has no audio stream: {path}")

    model = _get_model()
    segments_iter, info = model.transcribe(
        str(path),
        word_timestamps=True,
        vad_filter=True,
    )

    segments: list[TranscriptSegment] = []
    words: list[TranscriptWord] = []
    text_parts: list[str] = []

    for index, segment in enumerate(segments_iter):
        segment_words = [
            TranscriptWord(
                text=(word.word or "").strip(),
                start=float(word.start),
                end=float(word.end),
            )
            for word in (segment.words or [])
            if (word.word or "").strip()
        ]
        words.extend(segment_words)
        text = (segment.text or "").strip()
        if text:
            text_parts.append(text)
        segments.append(
            TranscriptSegment(
                id=index,
                start=float(segment.start),
                end=float(segment.end),
                text=text,
                words=segment_words,
            )
        )

    result = TranscriptResult(
        text=" ".join(text_parts).strip(),
        language=getattr(info, "language", None),
        duration=get_video_duration(path),
        segments=segments,
        words=words,
    )
    if not result.text:
        raise ValueError("transcription produced empty text")
    return result.model_dump()
