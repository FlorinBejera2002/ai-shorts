# Backend migration to Go

Updated 2026-09-06. The application API and frontend migration are implemented
and verified locally, including production containers and actual browser/worker
flows. Production deployment and the final Python
runtime decision are separate operator actions in [handoff.md](handoff.md).

## Agreed scope

- Replace the old Go experiment with the structure and reusable authentication
  from `/Users/tristan/GolandProjects/xstairs_api`, adapted to Sneepcut.
- Preserve its two-JWT design: an in-memory frontend access token and an
  HttpOnly refresh-token cookie. Adapt the compatible frontend authentication
  pattern from `/Users/tristan/WebstormProjects/gradali`.
- Move every Next.js application/backend responsibility to Go. Next.js remains
  responsible for presentation, localization and transport rewrites.
- Preserve existing PostgreSQL UUIDs, accounts, bcrypt hashes and business data.
  Do not apply the example's integer-ID schema or copy credentials/branding.
- Retain Python video/ML execution provisionally. Present the actual remaining
  dependencies and choices at the end; the user reserves that final decision.

The source inventory came from the Python routes, services, workers and models,
and the previous Next.js route handlers, server loaders and Prisma queries.
Those old Next.js modules are removed from the working tree; their Git history
remains the comparison source. The earlier Go experiment is not the foundation
of this implementation.

## Implemented architecture

```text
Browser -> Nginx -> Next.js UI
              |
              +-> Go /v1/auth/* and /api/* -> PostgreSQL
                        |                       |
                        |                  job_deliveries
                        |                  edit_deliveries
                        |                       |
                        |             Python durable dispatcher
                        |                       |
                        +-> Redis limits       Redis / Celery
                        +-> Google/mail/        |
                            Stripe/Gemini   Python video/ML workers
                                                |
                                         PostgreSQL + local/S3 media

Browser upload -> Go authorization -> signed direct Go upload -> scanner/storage
Browser media  -> Nginx auth_request -> Go signature check -> shared media volume
Schema changes -> Alembic migrate service -> PostgreSQL (single schema writer)
```

The default Compose topology now targets Go. The already-running persistent
local stack was not restarted or migrated by the verification fixtures. The old
Python HTTP process is available only through the `legacy-python-api` profile;
that profile alone is not a full UI/auth rollback.

Go retains the example's `net/http`, `httprouter`, `slog`, graceful shutdown,
strict JSON helpers, validation and `database/sql` approach. Domain code lives in
focused packages under `backend-go/internal/`; `cmd/api` composes dependencies,
`httpapi` owns routing/policy and `data` contains shared database plumbing.
See [package structure and commands](../../backend-go/README.md).

## Route and responsibility ownership

| Area | Public contract / behavior | Go owner |
| --- | --- | --- |
| Health | `/v1/healthcheck`, `/api/health` liveness; `/api/ready` PostgreSQL/Redis readiness | `health`, `cmd/api` |
| Authentication | `/v1/auth/login`, `refresh`, `logout`, `me`, `register`, `activate`, `resend-activation`, `forgot-password`, `reset-password`, Google start/callback | `identity`, `email` |
| Account | Profile read/update, credits, password change, JSON export, retryable account deletion | `account`, `identity` |
| Jobs | Owned list/create/detail, atomic batch, cancellation/refund, persisted polling | `jobs` |
| Clips | Owned list/detail/library, metadata, delete, trim, recut, original-source metadata | `clips` |
| Uploads | `/api/upload/authorize`, multipart `/api/upload`, signed single-use `PUT /api/upload/direct`, bounded staging/quarantine/scanning | `media` |
| Media | `/api/media/verify`, `/api/media/verify-request`, expiring local/S3 URLs, safe cleanup | `media` |
| Branding | `/api/user/brand`, `/api/user/brand/logo`; `/api/brand/logo` compatibility alias | `brand`, `media` |
| Calendar | `/api/calendar` list/create, `/api/calendar/{id}` update/delete | `calendar` |
| Dashboard | `/api/dashboard`, analytics/history/review; paginated clip library | `dashboard`, `jobs`, `clips` |
| Scripts | `/api/scripts/generate`, structured scene validation and provider normalization | `scripts`, `gemini` |
| Assistant | `/api/assistant/chat`, scoped history read/delete and owned clip context | `assistant`, `gemini` |
| Billing | Public prices, checkout, billing detail, portal, signed Stripe webhook | `billing` |

Existing application paths are preserved with deliberate caller updates:

- Job API responses use snake_case, including `progress_message` and
  `source_file_path`. Creation returns a job with 201; lists return `{jobs}`;
  polling returns the persisted job with null Celery status/meta fields.
- Clip detail uses the processing/edit contract; dashboard/library projections
  retain the camelCase shape formerly produced by Next.js server readers.
