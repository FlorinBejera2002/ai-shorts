# Backend migration to Go

Status: Step 0 complete; Sneepcut feature migration has not started.
Source review: 2026-09-06. Update this document as each step is implemented and verified.

## Scope and sources

The new `backend-go/` starts from the reusable base in
`/Users/tristan/GolandProjects/xstairs_api`. The previous Go implementation in this
repository is removed; it is not the foundation or a completed migration step.

The requirements below come from the **current Python backend and Next.js server
code**, not the removed Go experiment. A complete backend migration must account
for both: several business features currently access PostgreSQL directly from
Next.js. Existing code and tests establish behavior; older migration reports are
historical evidence, not acceptance results for the new Go implementation.

Primary sources:

- [Python route registration](../../backend/app/api/router.py),
  [request/response schemas](../../backend/app/schemas/), and
  [models](../../backend/app/models/).
- [Python API routes](../../backend/app/api/),
  [services](../../backend/app/services/), and
  [Celery tasks](../../backend/app/workers/tasks.py).
- [Next.js API routes](../../frontend/src/app/api/),
  [backend HTTP client](../../frontend/src/lib/api.ts),
  [Auth.js configuration](../../frontend/src/lib/auth.ts), and
  [Prisma schema](../../frontend/prisma/schema.prisma).
- [Alembic migrations](../../backend/alembic/versions/),
  [Compose services](../../docker-compose.yml), and
  [Nginx routing](../../nginx/nginx.conf).

This preparation does not change the running Python backend, switch frontend
traffic, run database migrations, or implement Sneepcut features in Go.

## Foundation retained from the example

The first pass interprets “base and structure” as server infrastructure. See
[backend-go/README.md](../../backend-go/README.md) for the concrete package tree,
commands and retained/removed pieces. The example's reusable authentication and
account flows can be retained/adapted if requested; that choice is still open.
They are not wired into this health-only scaffold or counted as migrated features.

The example's `net/http`/`httprouter` server, `slog` logging, graceful shutdown,
JSON helpers, validator and `database/sql`/`lib/pq` pool approach are retained.
Startup lives in `cmd/api`; reusable infrastructure lives in focused `internal/`
packages, and health has its own feature package. Future jobs/clips/identity/etc.
packages own their handler, service, repository, types and colocated tests.
`internal/httpapi` composes routes; `internal/data` holds only shared DB plumbing.
Neither is a catch-all home for new business features. These boundaries are also
recorded in [backend-go/AGENTS.md](../../backend-go/AGENTS.md).

Removed example-specific pieces include its domain user/token models and SQL,
JWT issuer/audience, OAuth handlers, SMTP defaults and email templates, hardcoded
frontend/CORS origins, debug endpoint and CORS demo. No credentials, IDE state or
source repository history are imported. The foundation connects to no database,
worker, mail server or Python proxy at runtime.

Both `/v1/healthcheck` (example convention) and `/api/health` (stack health path)
report liveness with the example's `status: available` and `system_info` shape.
That is a foundation response, not the final Python health contract. Other routes
return JSON 404. The optional `go-api` Compose profile runs this standalone base;
Python remains the application upstream.

## Current runtime boundaries

```text
Browser -> Nginx -> Next.js routes / Auth.js / Prisma
                       |
                       +-> Python FastAPI -> PostgreSQL
                                  |              |
                                  |         job_deliveries
                                  |              |
                                  +-> Python dispatcher -> Redis / Celery
                                                              |
                                                       Python ML workers
                                                              |
                                                    local media or S3/R2

Browser direct upload -> Nginx -> Python upload endpoint
Browser signed media  -> Nginx -> Python authorization -> shared media volume
```

Changing `BACKEND_URL` affects only Next.js calls that use the backend client.
It does not migrate Prisma queries, browser upload authorization, Nginx direct
uploads, signed-media subrequests, or worker execution. Each boundary needs its
own tested transition.

## Python API inventory

All entries below still need Go implementation. Preserve paths, methods, status
codes, response wrappers, nullable fields, validation, and ownership rules unless
an intentional API change is agreed and its callers are updated together.

