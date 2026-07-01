# Phase 2: Video Processing Core - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` or `superpowers:subagent-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local, testable backend video-processing pipeline that can take either an uploaded video file or a YouTube URL, download/store the source video, transcribe it, detect viral clip windows, cut clips, optionally convert clips to vertical format, optionally burn subtitles, and return durable metadata for later database/API integration.

**Phase 2 boundary:** This phase builds backend processing services, verification scripts, and a Celery task adapter for the processing pipeline. It does **not** build user-facing dashboard flows, auth, credits, or persistent job tables. Phase 3/4 will connect these services to database models, API endpoints, and durable job progress.

**Current repo state as of 2026-06-29:**
- `backend/requirements.txt` already includes Phase 2 dependencies.
- `backend/Dockerfile` and `backend/Dockerfile.worker` already install FFmpeg and OpenCV runtime libraries.
- Partial implementations exist in:
  - `backend/app/services/highlight_detector.py`
  - `backend/app/services/clip_generator.py`
  - `backend/app/services/subtitle_burner.py`
  - `backend/app/services/smart_crop.py`
  - `backend/app/services/social_poster.py`
- Placeholder files still exist in:
  - `backend/app/services/video_downloader.py`
  - `backend/app/services/transcriber.py`
  - `backend/app/services/storage.py`
  - `backend/app/utils/ffmpeg_utils.py`
  - `backend/app/utils/file_utils.py`

---

## Exit Criteria

- A single Python service function can process a local video file end-to-end and produce clip files plus metadata.
- A single Python service function can process a YouTube URL after downloading the source video with `yt-dlp`.
- Faster-Whisper transcription returns normalized transcript text, segments, and word-level timestamps.
- Gemini highlight detection validates and normalizes model output before downstream FFmpeg usage.
- Clip extraction rejects invalid windows, unsafe filenames, missing inputs, and out-of-range timestamps.
- Smart crop and subtitle burn steps are optional, configurable, and can be disabled for local smoke tests.
- Local storage works without S3 credentials; S3/R2 upload paths are implemented behind the same interface.
- FFmpeg and ffprobe helpers are centralized in `backend/app/utils/ffmpeg_utils.py`.
- File path, temp directory, cleanup, and filename helpers are centralized in `backend/app/utils/file_utils.py`.
- Unit tests cover pure validation/normalization logic and mocked external integrations.
- A developer smoke script can run the pipeline against a small local fixture without database/Celery.

---

## Architecture

### Processing Flow

```text
Input source
  -> video_downloader/local_input
  -> storage.save_source
  -> ffmpeg_utils.probe_video
  -> transcriber.transcribe_video
  -> highlight_detector.detect_highlights
  -> highlight_detector.validate_highlights
  -> clip_generator.extract_all_clips
  -> optional smart_crop.process_video_to_vertical
  -> optional subtitle_burner.generate_srt + burn_subtitles
  -> storage.save_outputs
  -> pipeline result JSON
```

### Proposed Service Contract

Create `backend/app/services/processing_pipeline.py`.

```python
def process_video_source(
    source: str,
    output_root: str = "/app/media",
    source_type: str = "auto",
    requested_clips: int = 5,
    aspect_ratio: str = "9:16",
    burn_subtitles: bool = True,
    smart_crop: bool = True,
) -> dict:
    ...
```

Return shape:

```json
{
  "source": {
    "type": "youtube",
    "title": "example",
    "duration": 123.45,
    "local_path": "/app/media/sources/source.mp4"
  },
  "transcript": {
    "text": "...",
    "language": "en",
    "segments": [],
    "words": []
  },
  "clips": [
    {
      "index": 1,
      "start": 12.34,
      "end": 42.1,
      "duration": 29.76,
      "title": "...",
      "hook_text": "...",
      "file_path": "/app/media/clips/clip-1.mp4",
      "vertical_file_path": "/app/media/clips/clip-1-vertical.mp4",
      "subtitled_file_path": "/app/media/clips/clip-1-final.mp4",
      "metadata": {}
    }
  ],
  "errors": []
}
```

---

## File Map

### Create

| File | Purpose |
|------|---------|
| `backend/app/services/processing_pipeline.py` | Orchestrates Phase 2 services without DB coupling |
| `backend/app/schemas/processing.py` | Pydantic models for transcript, highlight, clip, and pipeline result |
| `backend/tests/conftest.py` | Shared pytest fixtures |
| `backend/tests/services/test_highlight_detector.py` | Validation tests for Gemini output |
| `backend/tests/services/test_clip_generator.py` | FFmpeg command/window validation tests |
| `backend/tests/services/test_file_utils.py` | Filename/path/temp cleanup tests |
| `backend/tests/services/test_processing_pipeline.py` | Mocked orchestration tests |
| `scripts/process_local_video.py` | Smoke script for a local video path |
| `scripts/process_youtube_url.py` | Smoke script for a YouTube URL |

