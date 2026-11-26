# Multi-Clip Story Builder

The recorded-voice mode is documented in [Recorded narration and matched footage](story-narration.md).

Implementation of the [source specification](https://app.notion.com/p/AI-Multi-Clip-Story-Builder-montaj-din-film-ri-multiple-cu-revizie-i-auto-reparare-3e3c7071a1988192877be294e3a45056). Local implementation tracking: [Notion ticket](https://app.notion.com/p/3e3c7071a19881279aa9d8040f46c52c).

## Delivery and review gates

Create opens the multi-file Story Builder. Link imports were removed; uploads and channel imports remain. A confirmed set produces one story, not one job per source. Byte transfer, server media validation, analysis, editing, reviewing and improving are separate states. Failed uploads can be retried without resending validated files. Browser upload concurrency is two; source registration preserves selection order independently of completion order.

Every executable block references a known original candidate and source interval. Source dialogue cannot be supplied by the model. Complete source phrases retain word timestamps, negation, numbers, units, conditions and speaker provenance. Global planning can reorder phrases subject to dependencies and user locks. Unknown-speaker alternate takes require an actual source-media identity comparison, persisted with the block across later edits and restarts. Known different speakers and changed lexical meaning are not equivalent takes.

Accepted versions pin their referenced source catalogs, including alternatives, B-roll, original identity references and context dependencies. If a newer speech model changes the same candidate ID's words/times or sentence segmentation, editing retains the prior catalog and explains that the new analysis requires a new draft/project. An existing locked block cannot silently resolve to a different sentence after a model upgrade. Initial drafts and interrupted first generations still refresh model-aware caches.

The independent pre-render reviewer assesses source context and narrative. The post-render reviewer receives the actual complete rendered video/audio, all boundaries and source-context audio. Conditional speaker checks also compare both original takes. The deterministic gate checks file decoding, duration, valid intervals, captions and source constraints. Missing provider capability, timeout, malformed review, exhausted budget or incomplete coverage results in `needs_review`, never `ready`. Critical/major defects cannot be outweighed by aesthetic scores. Accepted rendered results enter the unified clip library even when they still need review; library availability does not imply approval or readiness to publish.

Before planning, optional batched source analysis describes visible subjects/actions and candidate roles from timestamped proxy frames and provisional ASR text. Sequential batches use at most 24 sampled frames per source, 20 sources, 12 MiB of media and 700 KiB of metadata. Oversized batches split before provider submission; every source is retained. Byte, duration, timeout and provider-call budgets still apply, and incomplete optional analysis remains recorded. Unknown or unsampled visuals stay uncertain. The model can annotate roles, ideas and dependencies; it cannot change source IDs, speech, timestamps or speaker identity. Metadata caches include source and provider/model identity, and actual-output review remains mandatory regardless of these annotations.

Repairs reserve an attempt before provider/render work, save candidate versions, recheck local dependencies and the whole output, and retain the previous best on regressions. Cached analyses and rendered segments survive edits. Final assembly/caption reflow may re-encode the complete short; it does not re-run all source analysis. There is no generated speech, generative B-roll, voice cloning or automatic publishing.

## Packages and persistence

- `backend/internal/story`: provider-independent contracts, source/take/plan validation, exact EDL, planner, review gate and bounded repair loop.
- `backend/internal/processing/story_*.go`: inspect/normalize/transcribe, measured source quality, crop, cache, render and actual-media review.
- `backend/internal/stories`: authenticated API, source manifest, PostgreSQL queue, fenced checkpoints, immutable version history, locks and rollback.
- `frontend/src/components/story`: upload queue, source choices, generation options, source transcript review, processing and a read-only result preview. All manual output editing opens the main Studio through the published clip ID. The dashboard no longer contains a separate Story timeline, scene editor, restyling panel or rollback editor.

Migration **036** follows transition migration **035**. Apply both before starting the new API/worker. The existing worker polls durable story intents as well as legacy jobs/edits. A 180-second lease is renewed every 20 seconds. At most three interrupted worker executions are recovered automatically. Provider reservations and repair attempts remain charged to the same execution budget across recovery. A stale worker cannot save a checkpoint or promote an output.

Initial generation reserves the existing single-clip price, **10 credits**. Automatic repairs, worker recovery and section edits do not debit again. Initial failure/cancellation with no retained draft refunds exactly once; a new manual retry re-reserves that amount. Cancelling an edit of an existing story cannot refund its original generation. Request IDs are bound to exact payloads.

Project derivatives use `work/<project-id>/`, `sources/<project-id>/` and `clips/<project-id>/`. Project deletion is retryable and keeps its database marker if storage cleanup fails. Original uploads belong to the account upload library and remain available for other projects; account deletion removes them along with all project derivatives. Processing and deletion are mutually fenced. No database or uploaded media in a normal development account is a disposable fixture.

The worker analyzes each uploaded source of a draft (edited in the last 12 hours) while its owner is still choosing options, one source at a time, with the draft's current language, narration and soundtrack settings. The results are the same content-addressed analysis cache the run reads, so Generate usually finds them ready; a later settings change only repeats speech analysis. A run claim stops any prewarm of its project before analysis starts, and a prewarm interrupted by deletion removes the artifacts it wrote. This assumes a single worker process.

## Configurable defaults

| Variable | Default |
| --- | --- |
| `STORY_MAX_FILES` | Deprecated; product admission limit is 200 clips/project |
| `STORY_MAX_FILE_BYTES` | 2 GiB |
| `STORY_MAX_TOTAL_BYTES` | 10 GiB |
| `STORY_MAX_SOURCE_SECONDS` | 900 |
| `STORY_MAX_TOTAL_SECONDS` | 3600 |
| `STORY_MAX_REPAIR_CYCLES` | 2 |
| `STORY_MAX_ALTERNATIVES` | 2 per issue |
| `STORY_MAX_AI_CALLS` | 12 across planning and media review |
| `STORY_TIMEOUT_SECONDS` | 7200 |
| `STORY_ANALYSIS_WORKERS` | 2 sources analyzed at once per run (1–8; 1 is strictly sequential) |
| `STORY_PREWARM` | On; `off` stops analyzing draft uploads before Generate |

The worker logs one `Story source analysis` line per source with the milliseconds of each step (`proxy`, `quality`, `transcription`, `speech_timing`, or `cached_speech_timing` for a cache hit) and its `speech_engine`, one `Story analysis stage` line per run with `sources_ms` and the provider's `source_meaning_ms`, and the API logs `Story upload validation` with `probe`, `packets` and `checksum`. Stage totals per status remain in `story_projects.stage_metrics`.

The default is one Natural story, 9:16, semantic ordering and a 45-second target. Supported target presets are 15/30/45/60/90 seconds. The target is a maximum editorial objective, not a requirement to pad weak material. Strict/source-only mode and preserving source order are available. The existing storage upload size limit still applies.

The same configured Gemini/OpenRouter provider is used; no additional provider or training integration is introduced. Media review sends bounded downsampled output and relevant source evidence, not entire original source libraries. Source meaning analysis also attaches each visual source's own audio (mono 16 kHz MP3 at 32 kbit/s, at most 15 minutes and 6 MiB per request) so the model can judge tone, emotion, reactions and background sound; it never transcribes from it, and the local ASR words and timestamps stay authoritative. Narration and music-only stories send no source audio because their original sound is muted. Provider errors do not expose credentials or raw HTTP payloads. Commercial price/model choice and real-world quality thresholds still require launch calibration.

Speech is transcribed only by a hosted OpenRouter speech-to-text model; no transcription engine is installed. The admin AI routing has two stages, `Transcriere: clipuri` and `Transcriere: Story și narațiune`, both defaulting to ElevenLabs Scribe v2 (AssemblyAI, Deepgram, Voxtral and Whisper Turbo can be selected; text-only models and other providers are rejected). Saved routes to the retired local Whisper (`whisper_cpp`) are ignored and fall back to that default. The worker uploads mono 64 kbit/s MP3 in pieces of at most 10 minutes with data collection denied, requests word timings and converts the words to the whisper.cpp JSON the rest of analysis reads; the provider's own word confidence is kept and never invented, non-speech events are dropped and ISO 639-3 language codes are shortened (`ron` → `ro`). Each call logs `Hosted transcription` with requests, words, scored words and duration. A failed request fails that source's analysis with a retry message; there is no local fallback. Voice regions are still measured locally with Silero (`whisper-vad-speech-segments` and `/models/ggml-vad.bin`), which also gates captions, and the former local DTW re-alignment of low-confidence proposals was removed.

The worker image no longer contains `whisper-cli` or Whisper speech models; it builds only the Silero voice detector CLI from whisper.cpp and downloads its checksummed model. Changing the routed transcription model changes the analysis cache identity, so sources are transcribed again with the new model. Actual Romanian testing remains necessary for any model: caption text defects are not repaired by retiming.

Hosted words are written as one word per segment, matching the former `-sow -ml 1` layout, so the shared parser keeps measured word clocks. Coarser input retains its measured phrase interval rather than inventing word timing.

The project records cumulative wall-clock stage durations and provider-call counts by stage, plus the current request's durable call budget. These are operational measurements, not an invented currency estimate or provider invoice. Account data export includes source analyses, timeline versions and repair outcomes without execution lease credentials.

## Formats and practical limits

Validated MP4/MOV SDR sources include H.264/HEVC, VFR, rotation and nonzero audio start offsets. The inspector also recognizes the supported WebM/Matroska formats implemented in `story_ingest.go`. Unsupported codecs, malformed/truncated streams, unreliable time mapping and HDR/Dolby Vision are explicitly rejected. HDR tone mapping is not presented as supported without calibration. Silent footage remains useful as B-roll.

Original presentation time is canonical. Normalized proxy mappings are explicit, and video/audio source intervals are independent on the EDL. Crop falls back to stable full-frame fitting when tracking is unsafe. Whole-phrase editing is intentionally conservative; arbitrary syllable splicing and synthetic bridges are excluded. If no safe alternate exists, the edit returns a concrete recording/selection request.

Uploads stream File objects without loading complete files into JavaScript memory. The queue accepts up to 200 clips per project (the user-requested product limit); existing larger projects remain usable; transfers remain bounded to two, temporary server backpressure follows Retry-After, failures remain independently retryable, and active transfers can be cancelled. Source pages render 24 items at a time and successful transfers release their object URLs. The existing storage transport supports whole-file retry, not resumable byte-range sessions. Successful source registrations persist on the server. Project deletion retains shared account uploads as described above; there is no silent expiry of originals or rollback versions.

## Verification and launch acceptance

Automated coverage is in `internal/story/*_test.go`, `internal/processing/story_media_test.go`, provider media tests, `internal/stories/postgres_test.go` and `frontend/tests/story.browser.mjs`. The browser script accepts `TEST_FILE_COUNT=5` or `10` and exercises the real mounted frontend with synthetic files/mocked API responses. Database tests require the dedicated loopback `sneepcut_integration_test` database and disposable migrated schemas. Media tests use real FFmpeg-generated fixtures; neither mocks nor synthetic fixtures alone prove real editorial quality.

| Acceptance area | Evidence / remaining gate |
| --- | --- |
| 5/10 inputs, one job, source confirmation, failed-only retry | Database concurrency/manifest tests and browser flows |
| Global ordering, meaning, dependencies, alternate takes, provenance | Domain regression fixtures and independent review gates |
| B-roll audio separation, timestamps, VFR/rotation, captions, segment cache | Real FFmpeg media regressions |
| Review failure, repair, rollback, budgets, identity comparisons | Domain, provider and media regression tests |
| Ownership, cancellation, debit idempotency, worker restart, locks | PostgreSQL integration regressions |
| Real RO/EN speech, device matrix, quality thresholds, provider suitability | Licensed evaluation recordings and actual-model/human evaluation required |
| AC24 human launch approval | **Pending human review; never inferred from an AI report** |

Licensed recordings/excerpt preparation and their provenance are documented separately in `story-evaluation-sources.md`. Public interview excerpts can exercise real voices and imagery; they are not substitutes for a complete independently shot iPhone/Android creator dataset. Production deployment is a separate action and has not been performed by this implementation task.

See [the verification record](story-builder-evaluation.md) for actual-provider results, corrected real-media defects, executed checks and remaining acceptance gates. The reproducible local runner is documented in [`backend/cmd/story-eval/README.md`](../backend/cmd/story-eval/README.md).

Generation sends an editable composition to the same Studio service used for manual editing and exports. The Go worker retains source analysis, transcription and output review; the old Go/FFmpeg final compositor has been removed. See [the shared Studio pipeline](studio-composition-pipeline.md) for the current render boundary and integration prerequisites. The result resolves its live published clip ID; deleted library clips are not silently recreated from retained Story history.

Current verification limitation: existing authenticated upload and asset registration endpoints still enforce 60 requests/hour (authorization 120/hour). Automatic approval review blocked both removing these counters and a finite 400/hour increase. An unapplied reviewable patch is in docs/patches/upload-request-throttle.patch. Queue retry uses the remaining Redis window via Retry-After without exhausting a retry-count budget; rapid end-to-end 80-clip API acceptance remains unverified until the reviewed rate-policy change is authorized and applied.

The 200-clip limit applies atomically to new unique video additions, after retry and duplicate detection. A narration recording has its separate one-recording rule. Existing projects above 200 retain their complete assets, ordering and ability to generate/export; the integration test simulates a legacy 201-clip project and queues its complete manifest.

Smoother flow replans complete known source moments (narration mode changes visuals while retaining the original recorded-voice schedule). Identical rebuilt timelines produce an explicit no-change outcome without a new render. Smoother transitions measures the previous actual output and applies a video-only 80 ms dip on each side of eligible unlocked cuts. Audio samples and duration remain unchanged; word-crossing, already-smoothed and locked joins are excluded. The actual-media test decodes changed boundary pixels and byte-identical audio. Explicitly requesting smoother transitions also softens eligible narration hard cuts while retaining the continuous voice. Existing versions remain available for comparison/rollback.