| Area | Current routes | Behavior to carry over | Source |
| --- | --- | --- | --- |
| Health | `GET /api/health` | Service liveness and version; add dependency readiness separately before rollout. | `backend/app/api/health.py` |
| Jobs | `GET, POST /api/jobs`; `GET /api/jobs/{job_id}`; `POST /api/jobs/{job_id}/cancel`; `POST /api/jobs/batch` | Owned list/read, source validation, atomic credits/job/outbox creation, persisted progress, batch creation, cancellation and single refund. | `backend/app/api/jobs.py`; `schemas/job.py` |
| Clips | `GET /api/clips`; `GET, DELETE /api/clips/{clip_id}` | Owned reads, fresh media URLs, clip/source metadata, deletion guarded against processing or editing, cleanup before deleting records. | `backend/app/api/clips.py`; `schemas/clip.py` |
| Editing | `POST /api/clips/{clip_id}/trim`; `POST /api/clips/{clip_id}/recut` | Validate durations and source segments, reserve an edit under a lock, dispatch a worker task, fence stale results and release failed reservations. | `backend/app/api/clips_edit.py`; `workers/tasks.py` |
| Video uploads | `POST /api/upload`; `PUT /api/upload/direct` | Authenticated multipart upload and single-use signed raw upload; bounded streaming, durable staging, format validation, malware scanning, cleanup on failure. | `backend/app/api/upload.py` |
| Media authorization | `GET /api/media/verify`; `GET /api/media/verify-request` | Verify expiring signatures; authorize Nginx's `X-Original-URI` subrequest with 204/403 and no media body. | `backend/app/api/media.py`; `utils/signed_url.py` |
| Brand logos | `GET, POST, DELETE /api/brand/logo` | Owned stable storage keys, fresh signed URLs, 5 MiB raster upload validation and scanning; allow cleanup of historical SVGs without accepting new SVGs. | `backend/app/api/brand.py` |
| Account media cleanup | `DELETE /api/account/media` | Require a durable deletion request and completed billing cancellation; wait for work to stop; delete owned objects/prefixes, retain DB records on cleanup failure, recheck active work. | `backend/app/api/account.py` |
| Script generation | `POST /api/scripts/generate` | Gemini prompt and structured scene validation, camera/transition normalization, provider errors; response contains `script` and `credits_charged` (currently zero). | `backend/app/api/scripts.py`; `services/script_generator.py`; `schemas/script.py` |
| Assistant | `POST /api/assistant/chat`; `GET, DELETE /api/assistant/history` | Create/editor context, owned clip/transcript context, validated suggested actions, persisted user/assistant messages, scoped history and deletion. | `backend/app/api/assistant.py`; `services/assistant.py`; `schemas/assistant.py` |

### Contract details that are easy to lose

- Single-job creation returns a job directly with 201. Listing returns
  `{ "jobs": [...] }`; polling returns `{ "job": ..., "celery_state": null,
  "celery_meta": null }`. Polling uses persisted PostgreSQL state and must not
  require Redis result lookups. Lists currently return the newest 100 jobs or
  200 clips; do not introduce a pagination envelope accidentally.
- Job sources are `upload`, `youtube`, `url`, or `local`. Exactly one URL/file
  source is required for the applicable type. Requests allow 1–15 clips,
  `9:16`, `1:1`, or `16:9`, and batches of 1–20 YouTube URLs. Carry defaults,
  language, subtitle style, branding, smart crop, subtitle burning, and user
  instructions through storage and worker dispatch.
- Current create routes charge `10 * num_clips_requested`; the cost helper also
  supports a duration component but these routes do not supply it. Reserve
  credits with a conditional update, not a read followed by an unconditional
  balance write. A batch validates all sources and commits the whole charge,
  all jobs, and all delivery records atomically.
- Preserve UUIDs and UTC timestamps. A missing value, JSON `null`, empty array,
  zero, and `false` can mean different things. For example, optional boolean
  request defaults cannot be implemented by blindly using Go zero values.