### Modify

| File | Purpose |
|------|---------|
| `backend/requirements.txt` | Add missing runtime/test dependencies only if needed |
| `backend/app/config.py` | Add explicit Phase 2 settings and local media paths |
| `backend/app/services/video_downloader.py` | Implement yt-dlp download and metadata extraction |
| `backend/app/services/transcriber.py` | Implement faster-whisper transcription |
| `backend/app/services/highlight_detector.py` | Add validation, retries, JSON extraction, fallback handling |
| `backend/app/services/clip_generator.py` | Centralize ffmpeg calls, sanitize filenames, validate windows |
| `backend/app/services/subtitle_burner.py` | Align transcript format with transcriber output |
| `backend/app/services/smart_crop.py` | Fix output resolution, resource handling, and optional fallback mode |
| `backend/app/services/storage.py` | Implement local and S3/R2 storage interface |
| `backend/app/utils/ffmpeg_utils.py` | Add ffprobe, ffmpeg run helper, media validation |
| `backend/app/utils/file_utils.py` | Add safe filename, mkdir, temp workspace, cleanup helpers |
| `backend/Dockerfile` | Keep FFmpeg and ML runtime libs; avoid unnecessary build bloat |
| `backend/Dockerfile.worker` | Same runtime support as backend, runs Celery worker |
| `backend/app/workers/celery_app.py` | Configure Celery runtime safety defaults |
| `backend/app/workers/tasks.py` | Expose Phase 2 processing pipeline as a Celery task |

---

## Tasks

### Task 1: Normalize Shared Schemas

**Files:**
- Create: `backend/app/schemas/processing.py`

- [ ] Define `TranscriptWord`, `TranscriptSegment`, `TranscriptResult`, `HighlightCandidate`, `ClipOutput`, and `PipelineResult` Pydantic models.
- [ ] Use seconds as `float` everywhere. Do not introduce timestamp strings into service contracts.
- [ ] Add validators for:
  - `start >= 0`
  - `end > start`
  - `duration = end - start`
  - clip duration between configured min/max values after highlight validation
- [ ] Keep these schemas free of SQLAlchemy, Celery, and FastAPI request objects.

### Task 2: Implement FFmpeg Utilities

**Files:**
- Modify: `backend/app/utils/ffmpeg_utils.py`
- Modify: `backend/app/services/clip_generator.py`

- [ ] Add `run_ffmpeg(cmd: list[str], timeout: int = 900) -> subprocess.CompletedProcess`.
- [ ] Add `probe_video(path: str) -> dict` using `ffprobe` JSON output.
- [ ] Add `get_video_duration(path: str) -> float`.
- [ ] Add `has_audio_stream(path: str) -> bool`.
- [ ] Add `validate_video_file(path: str) -> None` that raises clear exceptions.
- [ ] Refactor `clip_generator.py` to use these helpers.
- [ ] Ensure all subprocess calls pass argument lists, not shell strings.

### Task 3: Implement File Utilities

**Files:**
- Modify: `backend/app/utils/file_utils.py`

- [ ] Add `safe_slug(value: str, fallback: str = "video") -> str`.
- [ ] Add `ensure_dir(path: str | Path) -> Path`.
- [ ] Add `unique_path(directory: str | Path, stem: str, suffix: str) -> Path`.
- [ ] Add `create_job_workspace(output_root: str, job_id: str | None = None) -> Path`.
- [ ] Add `cleanup_path(path: str | Path) -> None` with defensive path checks.
- [ ] Ensure generated filenames are stable, ASCII-safe, and short enough for Windows and Linux.

### Task 4: Implement Video Downloader

**Files:**
- Modify: `backend/app/services/video_downloader.py`
- Modify: `backend/app/config.py`

- [ ] Implement `is_url(source: str) -> bool`.
- [ ] Implement `download_video(url: str, output_dir: str, cookies_path: str | None = None) -> dict`.
- [ ] Use `yt-dlp` Python API or subprocess with JSON metadata capture.
- [ ] Save source videos as `.mp4` where possible.
- [ ] Return title, uploader, duration, webpage URL, local path, and original metadata.
- [ ] Support optional YouTube cookies via `settings.youtube_cookies_path`.
- [ ] Reject playlists by default.
- [ ] Add max duration validation using `settings.max_video_duration_minutes`.

### Task 5: Implement Transcriber

**Files:**
- Modify: `backend/app/services/transcriber.py`
- Modify: `backend/app/config.py`

- [ ] Implement lazy loading for Faster-Whisper model using:
  - `settings.whisper_model_size`
  - `settings.whisper_device`
  - `settings.whisper_compute_type`
