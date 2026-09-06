# Go backend structure

- Use the cleaned example foundation described in `README.md` and follow the
  steps in `../docs/go-migration/backend-go-migration.md`.
- Keep `cmd/api` for startup/dependency wiring and `internal/httpapi` for routing
  and shared HTTP middleware. Add domain code in focused feature packages under
  `internal/`, with their handlers, services, repositories and tests.
- Do not accumulate domain features in one `api.go`, `helpers.go`, `models.go`,
  `internal/httpapi` or `internal/data` package. Split by responsibility as code
  grows; add subpackages when warranted, not empty speculative layers.
- The old Go experiment is deleted. Implement and verify each migrated behavior
  against the current Python/Next.js source and the agreed contracts.
- Run relevant Go tests and `go vet ./...`; use race checks for concurrency work.
  The root instructions on Notion tracking and isolated databases still apply.
