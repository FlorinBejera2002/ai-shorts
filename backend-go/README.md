# Sneepcut Go foundation

This is the reusable server base adapted from the local `xstairs_api` example.
The old Go job API and Python reverse proxy have been removed. Sneepcut business
endpoints will be implemented in the order recorded in
[the migration plan](../docs/go-migration/backend-go-migration.md).

## What is included

- The example's `net/http` + `httprouter` approach, liveness handler, JSON error
  responses, bounded/strict JSON reader and validation helpers.
- `slog` logging, configurable listen address/environment, HTTP timeouts, and
  SIGINT/SIGTERM shutdown that drains active requests.
- Its `database/sql` + `lib/pq` pool helper, extracted into `internal/data` with
  a context and bounded connection settings. It is not connected at startup.
- Separate packages and colocated tests, local commands, and a non-root image.

Only `GET /v1/healthcheck` and `GET /api/health` are implemented. Both report
process liveness using the example's `status: available` / `system_info` shape;
they do not certify database or worker readiness. Other application paths return
404. Do not point the frontend's `BACKEND_URL` at this foundation yet.

The example's application-specific users, activation tokens, JWT/OAuth handlers,
SMTP credentials/templates, frontend URLs, debug endpoint and schema migrations
are not part of this infrastructure scaffold. Authentication ownership is a
decision in the migration plan. Its integer-ID user schema cannot replace the
existing Sneepcut UUID schema. No example credentials, Git history, IDE files or
CORS demonstration app are copied.

## Structure

```text
backend-go/
├── cmd/api/main.go             # configuration, dependencies, process entry point
├── internal/
│   ├── config/                 # environment/flags and configuration validation
│   ├── server/                 # HTTP lifecycle, timeouts and shutdown
│   ├── httpapi/                # route composition, shared errors/middleware
│   ├── health/                 # liveness feature
│   ├── data/                   # shared PostgreSQL pool and storage errors
│   ├── jsonutil/               # bounded JSON decoding and response encoding
│   └── validator/              # reusable field validation
├── migrations/                # ownership notes; no executable SQL yet
├── Dockerfile
├── Makefile
└── go.mod
```

Add each feature as its own package, for example `internal/jobs/`,
`internal/clips/`, `internal/uploads/`, `internal/identity/` and
`internal/billing/`. Keep its handler, service, repository, request/response types
and tests together. Introduce subpackages when a feature needs them. Shared
storage/queue/provider adapters get focused packages when implemented.

Keep `cmd/api` as the composition root and `internal/httpapi` as HTTP wiring.
Business rules and SQL belong with their feature, not in a growing `main.go`,
`api.go`, generic `helpers.go`, or a single `internal/data` models collection.
Packages accept explicit dependencies; do not read environment variables or
open new connection pools inside request handlers. Add folders when they have
real code rather than creating placeholder feature implementations.

## Run and check

From the repository root (Go 1.24+; verified with installed Go 1.26.5):

```sh
make -C backend-go run
curl --fail http://127.0.0.1:8080/v1/healthcheck
make -C backend-go check
make -C backend-go build
```

`LISTEN_ADDR` defaults to `127.0.0.1:8080`; `APP_ENV` defaults to `development`.
Flags override environment values:

```sh
make -C backend-go run ARGS='-listen-addr=127.0.0.1:8081 -env=test'
```

Run `go run ./cmd/api -help` from this directory to see flags. `.env` is not
automatically loaded and no DB/Redis/provider secrets are required to run the
foundation. `make test-go` from the repository root still runs the Go tests.

The opt-in Compose service is a standalone foundation, with no database/media
mounts or Python dependency:

```sh
docker compose --profile go-api build backend-go
docker compose --profile go-api run --rm --no-deps -p 127.0.0.1:8080:8080 backend-go
```

The default Python stack and Nginx routing remain active. The Go image listens
on `:8080` inside its container. Upload/AI timeout policies, auth, CORS, rate
limiting, dependency readiness, and domain schema access will be implemented and
verified before the corresponding migration steps receive traffic.
