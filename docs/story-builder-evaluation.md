# Story Builder verification — 23 September 2026

This report records implementation checks and actual-media findings. Release acceptance remains open: real-media results must be reviewed by a human, and the independent phone/device recording matrix has not been exercised. The implementation tracking ticket remains **Testing**.

## Test inputs and isolation

The licensed [Romanian and English recordings](story-evaluation-sources.md) were downloaded, hashed and divided into shuffled sets of 5 and 10 overlapping excerpts. All 30 excerpt files passed full FFmpeg decoding. They contain real speech and imagery, but come from two recordings; these are not 30 independently recorded takes. Original recordings, attribution manifests, transcripts and generated edits remain under ignored `.cache/story-evaluation/`.

Actual evaluations use the production Go processing/domain code, local Whisper `large-v3-turbo-q5_0`, FFmpeg, the face detector and the configured Gemini provider. Each evaluation permits at most eight provider calls and two repair cycles. A new run has separate immutable reports and checkpoints. The evaluation command does not publish clips or write to the application database.

Database regressions use only `sneepcut_integration_test` on the dedicated loopback PostgreSQL instance, with disposable schemas. Browser tests use synthetic files and mocked API responses; they do not constitute an end-to-end real-provider browser test.

## Findings corrected during actual-media verification

- Whisper's zero-duration subword alignment could discard letters or a negation. The parser now retains the complete measured segment instead of silently losing lexical text; source-analysis caches are invalidated.
- Repairable context dependencies caused the global plan to be replaced prematurely with an upload-order fallback. Known, executable source phrases now reach the bounded context-repair step before rendering. Unsafe proposals retain explicit rejection evidence.
- Context restoration inserted only the immediate prerequisite, leaving its upstream dependencies unresolved. Repair now restores the entire verified prerequisite chain atomically, enforcing exclusions, order, locks, cycles and duration limits. Repeated wording that may come from overlapping recordings is flagged for review; text similarity never establishes speaker/take identity.
- Real provider responses sometimes used phrase IDs where file IDs were required. Both reviewers now receive explicit namespaces; only an exact, unique candidate-to-source mapping is normalized. Unknown and ambiguous references still prevent approval.
- Incorrect caption words were being offered timing repairs. Lexical defects now remain unresolved with a source-verification explanation; no-op repairs do not consume a render cycle.
- Low-resolution source/crop images were not scaled up to the output canvas. Rendering now fits the image to the available output bounds while retaining its aspect ratio and safe-crop fallback.
- Changing a speech model could reinterpret an accepted block's existing candidate ID. Referenced accepted catalogs are now pinned, including word times, alternatives and context dependencies.

Each of these corrections has regression coverage. A model's confidence or a successful encode does not override missing evidence or a blocking issue.

## Automated checks

| Area | Result |
| --- | --- |
| Domain planning, source provenance, locks, bounded repairs, rollback/regression gates | Go tests and vet passed |
| Native inspect/proxy/EDL/render/caption/cache/media-review behavior | Affected Go tests using real FFmpeg fixtures passed |
| Replay, source reinspection and preservation of prior cache/report bytes and timestamps | Complete CLI tests and vet passed, including a real FFmpeg replay |
| Gemini/OpenRouter media request and response handling | Provider tests passed |
| Durable queue, ownership, cancellation, credit idempotency, recovery, history | PostgreSQL integration tests passed |
| API, worker, account export/deletion and existing clip integration | Affected tests passed |
| Browser upload/confirmation/retry/story flow with 5 and 10 sources | Passed with synthetic fixtures and mocked responses |
| Mode switching, retained uploads/state, review explanation, mobile layout | Browser regressions passed |
| Frontend TypeScript and focused lint | Passed; existing Create effect warning retained |
| React Doctor | 78; remaining reported diagnostics belong to concurrent Studio work |

