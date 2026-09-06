# Remaining Python register

Audited against current source and Compose configuration on 2026-09-06. The
application HTTP implementation now runs in Go. Python remains for video
processing, durable queue delivery and schema migrations. The user reserved the
final retention/removal decision; no Python files were removed and migration
ownership has not transferred.

## Processes and images

| Compose service | Current process | Runtime role |
| --- | --- | --- |
| `backend-go` | Native Go API, enabled by default | Application APIs, authentication, uploads, signed-media authorization, billing and account operations. Nginx `/api/` and `/v1/auth/` route here. |
| `worker` | `celery -A app.workers.celery_app:celery_app worker` | `sneepcut-ml`, Python target `ml`; processing, trim and recut. Shares `media_data` with Go and Nginx for local storage. |
| `job-dispatcher` | `python -m app.services.job_delivery` | `sneepcut-api`, target `api`; job/edit outbox publication and expired-work recovery. No HTTP server or media mount. |
| `migrate` | `alembic upgrade head` | `sneepcut-api`, target `api`; one-shot dependency of Go and workers. Alembic remains the sole schema writer. |
| `backend` | `uvicorn app.main:app ...` | `sneepcut-api`, target `api`; excluded by default behind `legacy-python-api`. Retained for rollback investigation. |

The `api` image's Uvicorn default command is overridden for the dispatcher and
migrator. Both Python targets still include the complete `app/` and Alembic trees
and install shared `requirements-api.txt`; minimizing images is separate work.
Development Compose mounts current worker `app/` source, but dispatcher and
migrator use built image source and need rebuilding after relevant changes.

Enabling `legacy-python-api` starts the old server; it does not switch Nginx or
restore removed Next.js backend handlers and the former authentication contract.
A complete rollback needs a compatible application revision and routing plan.
Retained source does not establish that full rollback was exercised.

Sources: [default Compose](../../docker-compose.yml),
[development Compose](../../docker-compose.dev.yml),
[Python Dockerfile](../../backend/Dockerfile),
[Nginx routing](../../nginx/nginx.conf).

## Retained source and transitive imports

Paths below are relative to `backend/`; bare service filenames are under
`app/services/`.

| Source | Current responsibility and dependency boundary |
| --- | --- |
| `app/workers/celery_app.py`, `app/workers/tasks.py` | Celery registration; process/trim/recut execution; PostgreSQL progress, results and refunds; account-deletion guards; job/edit ownership fencing. |
| `job_delivery.py`, `edit_delivery.py` | Outbox publication, broker retries, execution lease recovery and edit expiry. Imports task objects to publish through Celery; does not execute the media pipeline. |
| `processing_pipeline.py`, `video_downloader.py` | Source retrieval, pipeline stages, rendering options, durable source/output keys and metadata. Downloader uses lazy `yt_dlp` plus FFmpeg/ffprobe. |
| `transcriber.py` | Lazy `faster_whisper` model initialization; transcription and word/segment timestamps. |
| `highlight_detector.py` | Worker-side Gemini highlight selection and validation, independent of the retired script/assistant services. Uses `google.genai` when configured; missing/failed Gemini responses fall back to deterministic selection. |
| `smart_crop.py` | OpenCV/NumPy framing, scene detection, MediaPipe faces and YOLO person fallback. Lazy `scenedetect`, `mediapipe` and `ultralytics` imports; used for requested vertical smart crop. |
| `clip_generator.py`, `transitions.py`, `subtitle_burner.py`, `output_rendering.py` | FFmpeg assembly, transitions, captions, aspect ratio and raster branding. Pillow renders overlays; font lookup optionally uses `fc-match`. Reordered plain cuts preserve the editor's output order. |
| `storage.py` | Local/S3 source retrieval, output writes and cleanup; lazy `boto3` for S3. Workers persist durable keys; Go creates presentation URLs and authorizes local reads. |
| `app/utils/ffmpeg_utils.py`, `app/utils/file_utils.py`; `app/schemas/processing.py` | Media subprocess/file helpers and worker data contracts. |
| `app/config.py`, `app/database.py`, `app/models/*` | Shared settings, engines and ORM mappings. Workers directly use user, job, clip, brand, deletion-request and job/edit-delivery models. The model initializer also loads billing checkout claims, chat, scheduled-post and Stripe-event mappings. |
| `app/schemas/__init__.py`, `app/schemas/clip.py`, `app/schemas/job.py`, `app/schemas/user.py` | Importing the processing schema executes the schema package initializer, loading these other schemas. Retiring HTTP routes alone does not make them removable. |
| `alembic/*`, `alembic.ini` | Existing schema history and model metadata. Head `20260906_0002` includes durable edit delivery and email-activation compatibility. The Go migrations directory contains ownership notes, no executable replacement. |