- FastAPI errors normally use `detail`, including structured 422 validation
  errors. Next.js adds some of its own response shapes. Freeze fixtures per
  endpoint before implementing them; the example application's error envelope
  is not automatically the Sneepcut contract.
- Trim returns 202 and `{ "task_id": ..., "status": "trimming" }`; recut returns
  202 with status `processing`. Trim lasts at least 3 seconds and at most the
  configured maximum (currently 60). Recut allows 1–10 non-overlapping source
  segments of at least 0.25 seconds each and at least 3 seconds total, retaining
  requested ordering. Use original source media for recuts.
- Assistant prompts use at most 20 prior messages; history reads return up to
  50 messages in chronological order. Responses are `{ "reply": ..., "actions":
  [...] }`; history is `{ "messages": [...] }`. Validate actions independently
  of the model response; an AI suggestion is not authorization to mutate data.
- Existing mutation limits include jobs 30/hour, batch 5/hour, video upload
  12/hour, trim/recut 20/hour, assistant chat 60/hour, logo upload 10/hour, and
  logo deletion 30/hour. Inspect `api/rate_limit.py` and Nginx together before
  choosing the Go identity key and shared limiter store.

## Backend behavior currently in Next.js

These are separate migration work items, not functionality already supplied by
FastAPI. Decide their destination before declaring the overall backend migrated.

| Area | Current entry points | Requirements |
| --- | --- | --- |
| Sign-in and identity | `/api/auth/[...nextauth]`; `frontend/src/lib/auth.ts` | Credentials and Google sign-in, Auth.js/Prisma identity mapping, JWT sessions, database-refreshed role/plan/credits, session-version invalidation, trusted-host configuration. |
| Registration and password recovery | `/api/auth/register`, `/api/auth/forgot-password`, `/api/auth/reset-password`, `/api/user/password` | Password hashing/limits, reset-token expiry and single use, email delivery, current-password checks, session invalidation, abuse limits. |
| Profile and credits | `GET, PATCH /api/user/profile`; `GET /api/user/credits`; server dashboard queries | Owned profile changes, persisted credits/entitlements, session freshness; include server-rendered Prisma readers when removing direct DB access. |
| Brand settings | `GET, PUT /api/user/brand`; `/api/user/brand/logo` | Palette, fonts, subtitle/watermark settings, Agency-only badge removal, validation and persistence; logo route coordinates Python storage with Prisma. |
| Clip metadata | `PATCH /api/clips/[id]`, augmented `GET` | Owned title/caption/hashtag edits, content-role checks and metadata returned alongside Python clip data. |
| Calendar | `GET, POST /api/calendar`; `PATCH, DELETE /api/calendar/[id]` | Owned scheduled-post records, clip ownership, platform/status/date validation and mutation limits. Actual scheduled publishing is not implemented merely by storing these records. |
| Billing | `/api/stripe/billing`, `/api/stripe/checkout`, `/api/stripe/portal`, `/api/webhooks/stripe` | Stripe signature verification, bounded raw webhook bodies, customer/subscription ownership, checkout claims/leases, ordered subscription state, idempotent events and credit grants, entitlements. |
| Data export and account deletion | `GET, DELETE /api/user/data` | Recent authentication, owned export, durable deletion marker, checkout/subscription cancellation and retry, stopping/refunding jobs, Python media cleanup, transactional account removal and stale-session rejection. |
| Upload intent | `POST /api/upload/authorize`; `frontend/src/lib/upload-intent.ts` | Signed upload claims bound to user, filename, size, content type, expiry and nonce; backend verification must remain byte-compatible. |
| Processing webhook | `/api/webhooks/processing` | Currently a placeholder response. Do not document it as implemented completion delivery or port it as a working webhook. |

`backend/app/services/social_poster.py` contains a provider helper, but no active
API route/worker scheduling flow was found calling it. Treat wiring real social
publishing as a separate feature decision rather than an existing parity claim.

## Data and migration requirements

