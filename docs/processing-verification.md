# Real processing verification

Build the development worker image, then run from the repository root:

```powershell
docker compose -f docker-compose.yml -f docker-compose.dev.yml build worker
node scripts/test-processing-e2e.mjs C:/absolute/path/to/synthetic-speech.wav
```

Use a synthetic English speech recording of roughly 30–60 seconds. The runner
creates an 18-second, 2-fps test-pattern video with that audio, disposable PostgreSQL and Redis
containers, a Go API, and an unprivileged Celery worker. It uses only the
`sneepcut_integration_test` database and a generated `.cache/` media directory.
It never reads the project's `.env` or mounts persistent application volumes.
Docker and Node.js 22+ are required, together with the `sneepcut-go-dev`,
`sneepcut-ml-dev`, `postgres:16-alpine`, and `redis:7-alpine` images.

The test exercises registration/login, signed upload, job creation, durable
dispatch, real Whisper transcription, highlight selection, real YOLO smart
crop, subtitle rendering, persisted completion, and signed media authorization.
It checks portrait H.264 output with audio and decodes the complete result with
FFmpeg. Smart-crop failures cannot count as a passing test. Logs, the generated
media, and a JSON report remain in the printed `.cache/` directory; disposable
containers and their database are removed at the end.

Model downloads require Internet access. Without a configured Gemini or
OpenRouter key in the runner's environment, highlight selection uses the
application's local fallback. To test cloud selection too, explicitly authorize
provider use and supply `AI_PROVIDER` plus its key/model variables; this sends
the synthetic transcript to that provider and can incur API charges. The test
rejects a provider failure that falls back to local selection.
The runner does not test browser interaction, YouTube downloads, social publishing,
or production storage providers. Its low frame rate keeps real model inference
bounded on developer machines; it is not a processing-speed benchmark.

The cache regression tests are:

```bash
python -m pytest backend/tests/services/test_smart_crop_cache.py backend/tests/services/test_processing_pipeline.py -q
```

Hugging Face's default cache is under the worker's home directory. The ML
Dockerfile transfers ownership after dependency installation, which may create
root-owned cache directories. YOLO weights use `XDG_CACHE_HOME` (or
`~/.cache`) instead of the application's working directory.

Transcription emits progress as Whisper yields timestamped segments, moving the
job from 20% toward 49% before analysis starts. Model loading and initial audio
decoding occur before the first segment and can still take time. Logs also record
the transcription percentage. Callback errors propagate so cancellation and lost
job ownership stop segment consumption.

`WHISPER_CPU_THREADS` defaults to 2 to match the default worker CPU allocation.
`WORKER_SOFT_TIME_LIMIT` defaults to 7200 seconds for the entire job, with a hard
limit of 7500 seconds (`WORKER_TIME_LIMIT`) to allow failure handling and cleanup.
Both are configurable; the hard limit must exceed the soft limit. These are
runtime bounds, not a guarantee that every accepted video fits the available CPU.
Restart workers after changing these settings; already-running tasks retain their
old limits. A soft timeout now produces an explicit failure message.

Run the affected regression checks with:

```bash
python -m pytest backend/tests/services/test_transcriber_options.py backend/tests/services/test_transcription_progress.py backend/tests/services/test_processing_pipeline.py backend/tests/test_worker_time_limits.py -q
```