The AST audit included function-local imports and package initializers. An
offline `sneepcut-api` import check loaded both delivery modules and task
declarations successfully without OpenCV, NumPy, Pillow, Whisper, YOLO,
MediaPipe or yt-dlp. Media execution loads these dependencies later, allowing
the dispatcher to use the smaller image.

`app/database.py` creates synchronous and asynchronous engines at import time.
Both `psycopg2` and **`asyncpg` remain required** even for synchronous workers and
dispatcher until that module is separated. Removing ORM classes also requires
checking package initialization, relationships and Alembic metadata.

These files remain on disk outside the worker/dispatcher execution path:

| Source | Current disposition |
| --- | --- |
| `app/main.py`, `app/api/*` | Superseded HTTP handlers/middleware, retained under the legacy profile. Includes the old upload-token verifier in `app/api/upload.py`. |
| `script_generator.py`, `assistant.py`; `app/schemas/script.py`, `app/schemas/assistant.py` | Superseded application AI services. Go owns these APIs; workers do not import them. |
| `upload_scanner.py`, `app/utils/signed_url.py` | Legacy upload/signature helpers retained for old routes and parity tests. Current upload/ClamAV and media-authorization clients run in Go. |
| `social_poster.py` | Unwired Upload-Post helper; no current application producer/worker invokes it. Calendar records do not establish automatic publication. Keep/remove is a feature decision. |
| `tests/*`, `scripts/*` | Worker regressions, API parity/rollback tests, polling/read benchmarks and scanner verification. Review tests by responsibility before retiring old HTTP coverage. |

Celery also registers `sneepcut.process_video`, `sneepcut.placeholder` and
`sneepcut.health`. No current application producer was found for the standalone
processing/placeholder tasks. Their removal needs a queue/caller review; they
are not separate services.

## Queue, database and storage contracts

Go commits charged jobs with `job_deliveries`, and clip-edit reservations with
`edit_deliveries`, transactionally. Python publishes JSON payloads under
`sneepcut.process_job`, `sneepcut.trim_clip` and `sneepcut.recut_clip`. The
dispatcher polls every 10 seconds and spaces publication retries by 60 seconds.
A broker acknowledgement does not establish a worker claim.

Job claims rotate database tokens and renew a 180-second lease with a
30-second heartbeat. Expired work is replayed up to three executions; exhausted
work fails and refunds credits. Edit claims rotate reservation tokens and have
a one-hour deadline. Claimed edits are not automatically replayed after worker
loss: expiry releases the reservation for a user retry. Ownership checks prevent
stale work from replacing a newer result. PostgreSQL controls API polling and
completion; Redis supplies the Celery broker/result backend.

Workers read account/brand/deletion state and write job status, clips,
transcripts, storage references, delivery state and failure refunds. These remain
shared application-data writes while Alembic alone owns schema changes. Go-only
orchestration would need an explicit completion protocol preserving fencing and
refund rules, or would need to move those writes into Go.

Inputs use `uploads/<user-id>/<file>` keys. Processing uses per-attempt
`sources/<job-id>/attempts/<token>/`, `clips/<job-id>/attempts/<token>/` and local
`work/<job-id>/attempts/<token>/` paths. Edits use per-clip/token prefixes under
`clips/<job-id>/edits/` and `work/<job-id>/edits/`. Cleanup must preserve these
ownership boundaries. S3 output still requires local rendering workspace.

## Operational dependencies

- PostgreSQL with the Alembic schema; Redis for Celery. Python uses
  `DATABASE_URL` and `REDIS_URL`, with optional `CELERY_BROKER_URL` and
  `CELERY_BACKEND_URL` overrides.
- Python 3.11; SQLAlchemy/Pydantic/Celery plus `requirements-ml.txt` media
  dependencies. The Dockerfile installs CPU-only Torch/Torchvision. NumPy and
  other inference dependencies arrive transitively. Version ranges are not a
  complete reproducible dependency lockfile.
- FFmpeg/ffprobe, H.264/AAC encoding, subtitle/font support, Pillow and video
  system libraries. `ffmpeg-python` remains installed although the audited code
  invokes the CLI directly. Pruning FastAPI/Uvicorn/SlowAPI from shared runtime
  requirements depends on the legacy-image decision.
