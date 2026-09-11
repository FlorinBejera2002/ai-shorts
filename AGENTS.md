# Project instructions

## Notion task tracking

Before starting every new project task, create a new ticket on the **Sneep Cut > IT** board in Notion, even when a matching or related ticket already exists. Do not reuse or repurpose an existing ticket for a new task. Keep the newly created ticket's status current as work progresses, and when the task is finished and verified, move that ticket to **Done**.

## Working approach

- Treat requests for changes as authorization to implement and verify them. Resolve routine choices from the existing code and task context; ask only when missing information materially changes the outcome. Continue independent, authorized work while awaiting an answer.
- Completion means the requested behavior is implemented, relevant checks have run, and failures caused by the change are addressed. When the task includes running the app, inspect the result and fix issues before handing it back. Report any remaining blocker or skipped verification explicitly.
- Preserve unrelated working-tree changes. Prepare a concrete, reviewable result before requesting any additional approval; do not add approval pauses for routine local edits or checks. Deployment and destructive data operations require authorization for that action.
- For frontend component edits, preserve component-scoped Fast Refresh: changing one component must update that boundary without restarting the frontend container or reloading the whole page. Verify state is preserved when changing reload or development-server behavior.
- Always write clean, readable, well-structured code. Give components clear responsibilities, use descriptive names and explicit interfaces, and reuse shared components for repeated behavior or presentation. Separate UI, state, and data access where it improves clarity; avoid duplicated code, oversized components, and unnecessary abstractions.
- Follow the project's documented architecture and component conventions, and consult the relevant official framework/library documentation when implementing or changing their usage. Keep component boundaries, composition, and file organization consistent with those conventions.
- Give concise updates and a final account of what changed, what was verified, and any remaining limitations. Use plain language and concrete evidence.

## UI corner radii

- The platform's default corner radius is `rounded-md`. Use the shared radius tokens (`--radius-md`, `--radius-sm`) in CSS instead of hard-coded pixel values.
- Keep these component conventions consistent:

  | Element | Radius |
  | --- | --- |
  | Cards, dashboard headers, save bars, upload areas, inputs, buttons and select triggers/popups | `rounded-md` |
  | Brandkit logo/font, colors, subtitles, watermark and preview cards; video preview canvas | `rounded-md` |
  | Inset color swatches, menu items, small text badges and preview-stage interiors | `rounded-sm` |
  | Avatars, circular icons, status dots, slider handles and progress bars | `rounded-full` |

- Reuse the shared `Card` default. Do not add `rounded-lg`, `rounded-xl`, larger radii or pill-shaped text badges as decoration. Preserve a larger radius only for an explicit component-specific design exception or user request, and document that exception here.

## UI interaction colors

- Use a subtle neutral gray (`bg-muted` with normal foreground text) for hover and highlighted states on selects, dropdown menus, secondary controls and similar choices. Do not use blue or the primary brand color for hover decoration.
- Reserve the primary color for selected states, primary actions and keyboard focus indicators where it communicates state or accessibility.

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
