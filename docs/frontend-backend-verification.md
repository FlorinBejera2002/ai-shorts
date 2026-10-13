# Frontend/backend verification

The current application uses Vite/React, the Go API and Go media worker, PostgreSQL, Redis and Nginx. Use the root [README](../README.md) for setup and hot reload, and the [backend README](../backend/README.md) for Go package boundaries.

## Local checks

From the repository root:

```sh
make typecheck
make lint
make test-frontend
make test-go
make storage-check
```

`make test-go` uses the shared `.cache/go-build` directory. For a focused Go package, run `go test ./internal/<package> -count=1` from `backend`; use race checks for concurrency changes. Frontend commands are defined in `frontend/package.json`.

## Database fixtures

Use only the dedicated loopback database `sneepcut_integration_test`, never development or production databases. Configure `SNEEPCUT_TEST_DATABASE_URL`. Domain fixtures in `backend/internal/testdb/postgres.go` also require `SNEEPCUT_TEST_SCHEMA_SQL` containing SQL for the current schema. Migration tests in `backend/internal/migrate` exercise the embedded SQL chain. Both use isolated schemas and clean up their own fixtures.

A skipped database test is not a pass. Some Python integration runners still reference the removed stack; inspect a runner's prerequisites against current source before using it as verification evidence.

## Browser verification

Use mocked APIs or a synthetic account backed by an isolated database. Read the specific runner in `frontend/tests/*.browser.mjs` for its environment variables, Playwright module, origin and media prerequisites; do not reuse old Next.js/Auth.js setup commands.

For component changes, verify Fast Refresh preserves state. For navigation changes, verify DOM identity and sidebar/header state. Do not restart the shared frontend or reload the page as a substitute for these checks.

Keep temporary outputs in `.cache/tmp/` and remove them in `finally`; screenshots/reports go to ignored `frontend/test-results/`. Preserve originals and database/media volumes. Provider calls, publishing and deployments require their own authorization and verification.