- Whisper defaults to `base`, CPU and `int8`; smart crop uses `yolov8n.pt`,
  MediaPipe and scene detection. Provision model downloads, writable cache/weight
  paths and fonts before a production ML check. Compose declares no dedicated
  model-cache volume or GPU reservation; models initialize on demand.
- `GEMINI_API_KEY`/`GEMINI_MODEL_NAME` enable provider highlights. Remote source
  downloads need network access and may need a mounted `YOUTUBE_COOKIES_PATH`.
  The deterministic smoke does not establish live provider/source availability.
- Local storage uses shared `LOCAL_MEDIA_ROOT`/`media_data`. S3 needs compatible
  `AWS_*` endpoint, bucket and credentials in Go and workers. Audited workers
  need storage/provider credentials, but not browser JWT, Stripe or mail
  credentials. Compose currently loads a common `.env` into Python services;
  scoping credentials is possible follow-up work when separating configuration.
- Worker defaults: two Celery processes, two CPUs, 6 GB, 50 tasks per child,
  adjustable through `WORKER_*`; late acknowledgements, reject-on-worker-loss,
  prefetch 1 and 1,800/2,100-second soft/hard task limits. ClamAV is a separate
  Go-upload dependency supplied by the Compose `security` profile.

## Verified worker boundary

From the repository root, with Docker, Go and cached `postgres:16-alpine`,
`redis:7-alpine` and `sneepcut-ml` images:

```sh
# Build first only if the worker image is missing/outdated.
docker build --target ml -t sneepcut-ml backend
python3 backend-go/scripts/test-worker-integration.py --report /tmp/sneepcut-worker-report.json
```

`SNEEPCUT_ML_IMAGE` can select a compatible image. The runner mounts current
application/migration source read-only and creates disposable PostgreSQL
(`sneepcut_integration_test`), Redis, a synthetic account and media. It never
reads project `.env` or uses persistent development data. It removes its
containers/network/media on success or failure. The worker has no Internet
egress; transcription/highlight outputs alone are deterministic fixtures.

On 2026-09-06 all nine grouped scenarios passed: signed upload; broker outage,
retry and duplicate-job fencing; real framed/captioned output and thumbnails;
trim cleanup and duplicate-edit fencing; failed recut retaining old media and
successful reordered retry; expired edits; injected AI-stage failure/refund;
pending/active cancellation; and hard worker death with lease recovery. FFprobe
and full FFmpeg decode verified an 8.011-second 180×180 H.264/audio clip and
four-second trim/recut outputs. Credits went from 1,000 to 980 for exactly two
successful ten-credit jobs. Fixture resource cleanup was confirmed.

The ordered-recut correction passed 29 focused Python tests across
`test_clip_generator.py`, `test_transitions.py`, `test_segment_subtitles.py` and
`test_recut_source.py`; Ruff and syntax checks passed for changed worker/test/
smoke files. This verifies local protocol/rendering behavior. Live Whisper model
loading, Gemini, smart crop, remote downloads, S3/R2 and production performance
remain outside that smoke's coverage.

The retained bridge also passed **38 PostgreSQL regressions** from
`tests/test_edit_delivery.py` and `tests/test_job_integration.py` in the Python API
image with current source and a fresh `sneepcut_integration_test` container.
Every test used a newly migrated schema; none skipped. The fixture was removed.

## Decisions still needed

| Option | Result and follow-up scope |
| --- | --- |
| Keep Python processing and delivery | Preserve the verified bridge; separate runtime dependencies, scope credentials and provision models/cache. Lowest immediate replacement scope. |
| Keep Python media execution; move delivery/state to Go | Replace dispatcher, leases/refunds and completion writes with a documented Go-owned protocol. Preserve Python inference/rendering; repeat crash, duplicate, cancellation and edit-fencing tests across the new boundary. |
| Replace all Python processing | Choose native runtimes or services for transcription, tracking, highlights and media orchestration; port FFmpeg/storage behavior and acceptance tests. Additional implementation and provider/runtime evaluation are required. |

Independently decide when to remove the legacy HTTP source/profile and unwired
social helper, and whether schema ownership stays with Alembic or transfers to
a Go tool at an agreed baseline. **Alembic remains the sole schema writer until
that explicit decision.** Keeping workers does not require keeping Python HTTP;
removing HTTP does not eliminate shared model/database/schema dependencies.
No final decision or live migration action is implied by this inventory.
