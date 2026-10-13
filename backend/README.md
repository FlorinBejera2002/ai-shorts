# Sneepcut Go backend

Go serves the application API, authentication and media-processing worker. Vite/React serves the interface. The default Compose stack routes API/auth traffic through Nginx, and the embedded Go migrator prepares the PostgreSQL schema.

Feature boundaries follow the `net/http`, `httprouter` and `database/sql` architecture. See [authentication adaptation](../docs/go-migration/auth-adaptation.md) for the account/session contract and [verification guidance](../docs/frontend-backend-verification.md) for isolated checks. Historical test totals do not certify current deployment or provider behavior.

## Package boundaries

| Package | Responsibility |
| --- | --- |
| `cmd/api` | Process entry point, explicit dependency composition, readiness command. |
| `internal/config`, `server`, `httpapi` | Configuration, HTTP lifecycle, route composition, host and request policies. |
| `internal/identity` | Login, refresh, logout, registration, activation, password recovery/change, Google OAuth, session checks, authorization and shared limits. |
| `internal/account` | Profile, credits, data export and recoverable account deletion. |
| `internal/jobs`, `clips` | Ownership, job creation/cancellation, clip reads/edits and durable worker-delivery records. |
| `internal/media` | Local/S3 storage, signed media, upload intents/nonces, quarantine scanning, brand images and cleanup. |
| `internal/brand`, `calendar`, `dashboard` | Brand settings, scheduled content and dashboard read models. |
| `internal/billing` | Stripe checkout, portal, billing reads, webhook reconciliation and deletion cleanup. |
| `internal/scripts`, `assistant`, `gemini`, `email` | Script/chat features and bounded provider adapters. |
| `internal/data`, `jsonutil`, `httpx`, `validator`, `health`, `testdb` | Focused shared infrastructure, response helpers, liveness and isolated test fixtures. |

Feature handlers, business rules, SQL, types and tests live together. `cmd/api`
composes dependencies; `internal/httpapi` wires HTTP policy. Neither is a generic
business-logic container. Feature packages receive dependencies instead of
reading environment variables or opening pools inside handlers.

The API process does not run migrations. The separate `cmd/migrate` executable applies the embedded SQL history in `migrations/`; see [schema ownership](migrations/README.md).

## Run locally

Use the repository's `.env.example` and root README for the complete stack:

```sh
make up
make status
```

The normal stack waits for PostgreSQL, Redis and the migration service before
starting Go. Use `make dev-up` for the development override; it mounts Go source and exposes it on
loopback (`GO_BACKEND_HOST_PORT`, default 8080). Keep `make dev-watch` running for Go reload; see the root README.
The production image is non-root, has a read-only root filesystem in Compose,
and shares the media volume with workers and Nginx.

For a standalone process, export configuration first; `.env` is not loaded
automatically:

```sh
make -C backend run
# Flags override environment values.
make -C backend run ARGS='-listen-addr=127.0.0.1:8081 -env=test'
```

`LISTEN_ADDR` defaults to `127.0.0.1:8080`, and `APP_ENV` to `development`.
`GO_AUTH_ENABLED=true` (or `-auth-enabled`) enables the **whole application API**.
The retained flag name does not mean only login is enabled. Without it, the
process serves liveness only, opens no database/provider connections, and has
no readiness or application routes. Compose enables it by default.

## Configuration