PostgreSQL is shared by Python/SQLAlchemy, Next.js/Prisma, and the future Go API.
Keep existing data and the actual Alembic schema as the initial baseline.

| Tables | Fields and constraints that matter |
| --- | --- |
| `users` | UUID identity, unique email, provider identifiers, password hash, session version, DB-controlled `member`/`viewer` role, credits, plan, Stripe identifiers and ordered billing-state/generation fields. |
| `accounts`, `sessions`, `verification_tokens` | Auth.js schema, provider keys, token expiry and identity links. These are not the example project's user/token schema. |
| `jobs` | Owned source, render options, progress/status, charged credits, task identity, processing flag, edit count/token/deadline, transcript JSON, source storage references and timestamps. |
| `job_deliveries` | One durable dispatch record per job; JSONB payload, execution token, lease expiry, next dispatch time, dispatch/execution counts and last error. Present in SQLAlchemy/Alembic; currently absent from Prisma's model list. |
| `clips` | User/job ownership, source time windows/segments, score/captions, output and thumbnail references, subtitle/transcript metadata, composite `(id, user_id)` uniqueness. Source references also come from the parent job. |
| `brand_kits` | One per user; stable media references, palette/fonts/subtitles/watermarks, badge setting. |
| `chat_messages` | User/context/optional clip scoping, role, content/actions JSON and history indexes. |
| `scheduled_posts` | User, optional owned clip, platforms array, status, scheduled UTC time; composite owned-clip foreign key and indexes. |
| `stripe_events`, `billing_checkout_claims` | Unique event/credit-grant identities, checkout generation and leases; concurrency and retry semantics. |
| `account_deletion_requests` | Durable marker and billing progress/failure state. Deliberately survives until final account removal; do not add an automatic user-delete cascade. |

Use additive migrations while Python and Go coexist. Do not run the example's
`users`/`activation_tokens` migrations against Sneepcut: its integer IDs, columns,
password storage, and authentication model differ from the existing UUID schema.
Do not introduce competing Alembic, Prisma, and Go migration writers. Record the
exact handoff point and schema version when migration ownership changes.

## Workers, storage, and security requirements

### Durable processing

The active code already has a transactional outbox and execution leases. Preserve
the behavior in `services/job_delivery.py` and `workers/tasks.py`, regardless of
older documentation describing an earlier implementation without an outbox.

- Commit job, charged credits, task ID, and `job_deliveries.payload` together.
  Publish after the transaction. Broker failure leaves a durable pending job;
  it does not immediately refund it or erase the intent.
- Preserve lock ordering: Job before JobDelivery. Do not hold database locks
  while calling Redis or another external provider.
- Dispatcher currently reconciles every 10 seconds, defers redispatch for 60
  seconds, uses 180-second execution leases refreshed every 30 seconds, and
  allows at most three executions before failure/refund. Make later changes
  explicit and test them across worker versions.
- Duplicate deliveries must not run concurrently. Old execution tokens must
  not publish progress/results, clear another worker's flags, or delete another
  attempt's files. Keep attempt-scoped storage and cooperative cancellation.
- Cancellation locks the job and refunds only on the first nonterminal-to-
  cancelled transition. Completed/failed/cancelled requests are idempotent.
- Edits have separate one-hour reservations and fencing tokens. They currently
  dispatch directly through Celery rather than the job outbox. Preserve failed-
  dispatch rollback and deadline recovery; design a durable edit dispatch bridge
  explicitly before moving these endpoints to Go.

Python processing currently owns video download/probing, scene/transcript
analysis, faster-whisper, Gemini highlights, crop/framing, FFmpeg extraction and
transitions, subtitle timing/burning, brand rendering, thumbnails, persistent
outputs and cleanup. Relevant modules are `processing_pipeline`,
`video_downloader`, `transcriber`, `highlight_detector`, `smart_crop`,
`clip_generator`, `transitions`, `subtitle_burner`, and `output_rendering`.

### Upload and media boundary

