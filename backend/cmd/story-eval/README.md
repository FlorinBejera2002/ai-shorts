# Local story evaluation

For recorded-voice montage, add `-narration-file path/to/voice.wav` to an input run. The complete original recording controls duration; camera audio is muted. Supported audio and review gates are documented in [story-narration.md](../../../docs/story-narration.md). A replay keeps and revalidates its original recording; provide a new `-input` run to replace it.

For permissioned fixture diagnosis, `-capture-responses` saves generated provider text in private local checkpoints. It never records request headers, credentials, prompts or media. Keep these local diagnostic outputs private; model replies can contain source-derived text. Capture does not change the configured model or its cache identity.

Run the actual Story Builder against permissioned MP4/MOV fixtures without a
database, uploads to the application, publishing, or changes to existing runs.

From `backend`, after setting `FFMPEG_PATH`, `FFPROBE_PATH`, `WHISPER_CPP_PATH`,
`WHISPER_CPP_MODEL` and optionally `PIGO_FACE_MODEL` to local native binaries/models:

```powershell
go run ./cmd/story-eval -input ../.cache/story-evaluation/ro-5 -output ../.cache/story-evaluation/runs -language ro -target 45
```

Set `STORY_WHISPER_CPP_MODEL` to a higher quality multilingual model when available;
the worker image bundles `large-v3-turbo-q5_0`. Without this variable the CLI uses
`WHISPER_CPP_MODEL`, so a run with the base model must not be mistaken for an
evaluation of the worker's story default.

The default is `-provider offline`: local ASR and rendering run, external AI is
disabled, and the draft remains `needs_review`. `-provider configured` explicitly
enables the existing Gemini/OpenRouter provider from process environment
(`AI_PROVIDER`, the matching API key and model variables). The command does not
load `.env` files. External analysis/review is capped at 12 reserved calls,
including failed requests, and two repair cycles; lower these with
`-max-ai-calls` and `-repair-cycles`.

Sources use sorted filename order, or the exact filename permutation in optional
`manifest.json` → `upload_order`. No manifest path can escape the input directory.
Each run creates a unique output subfolder containing immutable original copies,
source hashes and attribution manifest, append-only checkpoints, every candidate
version, the best preview, `quality-report.json`, `repair-attempts.json` and
`summary.json`. Transcripts stay in these local report files; console output only
shows progress, status, call count and artifact paths.

Inspect the final media and source provenance manually. A `ready` automated report
does not replace the permissioned human launch evaluation. Interrupted or failed
runs preserve their original copies, checkpoints and prior rendered versions.

## Replay an existing evaluation

Use `-replay` instead of `-input` after a planner, renderer or reviewer fix:

```powershell
go run ./cmd/story-eval -replay ../.cache/story-evaluation/runs/run-20260923T063240Z-2820516157 -output ../.cache/story-evaluation/replays
```

Replay remains **offline by default**, even when the previous run used an external
provider. Add `-provider configured` explicitly to enable paid calls; the current
`-max-ai-calls`, `-repair-cycles` and `-timeout` budgets apply independently to the
new evaluation. It does not resume prior paid requests or rejected repair attempts.

The previous brief, language, target, aspect, mode, caption setting and source order
setting are retained. Explicit flags override those options. Native model paths
come from the current process environment, so keep the same speech model to reuse
ASR results. Changing the speech model, transcription language or analysis version
correctly invalidates the corresponding cached analysis.

Every replay creates a new unique run folder with new request, provenance, reports
and append-only checkpoints. It reads the previous request and latest asset
checkpoints, then runs production media inspection and verifies each original's
SHA-256, size, stream properties and source clock before trusting source analysis.
Missing, changed, malformed or inconsistent sources/metadata stop the replay.
Original dataset paths are attribution only; the original dataset need not remain
mounted because validation uses the preserved originals in the run's media folder.

The new media folder reuses only the prior request's confined `sources/`, `work/`
and `clips/` namespaces. Immutable files use hard links when supported, with an
exclusive-copy fallback across volumes. Originals, proxies, caches and previous
reports are never overwritten or deleted. New outputs append under their own
version keys; the original request ID is retained to match analysis cache prefixes,
while version numbering starts above all prior saved versions and repair attempts.
A replay can itself be used as the next `-replay` input.

`provenance.json` records the previous run/request digest, verified source count,
cache link/copy counts, starting version, previous provider/model and current model
configuration. `summary.json` continues to record elapsed seconds and actual
provider calls. Run folders contain linked immutable media: use the evaluator's
append-only operations rather than manually editing their media files in place.
