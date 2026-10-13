# Workspace Agent operation coverage

This inventory was checked against the current Go action catalog, domain services,
frontend controls and Studio command bridge on 2026-10-13. The runtime catalog is
authoritative: an unconnected service is reported as unavailable and cannot be
executed. Historical acceptance checklists are not capability inventories.

| Area | Executable capabilities | Boundary |
| --- | --- | --- |
| Projects and library | List, inspect context, rename, local project brand, folder create/update/delete, move clips | Owner-scoped IDs; inspected revisions protect manual edits |
| Sources and resources | Discover uploaded source metadata, list/read registered logos, documents and publishing media; upload video/logo/document/publishing media in context | Files are selected by the user; arbitrary paths and credentials are never model inputs |
| Processing | Create clips from uploaded video or explicit URL, list/get jobs, cancel an inspected job | Actual job states and domain cancellation are authoritative; generation keeps existing credit approval |
| Stories | Create/list/get, settings/assets/locks, generation/revision/restyle, rollback, remove source, cancel and delete | Current source order/caption defaults apply; destructive deletion requires contextual approval |
| Scripts | Generate, create/read/update, archive, version history/restore, JSON export | Generated content remains unsaved until a write succeeds; downloads are not claimed as saved on the device |
| Clips and subtitles | Filter/list/get, metadata/transcript, trim/recut, style/captions, transitions, move/delete, verified export | Editing transcript metadata is not word-timing regeneration. No SRT/VTT or per-word timing endpoint exists in the current app |
| Brandkit | Read/update colors, preset fonts, subtitle/watermark settings, global logo; project-specific brand/logo | A project request does not change the global brand; custom font upload is not a current Brandkit endpoint |
| Studio | Project discovery/create/inspect, selected layer context, geometry/text/audio edits, split/remove layer, AI composition revision, asset list/get/copy/rename/delete, render/list/export/delete completed output | Authenticated bridge validates ownership, document versions, file hashes and durable receipts. Contextual uploads accept image/video/audio/font files and resume only after a newly saved owned asset is verified. Active render outputs cannot be deleted. CSS/font/dynamic asset references are explicitly marked as an incomplete impact analysis in deletion approval |
| Calendar and publishing | Draft list/get/create/update/delete, attach media, connected accounts and current provider options, schedule/reschedule/unschedule/publish, status and disconnect | Local calendar drafts work without a social provider handler. External actions require exact contextual approval and saved provider declarations; OAuth remains user-mediated |
| Navigation, preferences, analytics | Allowlisted page links, application preferences, profile name, internal counts/activity, agent run controls | Follow navigation is opt-in. Account security, payments and provider credentials remain in their dedicated flows |

## Conversation and execution

The planner receives the current page and selected project/clip/Studio layers,
owned inventory, attached resources, verified steps and six bounded prior turns.
Prior results carry safe target references; they do not grant permission or supply
a current mutation revision. Every subsequent write must inspect current state.
Prior conversation is capped at 20 KB. Failed and partial requests retain verified completed steps so follow-ups do not
blindly repeat effects. Cleared history and other accounts are excluded.

Ordinary authorized reversible writes execute directly. Cost, external and
destructive operations use the existing contextual approval and revision checks.
The runtime only completes after a service receipt confirms completion. Pending,
cancel-requested, failed and uncertain outcomes remain distinct. UI shimmer tracks
real requests/runs, stops at completion/error/connection failure and respects
reduced motion. There is no simulated streaming.

Ambiguous submissions retain the exact request identity and original payload,
including across navigation and draft edits. Controls submit the observed run
revision and reconcile after failures instead of silently replaying approvals.
The dashboard shell stays mounted, preserving the conversation, composer and
sidebar. New output follows the bottom only while the reader is already there.

## Verification and limits

Go integration tests use disposable schemas in the dedicated
`sneepcut_integration_test` database. Actual-media tests use FFmpeg and synthetic
sources with deterministic planner/reviewer fixtures; they do not measure live
model quality. Browser tests intercept all APIs with synthetic accounts and cover
compact/contextual controls, response loss after commit, approvals, previews,
reconnect, scrolling, mounted navigation, Fast Refresh, keyboard, mobile, dark
mode, Romanian locale and reduced motion. Studio bridge tests exercise document
concurrency, file mutation guards and real FFmpeg output; they do not evaluate
creative quality. See [workspace-agent.md](workspace-agent.md) for commands.

Live OAuth, real social publication, live model semantics and arbitrary device
microphones require separate verification with configured services. Neither a
mock success nor a verified output file proves provider delivery or visual quality.
Automatic Studio upload resumption inspects at most 2,000 assets and reports a
specific limitation above that bound; ordinary asset discovery remains paginated.
Studio z-order, grouping, keyframes and animation changes use the real composition
revision service with validation, version checks and Undo; they have no dedicated
deterministic tools. Raw file-tree folders/moves/source editing, clipboard actions
and cleanup of failed/partial renders remain in the Studio UI. The Sneepcut Studio
project service currently has no project rename/delete endpoints.
On Windows, ten shared Studio path-safety/render tests are explicitly skipped when
the environment cannot create symbolic links; other shared route tests and the
agent's ownership/version/file verification tests run normally.

Verification on 2026-10-13: the complete Workspace Agent and publishing Go suites,
focused source-logo/migration/account tests, `go vet ./...`, and Linux `-race`
tests for agent/job concurrency passed. The Studio bridge passed eight tests
(81 assertions); shared routes passed 119 tests with the ten Windows skips above.
Frontend typecheck, scoped lint and 21 focused tests passed. The last completed
React Doctor scan scored 67/100 with no errors and two `no-pass-data-to-parent`
warnings for synchronizing verified receipts; a later scan was stopped after it
stalled while scanning the existing Story components.

The final full browser run passed the contextual uploads, original-payload retry,
multi-step results, preview, approval, reconnect, bottom-follow scrolling, stable
shell/sidebar/draft, mobile focus, Romanian locale, dark mode and reduced-motion
checks. Fast Refresh was verified separately on the final component source.

The final component-refresh probe preserved the actual composer, dashboard,
sidebar and header nodes, the unsent draft and document navigation count. After
the development server was independently restarted during verification, requests
for `/src/index.css` delayed page load and HMR; the successful final probe allowed
90 seconds per refresh. The latency itself is an environment limitation, not a
claim of instantaneous refresh.

Under concurrent media-test load, Studio's original five-second test deadlines
expired and fixture cleanup interrupted outstanding requests. The suite uses an
explicit 30-second timeout for this verification. One subsequent fixture-creation
failure lacked response diagnostics and did not reproduce in the isolated or
complete rerun; tests now preserve its HTTP status/body if it recurs.

UI interaction references: [AI Elements Conversation](https://elements.ai-sdk.dev/components/conversation),
[Shimmer](https://elements.ai-sdk.dev/components/shimmer), [Tool](https://elements.ai-sdk.dev/components/tool),
and [Motion useReducedMotion](https://motion.dev/docs/react-use-reduced-motion).
AI Elements is [Apache-2.0](https://github.com/vercel/ai-elements/blob/main/LICENSE);
Motion is [MIT](https://github.com/motiondivision/motion/blob/main/LICENSE.md).
The interface uses original local components and the existing Framer Motion
dependency; no AI Elements source was copied and no new dependency was installed.
