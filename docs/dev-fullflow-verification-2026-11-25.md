# Development full-flow verification, 2026-11-25

The real development flow passed using synthetic media, a synthetic account and the dedicated integration database. Production configuration and data were not changed.

## Verified behavior

- Uploaded an 11,152,898-byte, 77.267-second synthetic tutorial through the browser upload flow into the private Hetzner development bucket. The signed download matched the original SHA-256; unsigned access returned 403.
- Ran real CPU Whisper transcription, funded AI planning/review and rendering. The final job reached 100% and produced two distinct portrait H.264/AAC clips: 12.467 seconds (3,205,122 bytes) and 13.467 seconds (3,509,097 bytes), both 1080 by 1920. Every video frame and audio packet decoded successfully with FFmpeg.
- Opened and played both outputs in separate Studio workspaces. Both players loaded their media without errors. Retained screenshots show each distinct clip and its captions.
- Saved changes in both workspaces, read them back, and rejected stale saves with HTTP 409. Recreated the isolated Studio with empty local caches; both saved changes recovered from S3. Restored the original generated content afterward.
- Captured a real project thumbnail containing video and captions after the cold-cache recovery. The isolated thumbnail/MP4 browser regression passed as well.

## Corrections exercised by this run

Multi-clip planning now retains the full brief while planning one distinct output per call. Secondary outputs receive stable separate Studio project identities; incompatible older sibling outputs request regeneration. Preview-generated IDs and formatting no longer falsely count as authored edits, while actual edits and byte-level save conflicts remain protected. Studio session renewal preserves active same-account requests. Cancelled video ranges use Bun-native file streams. Thumbnail capture uses piped browser control, the built runtime and frame readiness instead of waiting for network silence.

The tested worker binary and Studio source fixes are active in the normal local development services. No frontend restart or production deployment was performed.

## Checks

- Go tests for the affected story and processing packages passed.
- Affected Bun composition, import, session/authentication and cancelled-range regression tests passed.
- Sneepcut server TypeScript checking passed after the final thumbnail change.
- Real isolated thumbnail and MP4 regression: one test, 14 assertions, passed.
- Final whitespace and storage checks are recorded below after fixture cleanup.

## Limits and follow-up

The final story is deliberately marked needs_review: the reviewer could not verify every source phrase/timestamp, so uncertain captions were withheld. Audio, visual, file, semantic, boundary and source-identity checks passed. This verifies the functional flow; it does not certify every caption as ready to publish.

CPU transcription took roughly 10.6 minutes for this fixture. Some S3 metadata operations were slow, including one timed-out write that reconciliation recovered; empty-cache project recovery was also slow. These timings should be considered before production rollout. No further secrets were needed for this development verification after the AI key limit was increased.

Evidence is retained locally in artifacts/fullflow-20261125: funded-clip-1.mp4, funded-clip-2.mp4, funded-media-proof.json, studio-funded-clip-1.png, studio-funded-clip-2.png and studio-root-thumbnail.jpg. Reports contain no credentials or signed URLs.

## Cleanup and final checks

Removed the isolated containers, network, tmpfs database and all 981 task-owned S3 test objects. A fresh listing confirmed zero owned objects remain. Removed the private scratch directory and the temporary image tag. Preserved the videos, screenshots and media proof outside the cache. Cleared the allowlisted native Go build cache after tests stopped. Final storage check passed: checkout 1,959.9 MiB, cache and regenerable outputs zero. Final whitespace check passed. Normal local app readiness, backend health/readiness and Studio health all returned HTTP 200.
