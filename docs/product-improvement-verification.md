# Product improvement implementation and evidence — 14 October 2026

The implementation is in the existing React/Vite, Go API/worker, FFmpeg/libass,
whisper.cpp, PostgreSQL and Redis stack. No service was deployed, no paid provider
was activated, and no persistent customer database/media was modified.

The user's final clarification sets **200 clips per project**. This replaces the
original unlimited-count requirement. New unique footage stops at 200; retries,
narration and previously saved larger projects remain usable. Analysis batches and
rendering chunks are resource controls, not replacement project/timeline caps.

The [implementation ticket](https://app.notion.com/p/3f9c7071a1988116b18eef4b25a124bd)
remains **Testing** because live large-collection acceptance and real denoising
quality are not fully verified. Local tests must not be mistaken for deployment.

## Requirement map

| Requirement | Implementation | Executed evidence / remaining boundary |
| --- | --- | --- |
| Player-led result | `story-editor.tsx` puts playback and download first; compact improvements, comparison and Appearance; `story-clip-editor.tsx` mounts only one selected clip after Edit clips. | `story-result.browser.mjs`: desktop, 390/320 px, Romanian, actual MP4 seeking, no default reports/scene stack, comparison/restore, duplicate prevention. |
| Honest result state | Concise verified major problems only; caption withholding remains actionable. Authenticated project response and worker diagnostics retain full reports. Persisted operation outcome distinguishes failed, unchanged and successful edits while keeping the previous output. | Isolated database tests for failed/no-change improvements; browser reload retains failed-edit message and playable previous export. Verified transition/lip-sync issue tests. |
| Faster pace | Trims measured boundary silence using valid source speech evidence, preserves a speech buffer and locks, and changes source intervals. No speech-speed or pitch filter. | Native FFmpeg regression: 4.0-second source becomes 2.4 seconds using the original 0.8–3.2-second interval; source remains 4.0 seconds; word/audio clocks preserved. |
| Better cuts / transitions | Flow replans known moments; identical timelines report unchanged. Transitions soften eligible unlocked cuts with an 80 ms video-only dip. | Ordinary and narrated actual exports change decoded pixels, preserve decoded voice byte-for-byte and retain duration. Locked/word-crossing/already-smoothed cuts are excluded. |
| Three creation stages | Existing Add footage → Make it yours → Generate flow; optional narration/music/appearance; hidden panels preserve entered values; EN/RO labels. | Wizard, fidelity, music and narration browser suites pass. Keyboard, mobile, mode switching and back navigation verified. |
| Dashboard and development state | Shared dashboard/sidebar/header stay mounted; component boundaries remain local. | Result/wizard tests verify DOM identity and sidebar state. Component Fast Refresh preserves player position and open editor state. |
| 200-source admission and large collections | Atomic owned admission, stable manifest, two active uploads, per-file/overall progress, individual transfer/registration retry, cancellation, paginated source UI and URL cleanup. | Queue tests for 80/125/200; real database 80/125 manifests, 200 accepted/201 rejected, legacy 201 queued. Rapid authenticated 80+ transfer→export remains unverified under the unchanged hourly policy. |
| Full source accounting and bounded processing | Semantic requests batch 20 and split oversized responses; narration participates in cache identity. Rendering uses chunks of at most 16 inputs without a 100-entry cap. | Actual125-source frames, real125-entry media assembly; 21-source narrated cache replay makes zero new calls, changed narration invalidates both batches. Transactional project snapshots prevent concurrent registration false failures. |
| Brand Kit sections | Logo & watermark combines upload/replace/remove, enable, position/size/opacity/margins and live preview; Captions holds typography and colors. Standalone colors/typeface removed. | Desktop/mobile Brand Kit browser checks; native watermark pixel bounds and repeated ordinary export test. Platform badge entitlement retained. New videos do not get automatic brand-colored overlays. |
| Brand propagation and legacy settings | Versioned caption contract and persisted brand snapshots reach Story, ordinary and TikTok renders. Legacy settings remain stored; archived font/logo bytes are retained for saved recipes. | Dedicated database legacy/ownership/snapshot tests; existing-video custom-style→Brand Kit restyle regression; actual Story+ordinary exports. |
| Fonts | 32 curated static families with Romanian glyph coverage, weights, hashes and licenses; searchable previews load on demand. Private TTF/OTF validates sfnt contents, family/style/weight and ownership with permission confirmation. | Catalog/metadata/ownership tests; browser search/lazy loading; authenticated multiword Open Sans TTF upload→save/reload→archive→real exports; Adobe Source Sans 3 OTF upload/export. WOFF/WOFF2 intentionally rejected. |
| 12 caption behaviors | Classic, minimal, outlined, text box, headline, word display, karaoke, active color/background, phrase pop, fade and stacked use libass output. Shared contract covers typography/layout/color/position. | 36 native exports (12×3 aspect ratios); decoded gap/highlight/progressive karaoke/long-word checks. Measured phrase bounds provide static fallback when word alignment is absent; timings are never fabricated. |
| Free caption placement | Pointer/touch drag, selection boundary, guides, snapping, reset and keyboard/percentage controls; center anchor and normalized content coordinates with block clamping. | Browser mouse/touch/keyboard save/reload; actual exported positions at 9:16, 1:1, 16:9. Font/size/multiline and long-token fit tests. CSS preview and libass are not pixel-identical rasterizers. |
| Optional audio cleanup | Opt-in DeepFilterNet CLI adapter with immutable originals, project-scoped cached derivatives, bounded worker, compensated latency, retry/cancel and explicit original recovery; comparison player. Applied before music. | Actual FFmpeg tests, database ownership/idempotency, browser controls and focused race tests. Official DeepFilterNet3 ran through the real adapter on five synthetic speech variants and actual Story/ordinary exports, with exact duration and 0 ms measured lag. Subjective, Romanian and real-world quality remain unverified. |

## Verification records

Detailed evidence and configuration are in:

- [Collection and improvements](product-collection-verification.md).
- [Caption contract, fonts, legacy behavior and renderer](brand-rendering.md).
- [Audio candidate assessment, runtime setup and unverified quality matrix](audio-cleanup.md).

Browser suites use synthetic accounts and API fixtures. Their media player checks
serve real synthetic MP4 byte ranges, but mocked provider/API behavior is not a
real authenticated bulk-upload claim. Database suites use only the disposable
`sneepcut_integration_test` instance with isolated schemas. Actual FFmpeg tests
inspect decoded frames/audio and duration; configuration assertions alone are not
the export evidence. Relevant regression scripts remain in `frontend/tests/` and
Go package tests; local logs and rendered evidence remain in
`frontend/test-results/` (ignored build/test output).

Native whisper.cpp speech safety was also exercised with synthetic speech.
The production Story `large-v3-turbo-q5_0` model passes distant-burst/no-silence-caption
regression. The smaller `base` model failed that same fixture by withholding all
unreliable words. This existing quality limitation is recorded, not counted as a
pass. Native controls for tone/noise/speech-after-silence pass.

## Configuration and incomplete acceptance

1. Migration `046_20261014_caption_styles.sql` must be applied by the normal
   migration process before using these changes in another environment. It adds
   caption resources, style and brand snapshots. Built-in font assets/licenses
   are embedded in the Go renderer. No production migration was run here.
2. New-project admission is 200. The user explicitly chose to keep the current
   hourly allowance: transfers/registrations 60/hour, authorizations 120/hour.
   The queue honors the remaining window, remains cancellable, and retains
   completed files. A collection larger than the remaining hourly allowance
   waits across windows. A rapid authenticated 80/125 transfer-to-export run is
   not claimed. The unapplied 400/hour patch is retained only as a rejected
   alternative, not pending authorized work. Automatic approval review rejected
   its service-wide scope before the user chose to keep the existing allowance.
3. Audio cleanup requires administrator-provisioned `DEEPFILTER_PATH` and
   `DEEPFILTER_MODEL`. The official Windows CLI and DFN3 model were used for isolated
   synthetic evaluation, then removed from scratch storage; no production
   configuration was changed and model weights are not redistributed. Model
   licensing for deployment, production CPU/memory/latency, intelligibility and
   voice identity still require
   validation on clean/noisy speech, wind, hum, reverb, overlapping speakers,
   ambience/music and Romanian speech. The implemented option promises noise
   reduction only, not target-speaker separation or universal dereverberation.
   Failures retain originals and never become success. Subjective listening was
   unavailable in the inspection runtime; numeric real-model checks are not a
   listening evaluation.
4. Browser preview uses the same resource, style and layout contract; libass is
   authoritative for export. JASSUB was assessed and not added because it would
   require additional WASM/worker/deployment compatibility work without changing
   the persisted contract. No resumable-upload library was added: bounded existing
   queue recovery addresses many small clips; byte-offset resume for interrupted
   single large files is not newly implemented.

The task must not be marked Done until the remaining acceptance above is closed.

## Checks executed

- Frontend production build and TypeScript completed successfully. Vite reports
  its future native-config import-extension warning and a large-chunk advisory;
  neither is hidden by raising warning thresholds.
- Full frontend tests: 191 tests, 190 passed, one skipped, zero failed. The skipped
  deployment path-traversal test requires native Bash, unavailable on this Windows
  host. Full lint completed with zero errors and 60 warnings, including existing
  effect/Fast Refresh findings; this is not a warning-free lint result.
- Final affected Go run: 565 passing test/subtest events across story, brand,
  worker, media, account and processing; 72 more in the full stories package.
  Earlier jobs, captions, worklimit and migration suites also passed. Final
  `go vet ./...` passed. Real database tests had the dedicated test DSN/schema.
- The broad media run skipped live provider music download (no selected live
  track) and two opt-in native speech tests. Those two native speech tests were
  separately executed with installed models as described above. No live provider
  music-download pass is claimed.
- Focused race detector: worklimit gate plus audio derivative/cache, cancellation
  and timeout checks passed in the existing offline Linux Go image. Native Windows
  race build was unavailable without GCC; the Linux run supplies focused evidence,
  not a whole-application race audit.
- Result, wizard, fidelity, music, narration, processing, 5/125-source Story,
  Brand Kit/captions and audio-cleanup browser regressions passed. Late focused
  tests cover explicit 409 refresh/reapply without losing choices or automatically
  replaying edits, durable worker-failure display, and switching to Brand Kit.

Late regressions also pass for archived private-font bytes served on the authenticated
API origin, exact legacy font handling, logo-only generation with captions off, and
clearing stale failed-operation state after a successful restore.

Final storage check passed after preserving evidence and removing this task's
scratch/downloads and regenerable Go build cache: 26.0 MiB regenerable output,
1772.2 MiB cache, 5503.4 MiB checkout. Existing tools/models, dependencies, unrelated
cache directories and user data were preserved. Only the owned temporary database
container and test Vite server were stopped.

The real-provider evaluation artifacts and reproducible measurements are in
[the audio comparison README](../frontend/test-results/product-evidence/audio-real/README.md).
The official CLI/DFN3 combination completed eight cases; all five synthetic speech
variants preserved 11.1 seconds and measured 0 ms lag. Quiet-window stationary and
wind-like noise fell approximately 12 dB. These numeric results do not verify
subjective quality, target-speaker removal, Romanian intelligibility or universal
reverberation removal. Source recordings were synthetic English speech.

## Release preparation follow-up

The user subsequently authorized GitHub publication and production deployment.
The existing 200-clip project cap and hourly allowance remain unchanged. A separate
release ticket tracks backup, staged build, activation and live verification.
Production deployment does not close the remaining qualitative acceptance above.

Preflight found two packaging issues and addressed both: the Roboto Condensed
binaries require the matching Apache 2.0 notice (all 60 font hashes stayed intact),
and unprovisioned cleanup must not be selectable. The authenticated capability now
requires an explicit verified deployment flag and configured worker paths. API
queue guards reject unavailable cleanup before reserving credits; saved choices
can be turned off and prior output remains accessible. No model weights are bundled
or paid service activated. See the audio setup documentation for activation criteria.

The database backup was restored in a network-isolated disposable
`sneepcut_integration_test` database, media/Studio archives passed integrity checks,
and previous application images were retained. Migration 046 is additive, but an
older migrator does not recognize it; the release guide documents a compatible
forward recovery instead of assuming ordinary rollback works. Exact release SHA
and live verification outcomes are recorded on the release ticket after activation.