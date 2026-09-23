# Natural transition analysis

The initial Go generation pipeline enables natural transitions for every selected
clip. Highlight-provider fade/dissolve suggestions no longer select a decorative
effect for the entire clip. Explicit legacy render styles remain supported.

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
  continuity/overshoot gate rejects unhelpful output, retaining the simpler cut.
  Source audio and timeline duration are preserved by visual bridging.
- Missing visual evidence, tracking models, model advice, or rejected bridges
  retain the simpler edit. Cancellation is still propagated.

The quality gate is conservative and heuristic. Representative footage review
is still necessary for tracking accuracy and subjective edit quality; numerical
checks cannot prove the absence of every visible artifact.

## Improvement action and persistence

`POST /api/clips/:id/transitions` uses the existing authenticated, member-only,
rate-limited edit reservation/worker queue. The clip detail page displays an
Improve transitions action for clips with saved multi-sequence analysis.
Status polling refreshes the same cached clip resource and preview.

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
  Playwright entry point, and run `node tests/transitions.browser.mjs` from
  `frontend`. The script uses synthetic data and mocks all API requests.

FFmpeg filter reference: <https://ffmpeg.org/ffmpeg-filters.html#minterpolate>.