- Go accounts return the current role/credits/deletion state from PostgreSQL.
  Frontend auth stores no token in localStorage. Startup refresh, shared refresh
  across concurrent 401s, one retry, service-outage state and logout fencing are
  implemented in `frontend/src/lib/auth-client.ts`.
- Auth.js cookies do not authorize Go. Existing users sign in again at cutover;
  their accounts/passwords survive. Registration, password recovery and Google
  identity linking have migrated; see [auth-adaptation.md](auth-adaptation.md).
- The private Python account-media step is consolidated into Go's durable
  `/api/user/data` deletion saga. Its billing/worker/storage guards remain.
- Workers persist progress/results directly through fenced database operations.
  The unused Next.js processing callback is removed; no browser-trusted callback
  replaces the database worker protocol.
- Next.js route handlers and DB/provider/auth utilities are removed, along with
  Prisma/Auth.js/backend SDK dependencies. API/media rewrites are transport only.
  The Prisma schema remains a historical schema reference and is not a writer.
- Calendar publishing remains scheduling metadata; an automatic social publisher
  was not a working feature in the source and is not claimed by this migration.

## Persistence, reliability and boundaries

The current Alembic head is `20260906_0002`. Two additive migrations introduce
`edit_deliveries` and `users.email_activation_required` (false for existing
accounts). Existing jobs, credits, subscriptions, calendar entries, clips,
verification records and UUID relationships are retained.

Job creation locks the owner, reserves credits and commits jobs plus outbox rows
in one transaction. The Python dispatcher handles broker outages and stale
worker leases. Go writes durable trim/recut intents; workers claim and fence
attempts before committing media/metadata. Failed edits retain the prior output;
retry, duplicate delivery, expired reservation and cancellation do not allow old
attempts to overwrite a current result or refund twice.

Signed uploads consume a Redis nonce and stream into durable staging. Go verifies
ownership, paths, size/type and scanner results before release. Local and S3
storage, shared media signatures and historical logo cleanup are covered by
contract tests. Production forces scanning on; a missing scanner fails closed.

Billing uses provider abstractions with signed webhooks, durable checkout claims,
event ordering/idempotency and account-deletion coordination. Account deletion
can resume after billing/storage failures; it checks active jobs/edits and keeps
records until cleanup succeeds. Password or recent OAuth proof remains required.

Host/origin checks, trusted proxy parsing, shared Redis limits, body limits,
route-specific deadlines, no-store auth responses and generic provider errors
are wired into the full application. Readiness checks PostgreSQL and Redis; it
does not certify every external provider or whether an ML worker is online.

Alembic remains the only schema writer. Moving schema tooling to Go is deferred
to the explicit ownership decision in the handoff. No competing migration
engine or copied baseline is enabled. Expired auth records are rejected on use;
a periodic retention/sweeper policy remains an operational follow-up.

## Step-by-step completion record

| Original step | Implementation state | Verification boundary |
| --- | --- | --- |
| 0 — Foundation/inventory | Complete: removed old Go experiment and obsolete migration document; adapted example structure | Go/race/vet/build, standalone health/shutdown and non-root image verified in the foundation pass |
| 1 — Contracts/data access | Complete for migrated features: focused HTTP/provider fixtures and real migrated-schema tests live beside each package | Fixtures are executable tests rather than a second duplicated snapshot corpus; database tests require isolated fixture settings |
| 2 — Auth/Gradali frontend | Complete: full account lifecycle, two JWTs, memory auth, guards and refresh/logout behavior | Unit/browser mocks, real PostgreSQL and mocked Google/mail contracts; live provider login/delivery remains operator verification |
| 3 — Reads/signed media | Implemented: owned reads, fresh URLs, shared signature/storage behavior and media authorization | Go ownership/signature/storage tests; production Nginx/media runtime checks recorded below |
| 4 — Upload/brand | Complete: signed/direct/multipart streaming, nonce/scanner/staging and logo/brand flows | Mock scanner/storage failures, cross-language fixtures and actual signed upload in the worker smoke; live ClamAV/S3 are separate |
| 5 — Jobs/cancellation | Complete: atomic create/batch/outbox and guarded cancellation/refund | PostgreSQL concurrency tests and actual broker/worker outage/duplicate/cancel/recovery smoke |
| 6 — Edits/deletion | Complete: durable edit bridge, trim/recut/delete and account cleanup saga | PostgreSQL/provider/storage failures and actual FFmpeg edit/fencing smoke |
| 7 — Assistant/scripts | Complete: Go provider clients, normalization, bounded context and stored history | Mocked Gemini success/error/malformed responses; live AI quality/cost remains operator verification |
| 8 — Next.js backend features | Complete: all active DB/auth/provider business code moved to focused Go packages | Feature tests and frontend contract/browser checks; no server-side business routes remain in Next.js |
| 9 — Cutover/ownership | Repository topology and isolated local cutover implemented; production and migration-tool handoff deferred | Default/dev Compose and production image/runtime fixtures; staging load/rollout/rollback exercise remains in the handoff |
| 10 — Retirement | Next.js backend code removed; Python HTTP is inactive in the default topology | Worker-required Python and optional rollback source are inventoried; removal follows the user's final Python decision |