- [ ] Implement `transcribe_video(video_path: str) -> dict`.
- [ ] Return normalized shape:
  - `text`
  - `language`
  - `duration`
  - `segments`
  - `words`
- [ ] Preserve word-level timestamps where available.
- [ ] Add graceful error messages for missing audio, unsupported formats, and model load failures.
- [ ] Add an option to run with a smaller model for local smoke tests.

### Task 6: Harden Highlight Detection

**Files:**
- Modify: `backend/app/services/highlight_detector.py`

- [ ] Split prompt construction, API call, JSON extraction, and validation into separate functions.
- [ ] Accept the normalized `TranscriptResult` schema from Task 1.
- [ ] Implement `validate_highlights(raw: dict, video_duration: float, requested_clips: int) -> list[HighlightCandidate]`.
- [ ] Clamp tiny timestamp overflows only when safe, otherwise reject the candidate.
- [ ] Reject clips outside configured min/max duration.
- [ ] Sort by model rank, then remove overlapping clips.
- [ ] Add deterministic fallback highlights when Gemini is unavailable:
  - pick transcript-dense windows from the middle of the video
  - mark fallback metadata clearly
- [ ] Do not require Gemini for local smoke tests.

### Task 7: Harden Clip Extraction

**Files:**
- Modify: `backend/app/services/clip_generator.py`

- [ ] Validate input video exists and is probeable before extraction.
- [ ] Validate every clip window before calling FFmpeg.
- [ ] Use `safe_slug` and `unique_path` for output filenames.
- [ ] Preserve audio when available.
- [ ] Emit clip metadata including file size, resolution, duration, and source timestamps.
- [ ] Add optional thumbnail generation using FFmpeg at the first safe frame.
- [ ] Keep extraction independent of subtitles and smart crop.

### Task 8: Fix Smart Crop for Production Use

**Files:**
- Modify: `backend/app/services/smart_crop.py`

- [ ] Replace `output_width = 9` and `output_height = 16` with real output dimensions, default `1080x1920`.
- [ ] Keep the aspect ratio constant at `9:16`.
- [ ] Reuse MediaPipe face detector instead of creating a new detector for every frame.
- [ ] Fix scene detection assumptions so PySceneDetect scene objects are handled correctly.
- [ ] Add a fast fallback mode:
  - center crop when one face cannot be detected reliably
  - blurred background layout when source cannot be cropped cleanly
- [ ] Preserve audio in the final output.
- [ ] Add progress callback support without requiring Celery.

### Task 9: Align Subtitle Burner with Transcriber

**Files:**
- Modify: `backend/app/services/subtitle_burner.py`

- [ ] Accept the normalized `TranscriptResult` from Task 1.
- [ ] Escape subtitle paths safely for FFmpeg on Windows and Linux.
- [ ] Generate SRT per clip from absolute transcript word timestamps.
- [ ] Add subtitle style presets:
  - `clean`
  - `bold`
  - `caption-box`
- [ ] Return metadata for generated `.srt` and final video path.
- [ ] Make subtitle burning optional in the pipeline.

### Task 10: Implement Storage Interface

**Files:**
- Modify: `backend/app/services/storage.py`
- Modify: `backend/app/config.py`

- [ ] Implement `StorageBackend` protocol or small class interface.
- [ ] Implement local storage:
  - `save_file`
  - `delete_file`
  - `public_url`
  - `exists`
- [ ] Implement S3/R2 storage with `boto3` only when credentials are present.
- [ ] Use local storage as the default for development.
- [ ] Keep path keys predictable:
  - `sources/{job_id}/source.mp4`
  - `clips/{job_id}/{clip_id}.mp4`
  - `thumbs/{job_id}/{clip_id}.jpg`
- [ ] Do not expose local absolute paths as public URLs outside development mode.

### Task 11: Add Processing Pipeline

**Files:**
- Create: `backend/app/services/processing_pipeline.py`

- [ ] Implement `process_video_source(...)`.
- [ ] Detect source type:
  - existing local file
  - HTTP/HTTPS video URL
  - YouTube URL
- [ ] Create a per-job workspace under `/app/media/work/{job_id}`.
- [ ] Run the flow:
  - download/copy source
  - probe video
  - transcribe
  - detect highlights
  - extract clips
  - optional smart crop
  - optional subtitles
  - store outputs
  - return structured result
- [ ] Collect recoverable errors per clip without failing the whole job where possible.
- [ ] Fail fast for missing source, invalid media, or empty transcript.
- [ ] Keep this module synchronous and DB-free. Celery calls it through a thin worker task.

### Task 11.5: Add Celery Task Adapter

**Files:**
- Modify: `backend/app/workers/celery_app.py`
- Modify: `backend/app/workers/tasks.py`
- Modify: `backend/Dockerfile.worker`