Go is the current backend implementation; the repository's historical Python test command does not exercise these packages. The race detector was not run successfully because the local toolchain lacks the required C compiler/CGO setup. The Docker image was not built because the daemon is unavailable. The replay symlink-only test was skipped because Windows does not grant this process symlink-creation privileges. None of these limitations is counted as a pass. No deployment was performed.

## Actual-provider runs

The initial corrected-transcription runs completed for Romanian (5 inputs, 571 seconds, 3 provider calls) and English (10 inputs, 813 seconds, 4 calls). Both were correctly retained as `needs_review` after the defects above were detected. These runs shared CPU resources, so their times are observations, not a production performance benchmark.

Their immutable reports are preserved:

- `.cache/story-evaluation/results-final/run-20260923T063240Z-2820516157/`
- `.cache/story-evaluation/results-final/run-20260923T063255Z-4123747751/`

The first updated-code replays completed without reviewer ID/schema failures:

| Input | Run | Result | Wall time / provider calls |
| --- | --- | --- | --- |
| Romanian, 5 excerpts | `results-verified/run-20260923T065654Z-888440704` | `needs_review`; one context repair accepted, another prerequisite chain unresolved | 103.82 seconds / 2 |
| English, 10 excerpts | `results-verified/run-20260923T065652Z-2937083666` | `needs_review`; reviewer reported an omitted article in ASR/captions, and planner reported a duration concern | 110.87 seconds / 2 |

Both rows are completed evaluations, **not editorial quality passes**. The English duration concern was conservatively retained; it is not proof that source footage is missing. The Romanian run exposed the prerequisite-chain and repeated-wording issues corrected above. Their regression tests and vet pass; the final replay results are recorded below.

Replay reuses verified source analyses and proxies; it does not overwrite the initial evidence or imply a fresh-transcription speedup. The Romanian and English replays verified all 5/10 originals and reused 28/46 immutable cache files respectively. Sampled output frames confirmed corrected upscaling. The Romanian original itself contains pillarboxing; uncertain face detection deliberately retains the whole source frame rather than inventing a crop.

### Final code verification runs

| Input / target | Run | Result | Wall time / provider calls |
| --- | --- | --- | --- |
| Romanian, 5 excerpts / 30 seconds | `results-verified/run-20260923T070657Z-4279415657` | `needs_review`; planner call failed, media review reported transcription/caption and a possible speech-boundary defect | 131.10 seconds / 2 |
| English, 10 excerpts / 45 seconds | `results-verified/run-20260923T070659Z-2974729910` | `needs_review`; planner call failed, source-order fallback retained with incomplete semantic approval | 111.42 seconds / 2 |

Both final runs verified and decoded their sources and outputs. Their media-review responses passed identifier/schema validation. The planner failures did not expose raw provider payloads or credentials, and the reports do not establish a specific HTTP error or quota cause. Neither fallback was promoted to Ready. The final prerequisite-chain repair is covered by passing regression tests, but its success on these actual sources was **not** established by these final runs because planning was unavailable.

The final API/worker compilation check passed after an unrelated concurrent Workspace Agent edit was completed. Final Story/processing/CLI vet and frontend TypeScript checks also passed. There is no running evaluation left in the background and no recurring retry was scheduled.

For local review, every run contains `summary.json`, `quality-report.json`, `result.json`, exact timeline/source references, and the preview path. Paths in the tables are relative to `.cache/story-evaluation/`. These reports intentionally retain failed and incomplete attempts; no result was edited to manufacture a pass.

## Remaining human acceptance

For each resulting edit, compare the original audio and video with the selected source intervals, every join and the burned captions. Record whether the edit preserves speaker attribution, qualifications, numbers, negations and necessary context; whether speech is complete and intelligible; whether crop, caption text/timing and the narrative work. Record concrete defects and timecodes, not only a rating.

AC24 remains pending until a human performs that review. Independently recorded, permissioned iPhone/Android sessions are also needed for the device/retake matrix. HDR/Dolby Vision remains explicitly unsupported. An automated `ready` status would not close either acceptance gate by itself.
