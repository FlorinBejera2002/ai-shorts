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

### Scripts redesign

`frontend/tests/scripts-layout.browser.mjs` requires a running local Vite frontend, installed Google Chrome, and an installed Playwright module. Reuse the current frontend server; when none is running, start it with `npm --prefix frontend run dev -- --host 127.0.0.1 --port 5173 --strictPort`. No database, provider credentials, or real account is needed: authentication and every API request use synthetic fixtures.

Run from the repository root in PowerShell, setting the module path to the installed Playwright entry point:

```powershell
$env:PLAYWRIGHT_MODULE = 'C:\path\to\playwright\index.mjs'
$env:FRONTEND_ORIGIN = 'http://127.0.0.1:5173'
$env:RUN_FAST_REFRESH = '1'
node frontend/tests/scripts-layout.browser.mjs
```

The runner checks library search/archive visibility, draft creation, generation/loading/errors, autosave retry, scene editing/order/deletion, version restore, clipboard/JSON download, Coach controls, responsive themes, and dashboard DOM identity. `RUN_FAST_REFRESH=1` also checks preserved script and scene state by temporarily editing `script-scene-editor.tsx`, then restoring its source and timestamps in `finally`; run that probe after concurrent source edits have finished.

Screenshots and JSON reports are written to `frontend/test-results/scripts-layout/`. To rerun a focused flow, set `SCRIPTS_SCENARIOS` to `library`, `generation`, `document`, `coach`, `responsive`, or `refresh` (comma-separated combinations are supported). Focused reports have a scenario suffix and preserve the full-suite `report.json`. A run without `RUN_FAST_REFRESH=1` explicitly reports that verification as skipped.
