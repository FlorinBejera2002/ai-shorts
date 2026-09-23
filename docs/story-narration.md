# Recorded narration and matched footage

Story Builder includes **Narrate your footage / Povestește peste imagini**. Add footage and record or upload your own voice, in either order. The browser asks for microphone permission only after pressing Record. Pause/resume, stop, cancel, listen, re-record and audio-file upload are available. Upload happens only on Save; failed saves retain the local recording for retry.

The saved voice determines the complete output duration. Its words, pauses, order and speed remain unchanged. Original camera audio is muted. AI selects timestamped visual moments across the supplied files and matches them to the aligned narration. Captions retain the original voice clock, including across visual cuts.

## Persistence and limits

- Up to the configured number of video sources (20 by default), plus one narration.
- Audio: 180 seconds, 32 MiB maximum. WebM/Opus, Ogg/Opus or Vorbis, M4A/MP4 AAC, MP3, or PCM WAV. One audio stream and no video streams. Actual decoding validates codecs and duration; extension/MIME claims are insufficient.
- Live WebM may omit duration metadata. Bounded PCM decoding measures its actual clock.
- Microphone capture needs HTTPS or localhost and permission. File upload remains available if capture is unsupported or denied. Leaving the mode/page releases microphone tracks. Unsaved recordings live in browser memory; save before reloading/closing. Saved recordings restore with the project.
- Draft voice replacement is atomic: failed validation retains the previous recording, and retried registration does not duplicate assets. Remove a saved voice before switching back to source-audio mode. After generation, edits preserve the voice; a new recording requires a new project.

`POST /api/upload/narration` accepts an authenticated multipart `file` and streams it through bounded quarantine, container validation and malware scanning. Register with `POST /api/stories/:id/assets` and `{id, reference, name, kind:"narration", replace_asset_id?:previousId}`. Registration resolves an account-owned upload and decodes it before the project transaction. Ordinary video upload validation stays strict.

The project lock serializes replacement, mode changes and generation. Generation requires exactly one recording, included video footage and confirmation of all asset IDs, before reserving credits. Audio uses private signed URLs and existing account cleanup/export. As with footage, project deletion retains account-owned originals under the shared-upload policy.

## Selection and review

Models select known visual candidate IDs; deterministic code derives bounded original-source intervals. The edit decision list covers the voice completely from zero to its measured end. Repeated source intervals, footage shortages and unsafe voice changes are rejected. Rendering concatenates mute visual shots, then overlays the original narration once for the whole montage.

Insufficient footage produces an explicit unrendered **Needs review** draft. The system does not conceal shortages with loops, frozen frames, invented voice or truncated narration. Independent plan review and actual rendered audio/video review check pictures against narrated passages. Missing semantic evidence or unresolved matching defects prevents **Ready**. Voiceover is reviewed separately from on-camera lip synchronization. Visual alternatives and framing repairs preserve voice/locks; failed edits retain the previous accepted version.

Cache identities include media kind, narration mode, source hashes, models and relevant options. Changing to narration mode recomputes visual analysis without camera ASR. Narration transcription and normalized audio are cached separately. Jobs reuse the existing durable queue, cancellation, retry, call-budget and version history.

## Verification

- Domain tests: complete audio partition, pauses, unchanged captions, sentence boundaries, alternatives, locks, insufficient footage, rejected loops/reordering/speed changes, bounded repair.
- Native FFmpeg: WAV/MP3/M4A/Ogg/live-WebM, missing duration, damaged/overlong/silent media, ASR cache, muted proxies, continuous voice across cuts, cross-cut captions, logos and whole-voice review evidence.
- PostgreSQL: UUID-isolated schemas in `sneepcut_integration_test`; authenticated registration, ownership, extra narration slot, draft-only atomic replacement/retry, complete manifests and one credit reservation.
- `frontend/tests/story-narration.browser.mjs`: isolated browser, synthetic microphone and mocked API; recording lifecycle, playback, permissions, retry, limits, persistence and mode/route cleanup. Never the user's physical microphone.
- `story-eval -input footage -narration-file voice.wav -output runs` supports permissioned evaluation. `-provider configured` explicitly opts into bounded external AI calls. Replay verifies and retains original narration; replacement requires a new input run.

Automated fixtures establish workflow and media correctness. They are not human editorial approval or a Safari/iPhone device matrix. No production deployment is included.

## Actual-provider verification, 23 September 2026

The permissioned smoke fixture uses two 10-second muted excerpts from the licensed recordings documented in [story-evaluation-sources.md](story-evaluation-sources.md), presented in reversed upload order. A locally synthesized 8.158375-second English recording describes a young woman first, then an older man in glasses. Synthetic speech is a test fixture only, not a product capability.

The initial run correctly remained Needs review when source semantics did not establish the subjects and the generated pictures contradicted the narration. Investigation found a prompt/validator mismatch for muted talking-head footage; visual roles and narration context were separated, with regression coverage. The initial model response was not captured, so that run's exact rejected field is unknown.

The second run matched both subjects correctly. Actual media review accepted both, but text review falsely treated padded ASR sentence bounds as missing spoken coverage. Review now receives exact original word times and explicit gaps, omits padded narration candidates from visual evidence, and retains all genuine mismatch findings. The exact 3.54-second word end versus 3.72-second ASR envelope has regression coverage.

The final cached replay reached **Ready**, with three provider calls, every coverage field true and no issues. It correctly reordered footage, retained the complete original voice and rechecked the actual rendered file. Local reports and generated text diagnostics are in `.cache/narration-evaluation/runs-final/run-20260923T075828Z-901310740/`; prior runs remain intact. This is a bounded semantic smoke test, not broad human editorial acceptance.

Backend media, story, API and isolated PostgreSQL checks passed. Frontend typecheck, focused Story lint, existing Story browser regression and synthetic-microphone narration flows passed. React Doctor's comparable tracked-change score was 79/100 versus the prior 78, with the same two unrelated Studio warnings; a separate untracked-inclusive scan was inspected rather than misrepresented as the same baseline.
