# Gradual Go API migration (CF040)

The native Go service owns GET/POST `/api/jobs`, GET `/api/jobs/{id}` and POST
`/api/jobs/{id}/cancel`. It retains the existing JSON job contract and writes
the same PostgreSQL transactional outbox consumed by the Python dispatcher and
ML workers. Credit reservation and job/outbox creation are atomic; cancellation
refunds once under a row lock. Ownership is checked from the database, not from
request payloads. Native requests have bounded JSON bodies, database deadlines
and a bounded connection pool. Creation limits are conservatively based on
recent persisted jobs, not a per-process in-memory counter.

This is a native job-control migration, not a claim that all Python endpoints
have been rewritten. Batch creation, media, edits, scripts and assistant routes
remain explicitly proxied to the configured trusted Python origin. Python owns
ML and migration execution. The Go service never directly invokes ML libraries.

## Controlled rollout

Apply existing Alembic migrations and run the dispatcher before directing job
traffic here. Start the `go-api` Compose profile, then deliberately set frontend
BACKEND_URL to `http://backend-go:8080` for a staging/controlled cutover. The
default stack remains on Python. Reverting BACKEND_URL to Python preserves jobs
already recorded in the shared outbox; no data conversion or destructive
migration is required. Direct browser upload and nginx media authorization
continue using the existing Python routes.

Go requires an explicit INTERNAL_API_KEY even in development and an explicit
PYTHON_BACKEND_URL. No production deployment was performed. Unit and real
PostgreSQL tests cover strict JSON, authentication before database access,
concurrent credit reservations, eight concurrent cancellations, ownership,
quarantine rejection and persisted worker options. The isolated WSL runtime
has no C compiler, so race-detector execution is delegated to the Docker build;
the Docker build passed its unit race checks (database tests run separately in
isolated PostgreSQL schemas). Chromium and Firefox both passed profile persistence,
native job creation/poll/cancel/refund, localized pages and responsive layouts.

Migration 20260904_0004 is required for server-controlled member/viewer content
permissions. Go rechecks this role from the database for every native request.

References: [Go HTTP server](https://pkg.go.dev/net/http),
[pgx PostgreSQL driver](https://github.com/jackc/pgx).
