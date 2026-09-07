# Backend team verification and rollout

## Inventory and delivery boundaries

The Notion backend inventory contained 14 tickets: 3 Done and 11 open. The initially blank architecture tickets received concrete acceptance criteria after the user authorized research and design decisions. Implementation and test evidence are recorded per ticket; no production cutover is implied.

First verified implementation batch: 147 backend tests, 105 frontend tests, TypeScript and Biome checks, plus Chromium/Firefox integration flows passed. These results include actual PostgreSQL, abrupt worker-subprocess exit, FFmpeg and local browser queue/cancel/refund checks; they do not cover later architecture changes until rerun.

Subsequent verified work adds upload quarantine/ClamAV, isolated API/ML images, bounded AI transitions, fenced edit recovery, brand palette/typography and database-controlled member/viewer permissions. The earlier CF-040 Go job-control experiment was removed on 2026-09-06 and replaced with a clean example-based foundation. Historical Go verification does not apply to that foundation. See the [new migration plan](go-migration/backend-go-migration.md), `backend-runtime-isolation.md`, `auto-edit-transitions.md`, `edit-recovery.md` and `brand-rendering.md` for scope and rollout details.

Final local checks: 197 backend tests, 108 frontend tests, Go unit/PostgreSQL tests, TypeScript, browser member/viewer flows and container checks. Chromium and Firefox cover persistence, native Go create/poll/cancel/refund, responsive/localized pages and live viewer write denial. ClamAV accepted a clean fixture and rejected harmless EICAR. The local read-only comparison (100 requests, concurrency 8) measured Python median/p95 30.05/62.84 ms and Go 8.41/17.82 ms; these are not production capacity guarantees.

## Durable generation jobs

- `job_deliveries` is inserted in the same PostgreSQL transaction as the job and credit reservation. Its JSON payload retains dispatch options, including smart crop and subtitle enablement.
- The API returns the persisted pending job even when Redis publication fails. Credits remain reserved for this durable job; cancellation refunds once. Clients should track the returned job instead of treating a broker outage as a lost submission.
- A dispatcher retries unclaimed delivery every 60 seconds. Stable Celery identity does not imply exactly-once execution; row locks plus execution tokens enforce a single authoritative attempt.
- Workers renew a 180-second lease every 30 seconds. Reconciliation runs every 10 seconds with a bounded batch and skip-locked row selection. Expired attempts are fenced before being requeued. After three interrupted executions, the job fails and refunds once.
- Progress, terminal publication, refunds and active-state finalization check ownership. A stale process cannot overwrite another attempt's state. Every new attempt uses separate `sources/{job}/attempts/{token}`, `clips/{job}/attempts/{token}` and workspace directories.
- Already-completed jobs cannot be refunded by recovery. Already-cancelled jobs are never requeued or refunded twice.

## Safe rollout

1. Back up the database. Stop admission of new jobs and drain **all old worker binaries**. They do not implement execution fencing; rolling mixed versions are not safe.
2. Apply `alembic upgrade head`, through `20260904_0004`, before starting changed clients. Migrations add delivery tracking, bounded edit reservations and server-controlled content roles; no guessed reconstruction of old processing options occurs.
3. Review media-volume ownership for non-root UID 10001; start the separate API/ML images and `job-dispatcher`. Enable the private scanner through the `security` profile for production uploads. The optional `go-api` profile currently runs only the new health-only foundation; keep frontend BACKEND_URL and Nginx on Python until route parity is verified. Do not modify unrelated volumes or production services without deployment authorization.
4. Verify a staging job, cancellation and a forced worker interruption. Keep host clocks synchronized; lease timestamps currently use UTC process clocks.
5. Monitor dispatcher logs and database counts of pending jobs, expired leases, `dispatch_count`, `execution_count`, and `last_error`. If Redis is unavailable, pending jobs and their charge remain visible and cancellable.

Legacy jobs without delivery rows are intentionally not replayed: their original options may not be recoverable. Resolve them by cancellation/recreation during maintenance. Do not drop `job_deliveries` while jobs are active. Rollback requires draining workers and resolving delivery rows first.

## Media and brand regressions

- Recut resolves a persisted canonical key first, then a recorded legacy source URL or local storage reference. It does not guess a source directory from the database job ID. External unknown URLs are not fetched as a fallback.
- Clip deletion rejects active edits/processing, removes current objects and clip-specific edit namespaces before deleting its row, and leaves the row retryable on storage failure. Shared job source media is retained until account deletion.
- Edit admission rechecks clip existence while holding the job lock, avoiding a delete/edit race. A second concurrent edit on the same job is rejected.
- Account cleanup logs storage failures and retains its existing deletion checkpoint flow. Local and object-storage adapters have cleanup tests (object-storage calls use controlled mocks, not a live bucket).
- Brand API tests execute the route with controlled auth/database boundaries: anonymous requests, unknown/ownership fields, malformed values, renderer-unsafe fonts and unauthorized badge removal are rejected; valid writes use only the session owner.

## Operational limits

- New trim/recut reservations expire after one hour and are fenced before release. Legacy untagged counters must be reconciled only after confirming old processes stopped; never reset live counters blindly.
- Partial files from dead attempts are isolated from successful outputs and covered by account-owned prefix cleanup. Automatic time-based orphan garbage collection is not implemented.
- The new Go foundation exposes only health endpoints; Python owns the application API until individual migration steps pass parity checks. Historical intro/outro path columns are not exposed as supported brand-editing controls. Roles do not grant cross-account administrative access.
- Live Stripe/OAuth/storage/publishing, full paid AI/media workloads, production deployment, and production capacity certification were not performed. Refer to `frontend-backend-verification.md` for the previous local browser setup; its statement that generation jobs lack an outbox is superseded by this change.
