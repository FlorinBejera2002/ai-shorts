# Project instructions

## Notion task tracking

Every project work item must have a ticket on the **Sneep Cut > IT** board in Notion. Before starting work, update the matching ticket or create one if none exists. Keep its status current, and when the work is finished and verified, move the ticket to **Done**.

## Working approach

- Treat requests for changes as authorization to implement and verify them. Resolve routine choices from the existing code and task context; ask only when missing information materially changes the outcome. Continue independent, authorized work while awaiting an answer.
- Completion means the requested behavior is implemented, relevant checks have run, and failures caused by the change are addressed. When the task includes running the app, inspect the result and fix issues before handing it back. Report any remaining blocker or skipped verification explicitly.
- Preserve unrelated working-tree changes. Prepare a concrete, reviewable result before requesting any additional approval; do not add approval pauses for routine local edits or checks. Deployment and destructive data operations require authorization for that action.
- Give concise updates and a final account of what changed, what was verified, and any remaining limitations. Use plain language and concrete evidence.

## Context and skills

- Read the files and documentation needed for the current task. Do not load a full repository map or every design and verification document before a small edit.
- Use skills only when their workflow fits the task. User instructions take precedence over skill guidelines. If a skill blocks progress, identify the exact file and instruction and explain why it applies.
- Keep any new repository skill narrowly scoped, with a short description and supporting references loaded only when needed. Avoid duplicating general coding guidance or prescribing a fixed itinerary for every change.
- Historical plans in `docs/superpowers/` record earlier designs and implementation steps. Consult them for relevant context; their checklists, skill names, and example commands are not standing workflow requirements. Verify assumptions against current code.
- Delegate only when an independent, bounded subtask would save time or improve quality and collaboration tools are available; keep small tasks local.

## Verification

- Choose checks that exercise the changed behavior. Add regression coverage for meaningful bugs or behavior changes; do not add tests that merely restate a documentation or trivial edit. After relevant checks pass, expand or repeat them only for a new change, failure, or unresolved concern.
- For local setup and available commands, consult [README.md](README.md) and [Makefile](Makefile) when needed. `make check` is an aggregate check, not a prerequisite for every edit; it does not run Python tests.
- For backend changes, run affected tests with `python -m pytest backend/tests/<path> -q` in the backend environment. For database or browser integration work, consult [frontend-backend-verification.md](docs/frontend-backend-verification.md) for isolated fixtures and prerequisites. Missing dependencies or skipped integration tests do not count as a pass.
- Run and rerun affected tests using mocks or disposable local fixtures without asking at every step. Database integration tests must use the dedicated local `sneepcut_integration_test` database; browser mutations must use an isolated database and synthetic account. Local development database and media volumes are persistent user data, not disposable test fixtures.
