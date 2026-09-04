# Frontend/backend verification — 2026-09-04

Tracked in Notion: **Verify and harden frontend–backend integration and performance** (`3d1c7071-a198-81bf-8d05-c3434bb6cf91`). Production deployment remains separately tracked by CF053.

## Implemented

- Atomic PostgreSQL credit reservation and refunds; whole-batch validation before mutation; persisted queue identity before publish. Publish failures cannot reset a running worker or refund already-claimed work.
- Row-locked cancellation and terminal-state checks prevent double refunds and late result publication. Duplicate deliveries cannot clear an active worker's flag.
- Status polling reads persisted progress without synchronous Redis result queries. DNS/upload validation and broker calls run outside the async event loop.
- Alembic migration `20260904_0001` adds the missing `brand_kits.hide_platform_badge` column. Integration fixtures now run actual migrations, not `create_all`, and compare model columns against the migrated schema.
- Persisted language, subtitle preset and brand options reach processing. Framing uses even dimensions and the selected aspect ratio without upscaling; logo opacity/position and subtitle colors/font/background are rendered. Badge removal requires the server-side Agency entitlement. Logo storage references must belong to the job owner.
- Framing and raster overlays share one encoding pass; already-matching unbranded frames skip it. Captions are applied after framing. Final file size/resolution reflect the actual output.
- Concatenated highlight segments retain their source windows; caption timings map onto the concatenated timeline and exclude discarded gaps. SRT rounding correctly carries milliseconds into seconds.
- Empty extraction and subtitle encoder failures fail the job instead of claiming successful output.

## Repeatable checks

Verified locally: **131 backend tests**, **101 frontend tests**, frontend TypeScript check and Biome check, basic Ruff correctness/import checks, and **Chromium + Firefox** integration flows. Real PostgreSQL coverage includes upgrading/downgrading/re-upgrading the badge migration while preserving existing brand data. Browser runs reported no page-level JavaScript errors; screenshots were visually inspected for mobile layout.

Use only disposable local infrastructure. Never point these scripts at a production database, Redis instance or account.

1. Start PostgreSQL and Redis on loopback. Create an empty UTF-8 database named exactly `sneepcut_integration_test`. Install backend requirements and FFmpeg in an isolated environment.
2. Set `SNEEPCUT_TEST_DATABASE_URL` to that PostgreSQL URL. Optionally set `SNEEPCUT_FFMPEG_BINARY` to the actual FFmpeg executable (otherwise PATH is used). Run `python -m pytest backend/tests -q` from the repository root. Database tests create and drop only UUID-named schemas. Without these prerequisites, integration/encoder tests skip, which is **not** equivalent to the complete run.
3. In `frontend`, run `npm test`, `npm run check`, and `npx tsc --noEmit`.
4. To run browser integration, migrate the disposable database's public schema with `alembic upgrade head` from `backend`, then start the API with local `DATABASE_URL`, `REDIS_URL`, `INTERNAL_API_KEY` and `APP_ENV=development`. Start Next development on `localhost:3001`, with matching `AUTH_URL`, `NEXTAUTH_URL`, `APP_URL`, auth secrets, database/Redis URLs, `BACKEND_URL` and the same internal API key. Do not weaken production HTTPS checks. Leave paid-provider credentials empty and do **not** start a Celery consumer for this browser suite.
5. Set `SNEEPCUT_BROWSER_EMAIL` to a unique `@example.invalid` address, `SNEEPCUT_BROWSER_PASSWORD` to a test-only password, and `SNEEPCUT_BROWSER_MUTATIONS=allow-synthetic-account`. Run `node scripts/seed-browser-integration.mjs` once; it creates, never overwrites, the account. Use only an isolated database.
6. Install Playwright and its Chromium/Firefox browsers in a temporary tool directory. Set `SNEEPCUT_PLAYWRIGHT_MODULE` to its absolute `playwright/index.mjs` path and `PLAYWRIGHT_BROWSERS_PATH` as appropriate. Run `node scripts/test-browser-integration.mjs`. Default origin is `http://localhost:3001`; screenshots go to ignored `test-results/integration`.

The browser suite checks credentials sign-in, profile persistence in a separate page, actual frontend→API→PostgreSQL→Redis queueing, persisted polling, cancellation and single refund, localized pages, and horizontal layout at 390/768/1440px. It does not download/process the synthetic YouTube URL. Repeated runs can correctly hit the account's rate limit; use a new synthetic account or wait for its reset. Tests use real UI state transitions before typing to avoid hydration/navigation races.

## Performance measurements

`backend/scripts/benchmark_job_polling.py` accepts only loopback HTTP and sends 100 requests at concurrency 8 after warm-up. Set `SNEEPCUT_BENCHMARK_INTERNAL_KEY`, and pass synthetic `--user-id` / `--job-id` UUIDs.

Two local runs while development/browser activity was present returned zero errors: median 131.77–242.08 ms, P95 398.58–630.49 ms, throughput 26.93–44.77 requests/s. These are noisy workstation observations, not production capacity or an SLA. The concrete optimization is removing synchronous Redis status reads, not a claimed production speedup against an unmeasured baseline.

## Deployment and remaining boundaries

- Run the new migration before deploying the API/worker and frontend that access the badge column. Back up production first; this session modified no production data.
- Real FFmpeg tests cover aspect ratios, logo ownership/placement in all four corners, and rendering with/without the platform badge. AI/highlight selection and pipeline orchestration use controlled test boundaries; full Whisper/Gemini/YOLO processing on representative customer videos remains a staging acceptance test.
- Stripe, OAuth, object storage/CDN, email, publishing providers and HTTPS production topology require their configured staging/production environment. No live payments, publishing, paid AI calls or production deployment were performed.
- No claim of absolute reliability or maximum production performance is made. Load-test on representative hardware/video durations and watch CPU/GPU, memory, DB pool and queue depth before setting concurrency.
- Queue publication is not a transactional outbox. A process crash between DB commit and publishing can leave a pending job. A hard-killed worker can leave active state; duplicate suppression intentionally will not start concurrent processing. Such jobs can be cancelled/refunded and recreated. Automated crash recovery requires a separately designed outbox/lease/fencing mechanism and fault-injection testing; this change does not claim that guarantee.
- Smart-crop failures retain the existing center-crop fallback. Fonts must be installed on workers; FFmpeg may substitute unavailable fonts. Intro/outro media and the generic brand palette are not newly implemented rendering effects.