- Authenticate before reading/spooling large request bodies. Current raw upload
  claims are HMAC-SHA256 over canonical base64url payloads, expire within ten
  minutes, and use a Redis `SET NX` nonce with TTL. A failed/disconnected upload
  still consumes its nonce; Redis failure must reject authorization.
- Enforce both declared and actual byte counts, allowed extensions/content
  types, and file signatures. Current maximum video size is 2 GiB. Stream into
  a private `.part` file, flush/sync, obtain a clean scan, then rename atomically.
  Reject quarantine paths as job inputs and remove partial files on failure.
- Production scanning must fail closed on malware, timeouts, scanner errors,
  malformed replies and unavailable ClamAV. Development opt-out must not bypass
  the production requirement. Retain bounded INSTREAM transfers and deadlines.
- Local paths/storage keys must stay within owned roots, reject traversal and
  symlink escapes, and keep sources until recut/account cleanup no longer needs
  them. Local storage and S3-compatible storage require separate tested adapters.
  Raw direct upload currently requires durable local filesystem storage; S3
  multipart/direct upload would be a new design, not existing parity.
- Signed local URLs use an expiring HMAC over `path:expires`, with a truncated
  hexadecimal signature. Retain canonical path/query handling and test Python/
  Go interoperability, expiry and tampering. Refresh read URLs from stable keys;
  an expired persisted URL is not the storage identity.
- Nginx serves `/media/` only after the authorization subrequest. Preserve byte
  ranges/video seeking, thumbnail access, upload streaming and body limits when
  its upstreams move to Go.

### Authentication and application safeguards

Current internal API identity is `X-Internal-API-Key` plus `X-User-Id` (UUID),
with a narrowly scoped development email fallback. An explicit missing/deleted
user ID never falls back to provisioning by email. Keep constant-time key checks,
per-request account-deletion checks, owned resource queries and DB-refreshed
roles. The media cleanup endpoint intentionally uses authentication separately
from the normal deletion-pending block so deletion can finish.

Before feature traffic reaches Go, add trusted-proxy/host rules, explicit CORS,
security headers, request/DB/provider timeouts, body limits, rate limiting and
structured logs that omit secrets and signed tokens. Large uploads and long AI
requests need their own timeout/body policies; do not reuse the example's small
JSON request limits indiscriminately.

## Decisions before implementation

| Decision | Proposed starting point | When needed |
| --- | --- | --- |
| Which example features to retain | Infrastructure-only in this pass. Confirm whether the example's registration/login, JWT refresh, password reset, activation, OAuth and mail flows should also be retained/adapted. | Before building identity/account features. |
| Meaning of “migrate the backend” | Move application APIs/business logic to Go in slices; retain Python for video/ML execution. A fully Python-free runtime is a separate, substantially larger project. | Before Step 1. |
| Authentication ownership | Keep Auth.js sessions/Google sign-in initially and let Go validate trusted internal identity; move auth into Go later only through an explicit session/schema migration. | Before identity implementation. |
| Next.js server responsibilities | Include business APIs and direct Prisma readers in the eventual Go scope; transition them separately from Python routes. | Before ordering those slices. |
| Database and schema history | Preserve existing PostgreSQL data and UUIDs; Alembic remains the sole schema writer during initial coexistence. Select a Go migration tool at the handoff, not by applying example migrations. | Before any domain SQL/migration. |
| Worker communication | Start with the existing PostgreSQL outbox and Python dispatcher for video jobs. Define a private Python bridge or durable edit intent for trim/recut; don't hand-encode Celery messages in Go. | Before job writes/edits. |
| Rollout | Keep Python active; select migrated routes explicitly in the Next.js backend client and Nginx after parity checks. Change the global backend URL only when all its callers are supported. | Before any traffic switch. |

These are proposals for discussion, not approvals or features already implemented.
Storage/provider replacements, new API versions, and a schema redesign are not
required just to change the implementation language.

## Step-by-step implementation plan

Each step gets a matching Notion ticket on **Sneep Cut > IT**, a bounded change,
relevant checks, and an update here with evidence. Only mark a step complete when
its behavior is implemented and verified. Step 0 does not complete Steps 1–10.

