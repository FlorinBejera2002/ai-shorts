# Workspace Agent

The dashboard mounts one persistent agent panel outside the changing route
content. It uses the authenticated Go API for durable execution. Closing the
panel or leaving the page does not own or cancel a server operation.

## Execution contract

`POST /api/workspace-agent/runs` accepts a client UUID, user message and selected
route/resource context. Reusing the UUID with identical input returns the same
run; changing its input conflicts. The client cannot submit arbitrary actions.
The planner receives bounded owner-scoped context and an explicit capability
catalog. Each response selects one typed action or returns an answer/clarification.
Multi-step requests can execute up to eight verified actions.

The executor reuses domain validation, ownership, optimistic concurrency and
worker queues. Model output cannot invoke arbitrary URLs, SQL, shell commands or
internal restore operations. Expensive operations wait for explicit approval of
the persisted action and current run revision. An approval is never silently
reapplied after a conflict.

Two bounded runtime workers claim due operations using per-user PostgreSQL
advisory locks. Dispatch is checkpointed before domain execution. A crash with an
uncertain dispatch fails visibly instead of blindly repeating a side effect.
Domain request receipts protect retries where supported. Pending workers are
polled on a five-second schedule; unchanged receipts do not increment revisions
or append audit events. Every changed checkpoint uses revision comparison.

Pause prevents subsequent steps but cannot suspend an already executing FFmpeg
process. Late results retain the user's paused/stopping state. Stop fences the
specific domain request; it never cancels a newer unrelated request. Script
replacement and project rename provide persisted, revision-checked undo receipts.
Other operations do not advertise generic undo.

Session validity, account role and deletion state are checked before continuing
execution. API reads and writes are owner-scoped. Logs omit prompts, provider
secrets and private asset paths. Account export includes user-visible run history
and suggestions, excluding session and worker internals.

## Client behavior

History is paginated and merged by revision. The panel preserves composer state
and shared dashboard DOM identity across navigation. Follow-navigation is an
explicit option and does not replay links from initial history. Result routes are
allowlisted. Mobile uses a dialog with focus restoration; desktop is resizable.

Speech recognition uses the browser service and only fills the composer. Uploads
reuse the Story Builder pipeline, validate chosen video files and pin the target
story until upload completion. Unsupported browser speech has a text fallback.

## Verification and running

Migrations `037_20260922_workspace_agent.sql` and
`038_20260923_project_agent_edits.sql` follow Story Builder migration 036. They
must be applied using the normal migration runner before starting the rebuilt
API. This implementation does not apply migrations to persistent development or
production data automatically. No new frontend secret or provider credential is
required; the planner uses the existing configured generator.

Backend integration tests require `SNEEPCUT_TEST_DATABASE_URL` pointing to the
dedicated `sneepcut_integration_test` database and `SNEEPCUT_TEST_SCHEMA_SQL`
pointing to the complete ordered migration fixture. Use a disposable instance.
Run affected packages with `go test -race` and run `go vet ./...`.

Frontend checks are `node --test tests/workspace-agent.test.mjs` and
`npx tsc --noEmit` from `frontend`. The browser scenarios in
`frontend/tests/workspace-agent.browser.mjs` mock API responses using a synthetic
account; they verify client behavior, not a live provider/render end-to-end run.

Database regressions cover idempotency, ownership, permission revocation, stale
approvals, pause/stop races (including pause followed by stop while dispatch is
in flight), malformed planner responses, uncertain dispatch, multi-step
execution and undo for maximum-length Unicode messages.
Clip adapter tests exercise the real worker claim/completion transaction and
cancellation fencing. Their output checks are persisted metadata checks, not
storage existence or semantic video review.

See [operation coverage](workspace-agent-coverage.md) for supported actions and
outstanding requirements. This does not yet satisfy the complete Notion ticket.
