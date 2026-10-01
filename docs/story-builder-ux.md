# Story Builder interaction design

Research and implementation: 30 September 2026.

The audience is a person assembling their own clips, without editing terminology or technical configuration knowledge. The creation flow groups related decisions into four steps: footage, story/audio, appearance, and confirmation. Each step has a clear heading and back/continue controls. Confirmation shows the cost and selected inputs before processing.

## Sources and decisions

- [GOV.UK: Question pages](https://design-system.service.gov.uk/patterns/question-pages/) recommends starting with one question per page, clear headings, a continue action, and a way back without re-entering answers. We group closely related choices rather than introducing a separate page for every checkbox.
- [Nielsen Norman Group: Progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/) distinguishes sequential task steps from advanced options shown on request. Clip-specific preferences and advanced settings remain available, but are closed initially.
- [Nielsen Norman Group: Tooltip guidelines](https://www.nngroup.com/articles/tooltip-guidelines/) supports brief supplementary explanations. Info buttons sit beside their headings. Labels, errors, processing cost, and information needed to proceed remain visible.
- [W3C: Content on hover or focus](https://www.w3.org/WAI/WCAG21/Understanding/content-on-hover-or-focus.html) requires additional hover/focus content to be dismissible, hoverable and persistent. Help must also work by tapping on touchscreens, with Escape dismissal on keyboards.
- [React: Preserving and resetting state](https://react.dev/learn/preserving-and-resetting-state) explains state preservation by tree position. Step changes retain the project state; recording and upload work must not be accidentally discarded by switching views.

The application retains its existing typography, black primary actions, neutral hover colors and shared corner radii. A compact creation-mode bar replaces the tall promotional header, bringing the current step higher on mobile. Source roles use familiar wording rather than A-roll/B-roll. The result remains the primary content after generation, with source details available separately. Quality issues stay visible; the detailed checklist opens on request.

These changes apply to Story Builder and its narration flow. They do not constitute a redesign of every dashboard page or a usability study with nontechnical participants.

## Verification and boundaries

Frontend typecheck and scoped Story component lint passed after the final draft-state guard. The creation page has one pre-existing lint warning in the legacy import workflow's query-parameter synchronization effect.

Browser checks use synthetic accounts, mocked APIs and a fake microphone:

- Existing five- and ten-file Story flows passed, retaining upload validation, exact generation manifests and editing assertions.
- Narration capture and the narrated editor passed, including microphone cleanup on route exit, retry/replacement and playback intervals.
- The wizard passed Back/state restoration, save-before-project-switch protection, confirmation-only generation, keyboard heading focus and help hover/focus/click/touch/outside/Escape checks.
- Wizard, dashboard sidebar and header DOM identities and sidebar state survived creation-mode round trips.
- Desktop, 390px and 320px layouts were exercised; Romanian confirmation was inspected at 320px. Screenshots remain under `.cache/story-wizard-evaluation/`.

React Doctor changed-scope scan covered nine tracked files and returned 69/100, not a clean pass: three complexity warnings, an existing React Compiler limitation around `try/finally`, and callback-effect synchronization warnings. The original source already used the async `finally` cleanup and parent upload-status notification; these were retained. A corresponding notification now prevents losing unsaved options. Browser coverage verifies the resulting navigation guards rather than suppressing these diagnostics. The previous task's 98/100 scanned only the editor and is not a comparable baseline. New untracked components are included in TypeScript and scoped lint verification.

The initial design task included no production deployment, paid AI call, real-account mutation or backend change. The contextual-help follow-up below also updates the Workspace Agent backend.

## Desktop layout follow-up

The desktop workflow now fills the available workspace instead of nesting 5xl and 3xl width limits. At 1024px and above the steps form a compact 11rem side rail; the active step uses the remaining width. Recordings use a responsive grid with a 21rem minimum card width. The project picker has an explicit width so the shared select rule cannot push New story onto a separate line. Narration and confirmation use parallel panels on wide screens. Mobile retains the horizontal step indicator and single-column flow. React Doctor remains at 69/100 with the same diagnostics, without a new diagnostic from this layout change.

Verified with 14 synthetic clips at 1366px and 1600px, sidebar expanded and collapsed: the wizard fills its workspace in all four cases, displaying two or three source columns without horizontal overflow. Source upload/edit regression and the wizard mobile/state/help regression passed. Typecheck and scoped lint passed; desktop and mobile screenshots were visually inspected.

## Lighter interface and contextual help

The next iteration reduces repeated section headings and secondary explanatory paragraphs, retaining field labels and optional help. Following user review, card borders were restored: the requested simplification concerns redundant content, not removing useful visual boundaries. The subsequent explicit Gooey Nav request replaces the left-hand step-button styling as described below. Processing errors, unsaved changes, recording state, and the generation cost remain visible.

Workspace Agent provides explanations on request. Opening contextual help must not send a request, start generation, or discard a message already being composed. Product guidance must distinguish saved project data from the current presentation step, explain narration and caption behavior without promising perfect AI results, and avoid treating a question as permission to edit a project.

## Vertical Gooey Nav

At the user's request, desktop step navigation uses [Rare UI Gooey Nav](https://www.rareui.com/components/gooeynav), based on its [published source](https://github.com/swamimalode07/rare-ui/blob/main/components/ui/gooey-nav.tsx). The existing shared component now supports a vertical axis: seam curves, gradient direction, animated spacing and open corner radii transpose together, while labels stay horizontal. It keeps the reference spring (stiffness 200, damping 28, mass 1), separation and pinch geometry. The selected step separates from the connected group with the platform's black selection color. Mobile uses the horizontal orientation. Disabled steps, keyboard focus, `aria-current="step"` and reduced-motion behavior remain supported. Calendar consumers retain the default horizontal orientation.

### Follow-up verification

Final TypeScript and scoped lint checks pass. Browser regression uses synthetic accounts and mocked APIs: contextual help does not send automatically, existing message drafts survive, help carries only its topic/step rather than an unrelated project or attached resources, and the composer receives/restores focus on desktop and mobile. Wizard navigation retains disabled-step guards, keyboard operation and saved form state. Fourteen-source desktop layouts retain two or three columns without overflow; Romanian mobile was inspected at 320px. Screenshots are in `.cache/story-wizard-evaluation/context-help-*`.

The broader Workspace Agent browser flow also passes, covering attachments, idempotent retries, approval revisions, opt-in navigation, mobile dialogs, previews and preference/history controls. Nine agent unit tests and two rendered Gooey Nav compatibility tests pass, including the default horizontal Calendar semantics. Final screenshots wait for the spring gaps to settle; browser checks reject invalid SVG coordinates and verify connected inactive segments.

Workspace Agent integration tests passed using the dedicated PostgreSQL test database and mocked planning responses. Explicit help rejects actions, resource requests, continuation and proposal acceptance, including at runtime dispatch. Generic help avoids inventory queries. Native FFmpeg fixture reruns and Go vet passed. The local API was rebuilt/restarted and readiness, authenticated route existence and the create page were checked; frontend was not restarted. No paid AI provider was called, so real-model answer quality is not an acceptance result of this change.

React Doctor scans 13 tracked files now, versus nine in the earlier 69/100 scan, and reports 67/100. This is not a clean pass. The Story Builder compiler/effect diagnostics remain; the expanded scope also includes the existing large WorkspaceAgent component and the shared component's existing full Framer Motion import. The new segment complexity finding was resolved by separating SVG seam rendering from animated segment layout. No diagnostics were suppressed and no new animation dependency was introduced.

## Story processing stages

The processing view reuses the link-generation orbital animation and animated stage transitions through `ProcessingPipeline`. Link jobs retain their seven stages and server-reported percentage; Story projects use five checkpoints: queue, source analysis, story construction, editing and review. Story progress is indeterminate because the project API reports a stage, not a percentage.

Automatic improvement is a separate focus state, not a guaranteed sixth checkpoint. Backend repairs can happen before the first render or after a review, so improvement does not imply editing or review has completed. A return to editing or review updates the active checkpoint. Ready, Needs review, failed and cancelled remain distinct terminal states, with activity animations stopped. Backend explanations about retaining an earlier version remain visible. The cancellation action retains its original handler and pending guard. Story-specific CSS keeps the shared radius tokens, neutral colors and readable mobile labels.

Verified with four component mapping tests and a mocked browser workflow using actual Story polling, including pre-render and post-review improvement, terminal states and a server-gated cancellation. English and Romanian 320px layouts, reduced motion and desktop captures were inspected in `.cache/story-processing-evaluation/`. The existing link workflow retained download 18%, transcription 42% and completion 100%. Typecheck and scoped lint passed. React Doctor remains 67/100 with an expanded 15-file scope; its existing complexity/compiler/effect and full Motion import diagnostics are not treated as a clean pass. No backend changes, paid processing or real-account mutations were needed.
