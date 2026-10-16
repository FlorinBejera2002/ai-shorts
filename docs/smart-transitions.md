# Natural transition analysis

The initial Go generation pipeline enables natural transitions for every selected
clip. Highlight-provider fade/dissolve suggestions no longer select a decorative
effect for the entire clip. Explicit legacy render styles remain supported.

## Shared Studio picture transitions

Generated montages and Story scenes use a 300 ms smooth dissolve around eligible
cuts in the main Studio. The blend is shortened for short shots and omitted for
continuous source windows, explicit hard cuts, legacy fades, and boundaries with
an approved interpolation bridge. Scene start times and the total duration do not
move; speech and caption timing remain unchanged.

The canonical plan stores `transition_in` on the incoming scene. Studio derives
picture-only overlays from the current neighboring source windows, including
manual trims and reordering. Before the cut it blends in the incoming first
selected frame; after it, it blends out the outgoing last selected frame. It does
not reveal excluded source frames or overlap spoken audio. The source hosts,
captions and audio remain editable. Preview and export share this same lowering
and easing, without a second montage backend.

New Story outputs record their native transition policy. The improvement action
does not report a change for an already-smoothed default transition; old natural
cuts and explicit cut/fade scenes can still be upgraded to `crossfade`. Existing
MP4 exports are not rewritten merely by opening the library.

## Decisions and rendering

- Selected source windows are copied before modification. Cuts inside words can
  expand to word boundaries; a small omitted gap inside one word is closed
  without repeating the word. Subtitle remapping uses the resulting windows.
- Each adjacent pair receives a continuity score, visual similarity, motion and
  camera-translation estimates. Nearby motion candidates are considered only in
  transcript silence and only when they improve visual similarity.
- Beat candidates require repeated, regularly spaced audio onsets outside
  speech. Alignment cannot cross speech or reduce visual continuity.
- Face tracking crops in source coordinates and receives composed boundary
  times. It resets to the incoming subject at a cut, instead of carrying the
  outgoing source's framing. Measured improvement after cropping is recorded.
- A difficult, silent join can be sent to the configured text AI for semantic
  approval. An approved candidate uses FFmpeg motion-compensated interpolation
  for a 200 ms visual bridge. This is AI-selected local interpolation, not a
  neural video-generation service. At most one bridge is used per clip. A
  continuity/overshoot gate rejects unhelpful output, retaining the normal Studio transition.
  Source audio and timeline duration are preserved by visual bridging.
- Missing visual evidence, tracking models, model advice, or rejected bridges
  retain the normal source edit and native picture transition. Cancellation is
  still propagated.

The quality gate is conservative and heuristic. Representative footage review
is still necessary for tracking accuracy and subjective edit quality; numerical
checks cannot prove the absence of every visible artifact.

## Improvement action and persistence

`POST /api/clips/:id/transitions` uses the existing authenticated, member-only,
rate-limited edit reservation/worker queue, also used by the workspace agent.
The former clip detail editor has been removed: manual editing opens the main
Studio directly from the unified clip library. Automatic revisions render through
that same Studio composition service.

The private `clips.transition_state` JSON preserves the original source windows,
word timings, render settings, and decisions. It is excluded from clip API
responses. Reanalysis keeps high-scoring boundaries, and identical results reuse
the existing output without re-encoding. Changed results render only that clip;
other clips, transcription, and highlight selection are not regenerated. A
changed clip is currently re-encoded as a whole, not packet-spliced at each join.
Branding, subtitles, and the platform-clean variant are retained. Manual trim
and recut invalidate the saved recipe so improvement cannot undo manual edits.
Older clips without a saved recipe do not expose the action.

Apply migration `035_20260922_smart_transitions.sql` before deploying the changed
API and worker. It adds the private recipe and permits the transition edit kind.

## Verification

- Go tests: `go test ./internal/processing ./internal/clips ./internal/worker ./migrations -v` from `backend`.
- Static analysis: `go vet ./...` from `backend`.
- Real media tests require `ffmpeg` and `ffprobe` on PATH.
- Database tests require the dedicated loopback `sneepcut_integration_test`
  database and current migration SQL via `SNEEPCUT_TEST_DATABASE_URL` and
  `SNEEPCUT_TEST_SCHEMA_SQL`. They create disposable schemas.
- Frontend: `npm run typecheck`; use the project's React Doctor regression check.
- Browser: start Vite on port 5188, set `PLAYWRIGHT_MODULE` to an installed
  Playwright entry point, and run `node tests/studio-workspace.browser.mjs` from
  `frontend` to check library-to-Studio handoff. The script uses synthetic data
  and mocks all API requests; Go tests cover automatic transition behavior.

FFmpeg filter reference: <https://ffmpeg.org/ffmpeg-filters.html#minterpolate>.

The focused native render fixture
`editor/packages/sneepcut-server/verification/native-transitions.ts` compares
Studio preview pixels with decoded MP4 frames, including interior source trims,
caption visibility, blend brightness and unchanged frame count. The opt-in Go
Story transition tests additionally compare decoded audio exactly. See the
[shared pipeline guide](studio-composition-pipeline.md) for local render settings.
