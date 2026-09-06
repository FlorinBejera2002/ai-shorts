"""Explicit Celery entry point for the disposable Go/Python integration smoke.

Only transcription and highlight selection are deterministic. Queueing, database
fencing, source retrieval, FFmpeg, captions, storage and edit tasks are real.
Production workers never import this module.
"""

import os
from pathlib import Path
import time

from app.services import processing_pipeline
from app.workers.celery_app import celery_app as celery_app


if os.environ.get("SNEEPCUT_WORKER_SMOKE") != "1":
    raise RuntimeError("The worker smoke fixture requires explicit test opt-in")


def transcribe_fixture(video_path, language=None):
    duration = processing_pipeline.get_video_duration(video_path)
    words = [
        {"text": text, "start": index * 0.8 + 1, "end": index * 0.8 + 1.6}
        for index, text in enumerate(
            "Synthetic speech verifies the actual caption renderer".split()
        )
    ]
    return {
        "text": " ".join(word["text"] for word in words),
        "language": language or "en",
        "duration": duration,
        "words": words,
        "segments": [
            {"id": 0, "start": 1, "end": 8, "text": "Synthetic speech", "words": words}
        ],
    }


def highlights_fixture(transcript, duration, requested_clips=1, user_instructions=None):
    if user_instructions == "smoke:fail":
        raise RuntimeError("Deterministic external AI failure")
    if user_instructions and user_instructions.startswith("smoke:pause:"):
        name = user_instructions.removeprefix("smoke:pause:")
        if not name.isalnum():
            raise ValueError("Invalid smoke gate identifier")
        root = Path(os.environ["LOCAL_MEDIA_ROOT"]) / "fixture-control"
        root.mkdir(exist_ok=True)
        (root / (name + ".entered")).touch()
        deadline = time.monotonic() + 90
        while not (root / (name + ".release")).exists():
            if time.monotonic() > deadline:
                raise RuntimeError("Smoke gate timed out")
            time.sleep(0.1)
    assert transcript["text"] and duration >= 10 and requested_clips == 1
    return [
        {
            "segments": [{"start": 1, "end": 9}],
            "transition": "cut",
            "viral_score": 8,
            "source": "gemini",
            "video_title_for_youtube_short": "Synthetic worker integration clip",
            "video_description_for_tiktok": "Fixture caption",
            "viral_hook_text": "A deterministic fixture",
        }
    ]


processing_pipeline.transcribe_video = transcribe_fixture
processing_pipeline.detect_highlights = highlights_fixture