### Step 0 — Clean example foundation and this inventory

- [x] Replace the old `backend-go/` with the cleaned example base.
- [x] Document retained utilities, package boundaries and local commands.
- [x] Delete `docs/go-api-migration.md` and update current references/integration.
- [x] Verify formatting, Go tests/race checks, vet, build and local HTTP startup.

Verified on 2026-09-06:

- `make -C backend-go check` — race-enabled tests, vet and formatting passed.
  HTTP tests cover health/error routing, removed application routes, panic
  recovery, malformed/oversized JSON, request defaults and shutdown with an
  active request.
- `make -C backend-go build` — passed with Go 1.26.5. The built executable
  served both health paths, returned 404 for `/api/jobs`, and exited cleanly on
  SIGTERM on a temporary loopback listener.
- `docker build -t sneepcut-go-foundation:local backend-go` — passed, including
  tests/race checks and vet inside the Linux builder. The resulting image served
  health as non-root UID 65532 with a read-only filesystem and all capabilities
  dropped. The temporary verification container was stopped and removed.
- Default and development Compose configurations validated with `--profile
  go-api`; document links and the inventory of all 23 Python API routes checked;
  `git diff --check` passed.

No database integration or Python/ML/provider/browser feature tests were run for
Step 0: the new executable has no domain endpoints or runtime dependencies yet.
The database pool helper will be exercised against the dedicated integration
database in Step 1. Existing persistent data, source example files, active
services and production were not changed.

### Step 1 — Agree scope and establish contracts/data access

- [ ] Record the decisions above and the chosen example features.
- [ ] Capture Python OpenAPI plus representative success/error/null/default
  fixtures and Next.js-only contracts in a versioned contracts directory.
- [ ] Establish the DB pool/query conventions against an isolated copy of the
  current migrated schema; define transaction/context and error mapping rules.
- [ ] Add schema-parity tests, UUID/time/JSON serialization checks and dependency
  readiness. Decide the SQL driver/query tooling before domain repositories grow.

Acceptance: Go can read fixture data from the real migrated PostgreSQL schema
without schema changes; fixtures define what each later endpoint must match.

### Step 2 — Identity and authorization

- [ ] Implement agreed authentication boundary, owned user lookup, deletion marker
  handling, content roles, error contract, body limits and rate-limit policy.
- [ ] Verify stale/deleted sessions, forged headers, cross-account reads/writes,
  viewer mutations, insufficient configuration and secret-free logging.

Acceptance: authorized fixture users can access a protected read route; every
negative authorization case fails before side effects.

### Step 3 — Read-only jobs, clips and signed media

- [ ] Implement job list/status, clip list/detail and stable-key URL refresh in
  their feature packages; preserve wrappers, ordering and nullable fields.
- [ ] Add local/S3 read adapters and signature interoperability fixtures; port
  media verification before switching Nginx media authorization.
- [ ] Confirm polling works when Redis is unavailable and test actual frontend
  polling, thumbnails and video range requests with isolated media.

Acceptance: frontend readers consume Go responses unchanged; ownership, expired
URLs and media access checks match the agreed contract.

### Step 4 — Uploads and brand media

- [ ] Port signed intent verification/nonce consumption, multipart/raw streaming,
  quarantine, ClamAV, durable release and failure cleanup.
- [ ] Port logo storage/validation/read/delete and frontend logo coordination.
- [ ] Test oversized/truncated uploads, replay/tampering, content mismatches,
  scanner failure/malware, traversal, disconnects and account deletion races.

Acceptance: synthetic clean uploads become usable owned inputs; rejected uploads
leave no usable media. Python/Next.js-issued tokens work with the Go verifier.

### Step 5 — Job creation, batch and cancellation

- [ ] Port validation and atomic credits/job/outbox persistence; keep the Python
  dispatcher/worker contract and all rendering options intact.