- [ ] Configure Celery with JSON serialization.
- [ ] Enable `task_acks_late`, worker lost rejection, and conservative prefetching.
- [ ] Set soft/hard task time limits for long video jobs.
- [ ] Add `clipforge.process_video` task that calls `process_video_source`.
- [ ] Keep task return data JSON-serializable.
- [ ] Keep database job status updates out of Phase 2; that belongs to Phase 3/4.

### Task 12: Add Developer Smoke Scripts

**Files:**
- Create: `scripts/process_local_video.py`
- Create: `scripts/process_youtube_url.py`

- [ ] `process_local_video.py` accepts:
  - `--input`
  - `--output-root`
  - `--clips`
  - `--no-smart-crop`
  - `--no-subtitles`
- [ ] `process_youtube_url.py` accepts:
  - `--url`
  - `--output-root`
  - `--clips`
  - `--cookies`
- [ ] Print final `PipelineResult` as JSON.
- [ ] Exit non-zero on fatal pipeline errors.

### Task 13: Add Tests

**Files:**
- Create: `backend/tests/...`
- Modify: `backend/requirements.txt` if pytest is missing

- [ ] Add `pytest`.
- [ ] Unit test `safe_slug`, `unique_path`, and workspace creation.
- [ ] Unit test FFmpeg command construction with mocks.
- [ ] Unit test highlight validation:
  - valid clips
  - invalid JSON
  - overlaps
  - too short/too long
  - out-of-bounds timestamps
- [ ] Unit test transcript normalization using mocked Faster-Whisper segment objects.
- [ ] Unit test pipeline orchestration with all external services mocked.
- [ ] Avoid large binary fixtures in git. Use generated tiny test videos only if needed.

### Task 14: Docker and Runtime Verification

**Files:**
- Modify: `backend/Dockerfile`
- Modify: `backend/Dockerfile.worker`
- Possibly modify: `.env.example`

- [ ] Verify FFmpeg is available in backend and worker containers.
- [ ] Verify `ffprobe` is available in backend and worker containers.
- [ ] Verify OpenCV imports in the container.
- [ ] Verify Faster-Whisper can import in the container.
- [ ] Decide whether `torch==2.11.*` is valid for the current Python/runtime. If not, pin a known working version.
- [ ] Add `.env.example` entries for:
  - `WHISPER_MODEL_SIZE`
  - `WHISPER_DEVICE`
  - `WHISPER_COMPUTE_TYPE`
  - `GEMINI_MODEL_NAME`
  - `YOUTUBE_COOKIES_PATH`
  - `LOCAL_MEDIA_ROOT`
  - `SMART_CROP_ENABLED`
  - `SUBTITLES_ENABLED`

### Task 15: Final Phase 2 Smoke Test

- [ ] Run backend unit tests.
- [ ] Run a local processing smoke test with Gemini disabled.
- [ ] Run a local processing smoke test with Gemini enabled if `GEMINI_API_KEY` is configured.
- [ ] Run a YouTube download smoke test only with a short, safe test video.
- [ ] Confirm outputs exist:
  - source video
  - extracted clips
  - optional vertical clips
  - optional subtitles
  - result JSON
- [ ] Confirm `docker compose build backend worker` completes.
- [ ] Confirm `docker compose up backend worker redis postgres` starts without worker crash.

---

## Recommended Implementation Order

1. Schemas, file utils, and FFmpeg utils.
2. Downloader and transcriber.
3. Highlight validation and fallback behavior.
4. Clip extraction hardening.
5. Storage interface.
6. Pipeline orchestration.
7. Subtitle and smart-crop hardening.
8. Smoke scripts and tests.
9. Docker verification.

This order keeps the first working vertical slice small: local file -> transcript -> validated windows -> clips. You can then turn on Gemini, smart crop, subtitles, and YouTube download one at a time.

---

## Known Risks

- `mediapipe`, `torch`, `ultralytics`, and Faster-Whisper can make the Docker image large and slow to build.
- `smart_crop.py` currently outputs `9x16` pixels, not a usable `1080x1920` video.
- `ffmpeg-python` is included for compatibility with the master plan, but Phase 2 services currently prefer subprocess argument lists for predictable FFmpeg execution and easier validation.
- Gemini output is not safe to feed directly into FFmpeg until timestamps are validated.
- YouTube downloading can fail without cookies, depending on the source video.
- Windows path quoting for FFmpeg subtitle filters needs explicit care.
- The Celery task adapter exists in Phase 2, but database-backed progress/status orchestration still belongs to Phase 3/4.

---

## Definition of Done

Phase 2 is complete when the backend can produce a folder of finished clip files from a local source video with one command, and all external services can be disabled or mocked for repeatable local development. The result should be ready for Phase 3 database/API integration and Phase 4 Celery job orchestration.