| Settings | Behavior |
| --- | --- |
| `DATABASE_URL`, `REDIS_URL` | PostgreSQL with current Alembic migrations; Redis for shared limits and upload nonces. Redis defaults to `redis://localhost:6379/0` outside Compose. |
| `JWT_SECRET`, `JWT_ISSUER`, `JWT_AUDIENCE` | JWT secret of at least 32 bytes; issuer defaults to `sneepcut`, audience to `sneepcut-web`. |
| `APP_URL`, `CORS_ORIGINS` | Browser origin and explicit comma-separated allowed browser origins. HTTPS is required outside development/test. |
| `ALLOWED_HOSTS` | Allowed API hostnames, without schemes or paths. Include public and internal healthcheck hosts. Compose maps `GO_ALLOWED_HOSTS` into this setting. |
| `TRUSTED_PROXY_CIDRS` | Only socket peers in these networks may supply `X-Real-IP`; other forwarded identity headers do not establish the caller. Scope this to the deployed proxy network. |
| `AUTH_REQUIRE_EMAIL_VERIFICATION` | Defaults to false; when true, new credential accounts must activate before login. Existing users keep their migration default. Requires a mail provider. |
| `DEFAULT_FREE_CREDITS` | Initial account credits; default 1000. Explicit overrides, including 0, are preserved. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URL` | Google login configuration. Callback must be the public `/v1/auth/google/callback`; default is that path on `APP_URL`. Configure both client credentials together. |
| `AUTH_EMAIL_FROM`, `RESEND_API_KEY` | Resend sender and key. Resend takes precedence when both mail adapters are configured. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_REQUIRE_TLS` | Alternative SMTP delivery; port defaults to 587. TLS is always required outside development/test. |
| `STORAGE_TYPE`, `LOCAL_MEDIA_ROOT` | `local` or `s3`; local root defaults to `../media`, with `/app/media` used by Compose. |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`, `AWS_REGION`, `AWS_S3_BUCKET`, `AWS_ENDPOINT_URL`, `AWS_S3_FORCE_PATH_STYLE`, `AWS_PUBLIC_BASE_URL` | S3-compatible storage, optional temporary credentials/custom endpoint and public media base. |
| `INTERNAL_API_KEY`, `UPLOAD_TOKEN_SECRET` | Media signing and upload intent secrets. Production requires at least 32 bytes for each; provision separate values. |
| `NEXT_PUBLIC_UPLOAD_URL`, `UPLOAD_STAGING_DIR`, `MAX_UPLOAD_SIZE_MB` | Direct upload URL (default `/api/upload/direct`), quarantine directory and upload cap (default/max 2048 MiB). |
| `UPLOAD_SCANNER_ENABLED`, `CLAMAV_HOST`, `CLAMAV_PORT`, `CLAMAV_TIMEOUT_SECONDS` | Quarantine scanning; scanning is mandatory outside development/test. Defaults: localhost, 3310, 120 seconds. |
| `AI_PROVIDER`, `GEMINI_API_KEY`, `GEMINI_MODEL_NAME`, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL_NAME`, `MAX_CLIP_DURATION` | Generation provider/model and clip duration cap. `AI_PROVIDER` accepts `auto`, `gemini`, or `openrouter`; OpenRouter accepts any text/chat model slug. Defaults: `auto`, `gemini-2.5-flash`, `google/gemini-2.5-flash`, and 60 seconds. |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*` | Billing provider and configured subscription/credit-pack prices; see `.env.example` for individual price variables. |

The frontend defaults to same-origin requests. `GO_API_URL` configures Next.js
rewrites for `/api/*` and `/v1/*`; Nginx routes those requests directly to Go in
the normal stack. `NEXT_PUBLIC_API_URL` is an optional browser API base. Keep the
browser and API on the same site for the SameSite refresh cookie. Next.js no
longer holds database, auth, Stripe, upload-signing or mail-provider authority.

## Runtime policy and readiness

`GET /v1/healthcheck` and `GET /api/health` are process liveness checks.
`GET /api/ready` checks PostgreSQL connectivity, the activation column and edit
delivery table, and Redis connectivity; it returns 503 if any check fails.
`/api -healthcheck` uses readiness and is the Compose healthcheck. Readiness does
not certify worker availability, ClamAV, storage or external providers.

Shared Redis limits use hashed keys and atomic expiring counters. Login limits
apply to both peer and normalized email; authenticated feature limits use the
current user. Limit exhaustion returns 429 with `Retry-After`; Redis failure
returns 503. Production cannot fall back to process-local limits. Host checks,
credentialed CORS and no-store responses wrap the application routes.

The server allows five seconds for headers, 64 KiB of headers and one minute
of idle connection time. Route deadlines replace a global body/write timeout:
ordinary requests have a 15-second read and 20-second operation budget,
script/chat operations 100 seconds, uploads and logo requests ten minutes,
and account deletion two minutes. SIGINT/SIGTERM drains requests for up to
30 seconds. Reverse-proxy timeouts are a separate outer bound.

Expired JWTs, sessions and one-time tokens cannot authenticate. There is no
periodic Go sweeper for expired database session/token rows yet; deletion on
logout, token replacement/consumption and account deletion handles those paths.

## Checks

From the repository root:

```sh
make test-go
make -C backend vet
make typecheck
make lint
make test-frontend
```

`backend/Makefile` shares `.cache/go-build`. Its `check` target runs race tests, vet and formatting checks. The module declares Go 1.24.0; the documented local/Docker toolchain is Go 1.26.5 or newer.

PostgreSQL integration tests require the dedicated loopback `sneepcut_integration_test` database. Domain tests also require `SNEEPCUT_TEST_SCHEMA_SQL` for the current schema. Use isolated schemas and synthetic accounts; skipped database tests are not passes. See [database and browser fixtures](../docs/frontend-backend-verification.md) before using integration runners, some of which still target the former stack.

Builds and mocked provider tests do not prove live OAuth, email, Stripe, AI or social publishing. Those require explicitly configured test environments and appropriate authorization. Do not mutate persistent development databases/media to prepare fixtures.