- [ ] Port locked cancellation/refund and the agreed cooperative worker stop.
- [ ] Test concurrent reservations/cancellations, batch atomicity, broker outage,
  API crash after commit, duplicate delivery and worker lease/fencing recovery.

Acceptance: an isolated Go-created job completes through the Python worker and
produces playable output; retries/cancellation never double charge or refund.

### Step 6 — Clip edits, deletion and account media cleanup

- [ ] Implement the agreed edit dispatch bridge, reservation/rollback, trim and
  recut validation, original-source reads and stale-result protection.
- [ ] Port owned clip deletion, account cleanup and their active-work guards.
- [ ] Test dispatch failure, expired edit, duplicate callback, output cleanup,
  partial storage failure and retry while account deletion is pending.

Acceptance: real FFmpeg fixture edits preserve segment/subtitle timing, and no
old attempt can replace or delete a current result. Account cleanup is retryable.

### Step 7 — Scripts and assistant

- [ ] Port provider calls, prompts, structured output normalization, action
  allowlists, context limits, message persistence and scoped history.
- [ ] Preserve error handling, timeouts and existing credit behavior; verify
  malformed model output and cross-account clip context rejection with mocks.

Acceptance: contract fixtures and mocked provider failures pass. A configured
staging provider smoke test is tracked separately from mocked acceptance.

### Step 8 — Next.js business features

- [ ] Move profile/credits/brand settings, clip metadata and calendar in separate
  slices; replace corresponding route-handler and server-rendered Prisma access.
- [ ] If agreed, migrate credentials/OAuth/email/reset/session handling as its own
  slice, with existing accounts and sessions covered by a transition plan.
- [ ] Migrate billing/webhooks and complete export/account deletion separately;
  preserve checkout/event ordering, idempotency and retry under concurrency.

Acceptance: frontend pages and server loaders use the agreed Go services with no
unintended DB writes left in Next.js. Payment/email/OAuth checks use sandbox or
test providers and explicitly record any unverified external boundary.

### Step 9 — Controlled cutover and migration ownership

- [ ] Maintain a route ownership checklist for Next.js, Nginx and direct callers;
  switch only verified slices and retain a documented rollback route.
- [ ] Verify default/development Compose and eventual deployment topology,
  health/readiness, uploads/media, worker dispatch, observability and load.
- [ ] Transfer schema migration ownership at an agreed baseline with one writer;
  validate forward/backward compatibility on disposable fixtures first.

Acceptance: staging end-to-end tests pass, current in-flight jobs finish across
the switch, and rollback is exercised. Production deployment needs its own
authorization; passing local tests is not a deployment.

### Step 10 — Retire superseded application code

- [ ] Remove Python HTTP modules and Next.js business/database code only once all
  their callers are migrated; retain any Python worker/dispatcher dependencies.
- [ ] Remove obsolete profiles/configuration/docs and update setup/operations.
- [ ] Audit remaining Python imports/services and record the final runtime split.

Acceptance: the supported stack starts from documented commands with no calls
to retired APIs. “Application API migrated” and “Python removed” remain distinct
milestones unless a full worker rewrite has been agreed and completed.

## Verification reference

Port meaningful scenarios from `backend/tests/`, especially identity/content
roles, job integration/concurrency, upload token/quarantine/scanner, media signing,
storage security, logo validation, recut source, clip deletion and account media
lifecycle. Keep the processing/rendering tests with the Python worker while it
remains in service. Also retain frontend tests for auth, billing, deletion and
route contracts as those responsibilities move.

Use [frontend/backend verification setup](../frontend-backend-verification.md)
for prerequisites: database integration must use `sneepcut_integration_test` and
isolated schemas; browser mutations use a synthetic account and isolated DB/media.
Never use the persistent development database/media volume as disposable fixtures.
Historical test totals in that document are not results for this migration.

For each slice record commands, results, skipped prerequisites and external
boundaries. Use Go unit/HTTP/race checks, real PostgreSQL transaction tests when
SQL is introduced, cross-language fixtures at shared boundaries, and browser/
worker integration only for the behavior that changed.
