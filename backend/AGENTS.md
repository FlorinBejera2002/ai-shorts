# Go backend structure

- Use the current Go architecture described in `README.md` and the isolated
  verification guidance in `../docs/frontend-backend-verification.md`.
- Keep `cmd/api` for startup/dependency wiring and `internal/httpapi` for routing
  and shared HTTP middleware. Add domain code in focused feature packages under
  `internal/`, with their handlers, services, repositories and tests.
- Do not accumulate domain features in one `api.go`, `helpers.go`, `models.go`,
  `internal/httpapi` or `internal/data` package. Split by responsibility as code
  grows; add subpackages when warranted, not empty speculative layers.
- Implement and verify behavior against the current Go/Vite source and the
  documented contracts; do not use the removed Python/Next.js stack as a runtime reference.
- Run relevant Go tests and `go vet ./...`; use race checks for concurrency work.
  The root instructions on Notion tracking and isolated databases still apply.