## Verification evidence — 2026-09-06

Completed checks:

- Focused Go unit/HTTP/provider tests and real PostgreSQL integration tests cover
  authentication, ownership/viewer guards, jobs/credits/outboxes, edits, cleanup,
  account export/deletion, billing event/checkout behavior, media/upload/scanning,
  branding/calendar, dashboard projections, scripts and assistant contracts.
- Google token/profile exchange, state/PKCE/callback/replay/identity mapping and
  mail delivery are tested against deterministic HTTP/SMTP fixtures; callback
  account/session behavior also uses actual PostgreSQL. Identity/email tests
  pass with the race detector. SMTP success uses a local plain SMTP fixture;
  TLS refusal/error paths are covered, successful TLS delivery is not.
- `python3 backend-go/scripts/test-worker-integration.py` passes all nine
  disposable Go → PostgreSQL → Redis/Celery → FFmpeg scenarios. It generates and
  probes playable 180×180 H.264 output with captions; checks trim, reordered recut,
  prior-file cleanup, rejected edit retention/retry, duplicate delivery, broker
  outage, expired edit, provider failure/refund, pending/active cancellation and
  hard worker termination/recovery. Final credits reflect exactly two successful
  jobs. Whisper/Gemini responses are fixtures; smart crop is excluded.
- The worker change's affected Python regressions pass (29 tests), with Ruff and
  syntax checks. The ordered-recut regression validates source bounds/overlap
  without changing the editor's chosen output order.
- `python -m pytest tests/test_edit_delivery.py tests/test_job_integration.py -q`
  passes **38 tests** in the Python API image with current source, an isolated
  test-dependency mount and a fresh dedicated PostgreSQL container. Every test
  applies current migrations to its own schema; none skipped. This directly
  verifies the retained job/edit bridge in addition to the FFmpeg worker smoke.
- Frontend tests, TypeScript and Biome pass. A clean Node 22 `npm ci` verifies
  the repaired optional-dependency lock. Contract regressions cover job status
  fields and an existing brand kit's editable save payload.

- The complete Go suite passes with the race detector against the current
  Alembic schema on disposable PostgreSQL, followed by `go vet ./...` and clean
  formatting. The corrected auth runner also passes executable login, refresh,
  logout, revocation and clean shutdown using its own PostgreSQL, Redis and media.
  A final focused PostgreSQL race regression verifies failed email delivery
  revokes its token even if the caller's context was cancelled.
- Both final Docker images build successfully. Go's image build runs race tests,
  vet and compilation; Next.js completes its production build after dead
  backend-only helpers are removed. Default/development Compose configurations
  validate, and Nginx validates in the isolated runtime.
- The final frontend suite has **59 passing tests**, plus TypeScript and Biome.
  The earlier 77-test count included 18 obsolete tests for retired Next.js
  server helpers; their responsibilities and regression coverage now live in Go.
  Mocked browser QA passes 42 English desktop/light and Romanian mobile/dark
  route variants, auth/deletion-recovery flows, persisted brand saves and active
  job source/progress display, with no page errors or horizontal overflow.
- `test-application-integration.py` passes using production Go/Next.js/Nginx
  images and isolated PostgreSQL/Redis/media: registration/session lifecycle,
  feature readers, profile/brand writes, explicit unavailable-provider errors,
  and public pages. Real Go-generated media URLs serve JPEG thumbnails and
  MP4 byte ranges through Nginx; unsigned/tampered media requests return 403.
- `frontend/scripts/go-runtime-browser.mjs` passes against that real stack:
  actual login form, persisted profile edit/reload, HttpOnly refresh cookie,
  dashboard/analytics/history/review/clips/calendar/billing pages, saving an
  existing brand kit, H.264 video playback, Romanian mobile layout and persistent
  logout. Screenshots were inspected. The check caught and verified a proxy fix:
  session refresh/logout/me use the ordinary API budget rather than the much
  smaller credential-attempt budget. Rate-limit rejection now returns 429.
- React Doctor's scan reports no new frontend source diagnostics; two existing
  errors remain and its maintainability engine did not produce a score. It is
  recorded as an incomplete diagnostic check, not a full pass.

No live provider, staging load, production deployment or migration of persistent
user data is implied by these local checks. Disposable services and media were
removed after verification.

Reproducible runners and prerequisites are in [backend-go/README.md](../../backend-go/README.md).
Fixtures use the dedicated `sneepcut_integration_test` database, synthetic users,
temporary schemas/containers and isolated media. Never substitute the persistent
development database or media volume. See [handoff.md](handoff.md) for what to test,
provide, decide and do, and [remaining-python.md](remaining-python.md) for the
remaining runtime inventory.
