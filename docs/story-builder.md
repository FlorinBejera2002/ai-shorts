# Multi-Clip Story Builder

The recorded-voice mode is documented in [Recorded narration and matched footage](story-narration.md).

Implementation of the [source specification](https://app.notion.com/p/AI-Multi-Clip-Story-Builder-montaj-din-film-ri-multiple-cu-revizie-i-auto-reparare-3e3c7071a1988192877be294e3a45056). Local implementation tracking: [Notion ticket](https://app.notion.com/p/3e3c7071a19881279aa9d8040f46c52c).

## Delivery and review gates

Create opens the multi-file Story Builder. Legacy single-file/link import remains accessible. A confirmed set produces one story, not one job per source. Byte transfer, server media validation, analysis, editing, reviewing and improving are separate states. Failed uploads can be retried without resending validated files. Browser upload concurrency is two; source registration preserves selection order independently of completion order.

Every executable block references a known original candidate and source interval. Source dialogue cannot be supplied by the model. Complete source phrases retain word timestamps, negation, numbers, units, conditions and speaker provenance. Global planning can reorder phrases subject to dependencies and user locks. Unknown-speaker alternate takes require an actual source-media identity comparison, persisted with the block across later edits and restarts. Known different speakers and changed lexical meaning are not equivalent takes.

Accepted versions pin their referenced source catalogs, including alternatives, B-roll, original identity references and context dependencies. If a newer speech model changes the same candidate ID's words/times or sentence segmentation, editing retains the prior catalog and explains that the new analysis requires a new draft/project. An existing locked block cannot silently resolve to a different sentence after a model upgrade. Initial drafts and interrupted first generations still refresh model-aware caches.

The independent pre-render reviewer assesses source context and narrative. The post-render reviewer receives the actual complete rendered video/audio, all boundaries and source-context audio. Conditional speaker checks also compare both original takes. The deterministic gate checks file decoding, duration, valid intervals, captions and source constraints. Missing provider capability, timeout, malformed review, exhausted budget or incomplete coverage results in `needs_review`, never `ready`. Critical/major defects cannot be outweighed by aesthetic scores. Only reviewed Ready output enters the regular clip library.

Before planning, optional batched source analysis describes visible subjects/actions and candidate roles from timestamped proxy frames and provisional ASR text. A batch uses at most 24 sampled frames per source, 20 sources, 12 MiB of media and 700 KiB of metadata. Unknown or unsampled visuals stay uncertain. The model can annotate roles, ideas and dependencies; it cannot change source IDs, speech, timestamps or speaker identity. Metadata caches include source and provider/model identity, and actual-output review remains mandatory regardless of these annotations.

Repairs reserve an attempt before provider/render work, save candidate versions, recheck local dependencies and the whole output, and retain the previous best on regressions. Cached analyses and rendered segments survive edits. Final assembly/caption reflow may re-encode the complete short; it does not re-run all source analysis. There is no generated speech, generative B-roll, voice cloning or automatic publishing.

## Packages and persistence

- `backend/internal/story`: provider-independent contracts, source/take/plan validation, exact EDL, planner, review gate and bounded repair loop.
- `backend/internal/processing/story_*.go`: inspect/normalize/transcribe, measured source quality, crop, cache, render and actual-media review.
- `backend/internal/stories`: authenticated API, source manifest, PostgreSQL queue, fenced checkpoints, immutable version history, locks and rollback.
- `frontend/src/components/story`: upload queue, source choices, options, preview, transcript/source timeline, alternate takes and review/repair history.

Migration **036** follows transition migration **035**. Apply both before starting the new API/worker. The existing worker polls durable story intents as well as legacy jobs/edits. A 180-second lease is renewed every 20 seconds. At most three interrupted worker executions are recovered automatically. Provider reservations and repair attempts remain charged to the same execution budget across recovery. A stale worker cannot save a checkpoint or promote an output.

Initial generation reserves the existing single-clip price, **10 credits**. Automatic repairs, worker recovery and section edits do not debit again. Initial failure/cancellation with no retained draft refunds exactly once; a new manual retry re-reserves that amount. Cancelling an edit of an existing story cannot refund its original generation. Request IDs are bound to exact payloads.

Project derivatives use `work/<project-id>/`, `sources/<project-id>/` and `clips/<project-id>/`. Project deletion is retryable and keeps its database marker if storage cleanup fails. Original uploads belong to the account upload library and remain available for other projects; account deletion removes them along with all project derivatives. Processing and deletion are mutually fenced. No database or uploaded media in a normal development account is a disposable fixture.

## Configurable defaults

| Variable | Default |
| --- | --- |
| `STORY_MAX_FILES` | 20 |
| `STORY_MAX_FILE_BYTES` | 2 GiB |
| `STORY_MAX_TOTAL_BYTES` | 10 GiB |
| `STORY_MAX_SOURCE_SECONDS` | 900 |
| `STORY_MAX_TOTAL_SECONDS` | 3600 |
| `STORY_MAX_REPAIR_CYCLES` | 2 |
| `STORY_MAX_ALTERNATIVES` | 2 per issue |
| `STORY_MAX_AI_CALLS` | 12 across planning and media review |
| `STORY_TIMEOUT_SECONDS` | 7200 |
| `STORY_WHISPER_CPP_MODEL` | `/models/ggml-story.bin` in the worker image; otherwise the configured `WHISPER_CPP_MODEL` |

The default is one Natural story, 9:16, semantic ordering and a 45-second target. Supported target presets are 15/30/45/60/90 seconds. The target is a maximum editorial objective, not a requirement to pad weak material. Strict/source-only mode and preserving source order are available. The existing storage upload size limit still applies.

The same configured Gemini/OpenRouter provider is used; no additional provider or training integration is introduced. Media review sends bounded downsampled output and relevant source evidence, not entire original source libraries. Provider errors do not expose credentials or raw HTTP payloads. Commercial price/model choice and real-world quality thresholds still require launch calibration.

The worker bundles multilingual `large-v3-turbo-q5_0` for story transcription, while legacy processing retains its existing base model. The roughly 547 MiB story model is checked against the checksum published by [whisper.cpp](https://github.com/ggml-org/whisper.cpp/blob/master/models/README.md). Docker build arguments `STORY_WHISPER_MODEL` and `STORY_WHISPER_SHA1` must be changed together when selecting another model. Native installs can set `STORY_WHISPER_CPP_MODEL` to the same downloaded file. Model/settings changes invalidate source analysis. This adds image size and CPU/memory demand; source analysis is cached, and no model size is treated as proof of transcription accuracy. Actual Romanian testing exposed lexical errors in the former base default; caption text defects remain unresolved unless a source-supported correction exists. Retiming cannot repair wrong words.

The shared Whisper JSON parser preserves the complete measured segment when zero-duration/missing subword timestamps would otherwise drop lexical text. With the production `-sow -ml 1` invocation these segments are word-bounded. Coarser input retains its measured phrase interval rather than inventing word timing. Regression fixtures include the observed Romanian `Mă` split and missing alignment on an English negation.

The project records cumulative wall-clock stage durations and provider-call counts by stage, plus the current request's durable call budget. These are operational measurements, not an invented currency estimate or provider invoice. Account data export includes source analyses, timeline versions and repair outcomes without execution lease credentials.

## Formats and practical limits

Validated MP4/MOV SDR sources include H.264/HEVC, VFR, rotation and nonzero audio start offsets. The inspector also recognizes the supported WebM/Matroska formats implemented in `story_ingest.go`. Unsupported codecs, malformed/truncated streams, unreliable time mapping and HDR/Dolby Vision are explicitly rejected. HDR tone mapping is not presented as supported without calibration. Silent footage remains useful as B-roll.

Original presentation time is canonical. Normalized proxy mappings are explicit, and video/audio source intervals are independent on the EDL. Crop falls back to stable full-frame fitting when tracking is unsafe. Whole-phrase editing is intentionally conservative; arbitrary syllable splicing and synthetic bridges are excluded. If no safe alternate exists, the edit returns a concrete recording/selection request.

Uploads stream File objects without loading complete files into JavaScript memory. The existing storage transport supports whole-file retry, not resumable byte-range sessions. Successful source registrations persist on the server. Project deletion retains shared account uploads as described above; there is no silent expiry of originals or rollback versions.

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
