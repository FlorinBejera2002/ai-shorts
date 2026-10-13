# Go/Vite runtime configuration

The application frontend is Vite/React. The Go API, media worker and embedded SQL migrator live in `backend/`. PostgreSQL, Redis and Nginx complete the local stack. See the root [README](../../README.md) for commands and [verification guidance](../frontend-backend-verification.md) for isolated fixtures.

## Existing installations

`make setup` preserves an existing `.env`. Compare it with [`.env.example`](../../.env.example), retaining PostgreSQL credentials, media/signing secrets and provider identifiers. Keep secrets out of source control and tickets.

- Configure `DATABASE_URL`, `DIRECT_URL` where required, and `REDIS_URL` for the intended environment. Compose supplies private service addresses.
- Enable Go authentication with `GO_AUTH_ENABLED`; configure `JWT_SECRET`, `JWT_ISSUER` and `JWT_AUDIENCE`. Use application-owned secrets.
- Preserve `INTERNAL_API_KEY` when old signed media URLs must remain valid. Use a separate `UPLOAD_TOKEN_SECRET`.
- Set the canonical `APP_URL`, allowed origins/hosts and trusted proxies for the actual environment. Provider callbacks must match the configured public origin.
- Configure Google, email, Stripe, AI and storage providers only when needed; missing optional credentials do not demonstrate a working integration. The frontend must not receive provider secrets.
- Local media and PostgreSQL volumes are persistent user data. Back up the intended database before an authorized migration or deployment.

## Schema and development

The `migrate` Compose service runs `backend/cmd/migrate` against the embedded SQL history in `backend/migrations`. `make migrate` applies pending migrations to the configured database; do not use it to prepare disposable tests against the development database.

Use `make dev-up` and `make dev-watch` for the development stack. Vite preserves component state through Fast Refresh; Compose Watch updates the Go API. Worker source changes require a worker image rebuild. Consult the current Compose files before relying on an older migration or deployment recipe.

For an explicitly requested production deployment, use [production operations](../production-backend.md) or [GitHub deployment](../github-deployment.md). Current source/configuration is authoritative; historical test totals are not proof of current parity or live provider success.
