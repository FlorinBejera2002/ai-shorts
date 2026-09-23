# Workspace agent operation coverage

The workspace agent uses a server allowlist. An advertised unavailable capability
is a limitation, never a promise that an operation has run. No arbitrary HTTP,
SQL, shell, provider credentials or local media paths are exposed to the model.

| Workspace | Agent coverage | Manual operation / remaining seam |
| --- | --- | --- |
| Navigation | Allowlisted links to dashboard, create, clips, scripts, Studio, brand, publishing, calendar, settings and billing | Reports a page ready to open; does not claim navigation already occurred |
| Projects | Recent owner-scoped project inventory, clip counts and conditional rename with undo | Rename uses shared manual validation, timestamp revision checks and atomic request receipts; folders, move and delete remain manual |
| Create / import | Empty multi-source story draft creation and user-selected video uploads inside the chat | Uploads reuse Story Builder validation and concurrency limits. URL import, documents, images and audio attachments are not connected |
| Stories | List, inspect, create draft, generate, revise, poll and cancel own queued generation | Sources must already be uploaded. Asset mutation, locks, rollback and delete remain manual |
| Scripts | List, inspect, create draft, replace document using expected revision | Draft creation uses run ID as resource ID; retries compare original document. Updates use revision checks and durable execution marker. Manual history remains available |
| Clips | Owner-scoped inspection, conditional trim and recut through the existing worker | Exact request replay, stale-state rejection and cancellation fencing. Completion verifies worker output namespace, size and duration metadata; no storage HEAD or semantic review. Story-owned clips, styling, transitions and delete remain manual |
| Studio | Unavailable capability with explanation | Separate Studio origin, session and document protocol require an authenticated command bridge |
| Brandkit | Read saved colors, fonts, subtitle and watermark settings | Private media references are omitted. Mutations remain manual |
| Publishing / Calendar | Unavailable capability with explanation | Provider account consent, media validation, scheduling and provider-specific options remain in manual UI |
| Dashboard analytics | Owner-scoped credits, project, clip and active script counts | No social engagement analytics or invented performance metrics |
| Account / billing / administration | No agent mutations | Account deletion, plan changes, payment and privileged administration remain manual |

Generation is asynchronous. A run succeeds only after the story has a newer
accepted rendered version with a ready review. `needs_review`, cancellation,
failure, a superseding request or retention of an old version are not success.
Cancellation is fenced by the original request ID inside the domain transaction.
Story generation reserves at most 10 credits under existing domain rules;
revisions of an existing story reuse its reservation.

Scripts share manual input validation. A script mutation is never retried against
a newer revision. Story creation and generation retain existing repository
idempotency checks. Destructive or externally visible publication is not enabled.
Script update results include a server-produced undo receipt containing the prior
document and version plus the resulting revision. Undo is dispatched only from
that persisted receipt and refuses to overwrite a later edit. It restores title,
settings and content together. The restore action is absent from the model catalog.
Manual story rollback remains available; other actions have no generic undo.

The right panel supports persisted history, paginated older messages, live run
steps, approvals, pause/resume/stop, RO/EN dictation and explicit opt-in navigation.
Uploads remain user-selected and pin their story target until they finish. They
do not automatically resume a run waiting for resources. Browser dictation uses
the browser's speech service and submits nothing until the user sends the text.

This is partial implementation of the full Notion specification. Studio command
execution, publishing/calendar mutations, broad brand/project management, richer
resource types, automatic resource-resume, inline media review and full acceptance
scenario verification remain outstanding. The tracking ticket must remain open.

Project rename also returns a persisted undo receipt. Both directions compare the
observed project timestamp, so concurrent manual edits and worker updates force a
refresh. Original NULL names are restored exactly. Planner inventories query only
bounded summary columns rather than loading script snapshots or source assets.

Unit coverage checks input rejection, sanitized context and capability limits.
Database regression tests use `internal/testdb` and therefore require the dedicated
`sneepcut_integration_test` database; skipped database tests are not verification.

Verified native media workflow (2026-09-23):
`TestWorkspaceStoryConversationActualMedia` passed both scenarios against the
disposable integration database and temporary storage. The same authenticated
conversation creates a draft, pauses for resources, rejects premature resume,
accepts ten FFmpeg-generated recordings through the real story inspection API
plus an owned logo, resumes, applies branding, waits for credit approval, and
runs the production story Builder/Runner/Processor. The resulting 35-second MP4
has audio/video streams and pixel-verified burned captions and logo; successful
review exposes a signed export and completes the agent run. The negative case
uses an unavailable media reviewer and preserves `needs_review` without an agent
completion claim. Both cases charged exactly ten credits. This test uses clearly
labeled deterministic transcription/planning/reviewer fixtures over synthetic
tone footage; it does not establish live-model semantic editing quality.
