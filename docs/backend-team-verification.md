# Backend team verification and rollout

## Inventory and delivery boundaries

The Notion backend inventory contained 14 tickets: 3 Done and 11 open. The architecture tickets CF-020 (AI cuts/transitions), CF-040 (Go migration), CF-041 (isolated ML service), and CF-044 (scanning/sandbox/RBAC) contained no requirements or acceptance criteria. The user subsequently authorized researching and selecting their design. Concrete criteria are being recorded on those tickets; no production cutover is implied.

First verified implementation batch: 147 backend tests, 105 frontend tests, TypeScript and Biome checks, plus Chromium/Firefox integration flows passed. These results include actual PostgreSQL, abrupt worker-subprocess exit, FFmpeg and local browser queue/cancel/refund checks; they do not cover later architecture changes until rerun.

This change implements generation-job crash recovery and closes concrete gaps in CF-054 recut sources, CF-058 media cleanup and CF-059 brand validation. Existing CF-055 signed media and CF-060 Stripe protections were rechecked against their tests. CF-057 has tested language, subtitles, aspect ratio, logo and badge support; generic palette/intro/outro semantics remain outside the implemented renderer and must not be presented as complete.

## Durable generation jobs

- `job_deliveries` is inserted in the same PostgreSQL transaction as the job and credit reservation. Its JSON payload retains dispatch options, including smart crop and subtitle enablement.
- The API returns the persisted pending job even when Redis publication fails. Credits remain reserved for this durable job; cancellation refunds once. Clients should track the returned job instead of treating a broker outage as a lost submission.
- A dispatcher retries unclaimed delivery every 60 seconds. Stable Celery identity does not imply exactly-once execution; row locks plus execution tokens enforce a single authoritative attempt.
- Workers renew a 180-second lease every 30 seconds. Reconciliation runs every 10 seconds with a bounded batch and skip-locked row selection. Expired attempts are fenced before being requeued. After three interrupted executions, the job fails and refunds once.
- Progress, terminal publication, refunds and active-state finalization check ownership. A stale process cannot overwrite another attempt's state. Every new attempt uses separate `sources/{job}/attempts/{token}`, `clips/{job}/attempts/{token}` and workspace directories.
- Already-completed jobs cannot be refunded by recovery. Already-cancelled jobs are never requeued or refunded twice.

## Safe rollout

1. Back up the database. Stop admission of new jobs and drain **all old worker binaries**. They do not implement execution fencing; rolling mixed versions are not safe.
2. Apply `alembic upgrade head`, including `20260904_0002`, before starting the changed API/worker/dispatcher. This creates a backend-owned delivery table; no destructive data migration or guessed reconstruction of old processing options occurs.
3. Start the new API and worker image, then `job-dispatcher` from Compose (or supervise `python -m app.services.job_delivery` as a dedicated process). It requires the same database/broker configuration, but no public port or media volume.
4. Verify a staging job, cancellation and a forced worker interruption. Keep host clocks synchronized; lease timestamps currently use UTC process clocks.
5. Monitor dispatcher logs and database counts of pending jobs, expired leases, `dispatch_count`, `execution_count`, and `last_error`. If Redis is unavailable, pending jobs and their charge remain visible and cancellable.

Legacy jobs without delivery rows are intentionally not replayed: their original options may not be recoverable. Resolve them by cancellation/recreation during maintenance. Do not drop `job_deliveries` while jobs are active. Rollback requires draining workers and resolving delivery rows first.

## Media and brand regressions

- Recut resolves a persisted canonical key first, then a recorded legacy source URL or local storage reference. It does not guess a source directory from the database job ID. External unknown URLs are not fetched as a fallback.
- Clip deletion rejects active edits/processing, removes current objects and clip-specific edit namespaces before deleting its row, and leaves the row retryable on storage failure. Shared job source media is retained until account deletion.
- Edit admission rechecks clip existence while holding the job lock, avoiding a delete/edit race. A second concurrent edit on the same job is rejected.
- Account cleanup logs storage failures and retains its existing deletion checkpoint flow. Local and object-storage adapters have cleanup tests (object-storage calls use controlled mocks, not a live bucket).
- Brand API tests execute the route with controlled auth/database boundaries: anonymous requests, unknown/ownership fields, malformed values, renderer-unsafe fonts and unauthorized badge removal are rejected; valid writes use only the session owner.

## Remaining work and limits

- Generation recovery does not yet cover the separate trim/recut task tracking counters. A hard-killed edit can leave `active_edit_tasks` outstanding; automatic edit recovery and cleanup after such failures remain open under CF-058. Do not reset these counters while an edit could still be running.
- Partial files from dead attempts are isolated from successful outputs and covered by account-owned prefix cleanup. Automatic time-based orphan garbage collection is not implemented.
- Full Go migration, ML service isolation, AI transitions and role enforcement are subsequent implementation phases. These tickets remain open until their selected criteria are implemented and verified.
- Live Stripe/OAuth/storage/publishing, full paid AI/media workloads, production deployment, and production capacity certification were not performed. Refer to `frontend-backend-verification.md` for the previous local browser setup; its statement that generation jobs lack an outbox is superseded by this change.
