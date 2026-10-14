# Optional audio cleanup — implementation and verification

The customer option is **Reduce background noise**. It defaults off for legacy
and new projects. It is speech-noise reduction, not a promise to remove a selected
background speaker. This implementation adds a configurable self-hosted adapter;
no paid provider was activated and no customer recording was used for evaluation.

## Release availability

The production image does not bundle DeepFilterNet binaries or model weights.
The authenticated `GET /api/media-capabilities` endpoint returns only an
`audio_cleanup.available` boolean. It defaults false and requires all three
administrator settings: `AUDIO_CLEANUP_VERIFIED=true`, `DEEPFILTER_PATH` and
`DEEPFILTER_MODEL`. Set these consistently for the API and worker only after
provisioning the worker assets, resolving their deployment terms and completing
representative quality checks. The API does not need model files mounted; the
verification flag attests that the separately deployed worker is ready. The
worker continues validating actual files and every processed output.

Creation controls remain unavailable while this capability is false, loading or
cannot be fetched. A previously saved enabled option stays visible with an
explanation and can be turned off. Generation and retry reject unavailable
cleanup before reserving credits; idempotent accepted replays, original-audio
recovery, comparison and saved-version restoration remain usable.

The upstream licensing evidence was rechecked for this release on 14 October
2026. [Issue #700](https://github.com/Rikorose/DeepFilterNet/issues/700) still has no
maintainer clarification covering weights. The tagged
[code license statement](https://github.com/Rikorose/DeepFilterNet/blob/v0.5.6/README.md#license)
explicitly covers code. A binary-only download is not a demonstrated solution:
[the native implementation](https://github.com/Rikorose/DeepFilterNet/blob/v0.5.6/libDF/src/tract.rs#L64-L83)
can embed default model weights. No inference binary or model is therefore added
to the published image. This does not affect original-audio generation.

Release gate checks passed on the isolated `sneepcut_integration_test` database:
unavailable Story and ordinary retry requests do not reserve credits, turning
cleanup off permits original-audio processing, and verified configuration permits
queuing. Browser checks cover unavailable versus configured controls on desktop,
original recovery/cancellation, and comparison playback on mobile. The selected
unavailable Story control remains reversible in component regression coverage.
These gate checks establish availability behavior, not real-world model quality.

## Runtime contract

Set absolute `DEEPFILTER_PATH` to the official Rust `deep-filter` executable and
`DEEPFILTER_MODEL` to an administrator-provisioned model archive. No model is
downloaded or bundled automatically. The worker calls the CLI with
`--compensate-delay --atten-lim-db 12`. It retains source channels, converts to
48 kHz PCM, appends a one-second tail before inference, then validates, fully
decodes and trims the derivative to the original duration. Padding before
inference avoids losing the final words when the CLI removes its lookahead.
There is no speech synthesis, time stretch, automatic silence cutting or loudness
normalization in cleanup.

Both ordinary jobs and Story Builder persist `audio_cleanup: {enabled: boolean}`.
Story assets store a separate derivative record; originals, source hashes, source
selection and word timestamps stay unchanged. Derivatives are immutable,
project-scoped and cached by original hash, processing version, model/executable
signature and settings. A manifest is written only after a valid audio file is
saved. Work is serial (one source subprocess at a time per existing worker),
cancellable through the existing lease context, and bounded to ten minutes per
source. Failed attempts can retry previously completed cached sources.
Temporary files are removed on every return.

Story cleanup requires existing aligned speech evidence, or an explicit
narration asset. No-audio sources have `no_audio` status. Footage without aligned
speech has `unchanged` status and keeps its original ambience/music with an
explanation. Neither state is presented as successful noise reduction.
The renderer chooses cleaned audio separately from original video, incorporates
the derivative into its segment-cache identity, and mixes intentional soundtrack
music afterwards. Disabling cleanup selects the original source; existing saved
versions remain usable.

Owned Story and job responses expose signed original/processed comparison URLs.
Raw derivative keys and signatures are removed from those responses. A missing
binary/model, malformed/truncated output, timeout, cancellation or failed save
cannot become a ready derivative or silently fall back to original audio.

Ordinary failure recovery uses
`POST /api/jobs/:id/retry` with a fresh `request_id`. An optional
`audio_cleanup: {enabled:false}` explicitly continues with the original.
The transaction checks ownership and idle failed/cancelled status, preserves the
source, reserves normal generation credits once, and requeues the same job.
Replaying the same request does not charge or queue again. Changing a replay
conflicts. Story draft recovery uses the existing options patch and generate;
saved Story outputs use a versioned restyle to disable cleanup.

## Candidate assessment (official sources checked 14 October 2026)

- **DeepFilterNet:** its [official repository](https://github.com/Rikorose/DeepFilterNet)
  documents a native Rust CLI, 48 kHz processing and compensation for STFT/model
  delay. That fits the Go worker without a Python media-stack replacement or
  usage-billed service. An isolated official v0.5.6/DFN3 run passed the real
  adapter and export checks described below; production capacity/cost has not
  been benchmarked. The repository licenses its code under MIT or Apache-2.0.
  The [open model-weights licensing question](https://github.com/Rikorose/DeepFilterNet/issues/700)
  has no maintainer clarification in the inspected discussion; this is why no
  pretrained model is redistributed by this change. Code licensing must not be
  presented as a verified separate model redistribution grant.
- **Auphonic:** [algorithm documentation](https://auphonic.com/help/algorithms/singletrack.html)
  distinguishes stationary-noise reduction, changing-noise reduction,
  dereverberation and speech isolation. The [API](https://auphonic.com/help/api/details.html)
  exposes separate noise/reverb controls, and
  [production controls](https://auphonic.com/help/api/update.html) support stopping
  a production. A hosted adapter would need durable remote production IDs,
  authenticated upload, bounded polling, cancellation, cleanup and output
  validation. The [pricing page](https://auphonic.com/pricing) currently states a
  three-minute minimum billed duration per production, making many tiny source
  uploads a material cost consideration; free productions include a jingle and
  cannot be accepted as a duration-preserving production backend.
- **ElevenLabs Voice Isolator:** the [API reference](https://elevenlabs.io/docs/api-reference/audio-isolation/convert)
  exposes multipart audio isolation with optional 16 kHz mono PCM for lower
  latency. Its [capability documentation](https://elevenlabs.io/docs/overview/capabilities/voice-isolator)
  describes speech extraction and warns that music-vocal isolation is not its
  optimization target. The [current API pricing page](https://elevenlabs.io/pricing/api)
  lists USD 0.12/minute and 500 MB/one-hour limits. The inspected endpoint does not
  expose a target-speaker identity or a durable remote cancellation handle.
  Aborting a request must not be advertised as cancellation of provider billing.

The self-hosted adapter is selected for operational fit, **not as a verified
quality winner**. Noise reduction, removal of room reverberation, isolation of
speech from music, and separation of one named speaker are different capabilities.
This adapter advertises only the first. Neither a model's name nor vendor samples
establishes preservation of Romanian speech or success with overlapping speakers.

## Evidence and remaining acceptance

Passing automated checks use the actual FFmpeg pipeline plus a deterministic
native provider fixture that scales audio. They establish immutable originals,
exact-duration derivatives, per-project cache separation, retry after failure,
missing configuration, malformed short output, timeouts, cancellation, restored
original audio, and audible-signal changes reaching actual Story and ordinary
exports. The fixture is intentionally **not a denoising-quality test**.

The dedicated `sneepcut_integration_test` database test verifies owned,
idempotent ordinary retries and once-only credit reservation. Browser verification
uses synthetic accounts and mocked APIs, including duplicate-click protection and
explicit original-audio recovery. No persistent development records are changed.

| Representative audio | Adapter/export checks | Real denoiser listening/quality |
| --- | --- | --- |
| Clean speech | Real DFN3 with synthetic English; duration/cache/export checked | Listening and real-world quality unverified |
| Wind and hiss/hum | Real DFN3 with white/filtered brown noise; quiet-window attenuation measured | Recorded wind/hum and listening unverified |
| Room reverberation | Real DFN3 processed synthetic echoes with timing intact | Real rooms/listening unverified; no dereverberation promise |
| Overlapping speakers | Real DFN3 processed delayed/pitch-shifted synthetic voice | Independent speakers/listening unverified; no target-speaker promise |
| Intentional ambience and music | No aligned speech keeps original | Unverified with mixed speech/music |
| Romanian speech | Timing contract unchanged | Unverified intelligibility/voice identity |
| No audio | Original video retained; no-audio state | Applicable automated check passed |

Browser checks passed at 1280×960 and 390×844 with real synthetic MP4 byte-range
responses: the option defaults off, enabled generation carries the setting,
failed retry reuses its request ID, duplicate clicks enqueue once, cancellation
works, explicit original recovery clears the option, and comparison retains its
playback position. Screenshots are in `frontend/test-results/audio-cleanup/`.
The database regression also replays an older request after subsequent cancelled
attempts and verifies no new job attempt or credit reservation occurs.

`go vet` passed for the affected packages. Native Windows race verification
could not build because that environment has no `gcc` compiler. Focused race
checks subsequently passed in the existing offline Docker Go environment for
the work-concurrency gate, derivative cache/retry/validation, active provider
cancellation/retry, and timeout cases. Evidence is retained in
`frontend/test-results/race-tests.log`; this does not claim a full application
race sweep.

Actual Story exports and extracted audio from the deterministic adapter are
retained in `frontend/test-results/product-evidence/audio-evidence/` for local handoff.
The processed export's frame was inspected and the audio was decoded and checked
numerically for duration, signal change and sample lag. Subjective listening is
unverified: the available inspection runtime did not accept audio input. These
fixtures contain a synthetic tone/noise signal, not representative spoken audio.
Before enabling a production model, run consented clean/noisy paired English and
Romanian recordings, measured wind/stationary noise, reverberation, overlapping
speakers, music and ambience. Listen at equal loudness, inspect speech endings and
negations, compare intelligibility/voice identity, and measure sample lag and
end-to-end A/V sync. Record CPU time, memory, licensing provenance and provider
charges. A configured binary alone is not this acceptance evidence.

## Actual official DFN3 evaluation

An isolated evaluation downloaded the [official v0.5.6 Windows executable](https://github.com/Rikorose/DeepFilterNet/releases/tag/v0.5.6)
and its [tagged DFN3 ONNX archive](https://github.com/Rikorose/DeepFilterNet/blob/v0.5.6/models/DeepFilterNet3_onnx.tar.gz).
No production configuration changed and neither downloaded asset is redistributed.
The real CLI accepted the adapter's flags and output filename; no compatibility
fix was necessary. Eight integration subtests passed using locally generated
English speech, seeded noise, synthetic echoes/overlap and music/ambience/silent
controls. The test supplied synthetic aligned-speech evidence to exercise routing;
it did not verify speech recognition or Romanian alignment.

The five processed speech variants retained 11.1-second video duration and had
0 ms measured sample lag. Quiet-interval RMS fell by 11.89 dB for stationary white
noise and 12.02 dB for filtered brown wind-like noise. Clean-speech waveform
correlation was 0.9999; this is not a listening or intelligibility score. Preparation
took 1.097–1.677 seconds per clip on this local run, with cached retrieval taking
3.2–5.6 ms. Peak memory and production capacity were not measured. Music and
ambience without aligned speech were kept unchanged; clips with no audio reported
that state without inference.

Actual Story processed/original and ordinary processed exports all have audio
and video starting at zero and lasting 11.1 seconds. Their correlation with the
selected audio reference exceeds 0.996, with 0 ms measured lag. This establishes
that real derivatives and explicit original restoration reach exported media.
The rendered test frame was visually inspected. Original/processed WAV files,
exported MP4/MP3 files, JSON measurements, passing logs, source URLs, SHA-256 hashes
and reproducible overlay test code are retained in
`frontend/test-results/product-evidence/audio-real/`.

This verifies operational compatibility and bounded synthetic signal/timing
behavior. Subjective listening, Romanian speech, recorded wind/room acoustics,
independent overlapping speakers, voice identity and real-world intelligibility
remain unverified. Synthetic echoes do not establish dereverberation, nor does
synthetic overlap establish target-speaker separation. No claim of a quality winner
against the unevaluated hosted candidates is justified. Production provisioning
and model deployment/redistribution licensing review remain separate requirements.