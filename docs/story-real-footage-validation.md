# Real-footage validation — 30 September 2026

The user supplied 15 WhatsApp videos for private local evaluation: 250.935 seconds in total, 14 distinct SHA-256 hashes. One pair is byte-identical. Originals in Downloads were read and copied, never edited. The accompanying photograph was a visual reference, not a video input. Private footage, transcripts, diagnostics and previews remain under `.cache/whatsapp-story-evaluation/` and are not repository fixtures.

## Findings and fixes

- Loudness is not voice evidence. The previous RMS gate transcribed ambient recordings, including an English sentence in a clip for which Silero detected no speech. Story source/narration ASR now requires Silero VAD; missing detection fails automatic captions closed.
- Very weak measured lexical probability (below 0.20) now withholds the complete source phrase, preserving its original audio. It never removes just a weak negation or number. This threshold is an abstention rule, not a claim of transcript correctness. Narration reports the affected interval for review instead of silently removing recorded words.
- Whisper's VAD-remapped word clocks can bridge removed silence or overlap. A separate, cached VAD pass supplies original-clock evidence. Captions must belong to one local voice region; ambiguous phrases are withheld. Overlapping words inside one region become a coarse group containing their exact complete text. Short detector splits up to 250 ms can belong to one region; distant bursts cannot. In a real sample, a caption ending at 17.18 seconds was bounded to 11.41 seconds by measured voice evidence.
- SRT grouping no longer joins words across pauses longer than 250 ms.
- Sources with a short spoken passage now retain the rest of their footage as visual candidates: useful uncovered intervals are divided into balanced windows of 2–8 seconds, without invented captions or ASR confidence. Visual gaps do not become spoken antecedents. Fallback selection remains chronological.
- Exact duplicate uploads share local analysis/proxies and compatible semantic frame batches while retaining distinct source IDs, original keys, user settings and provenance. Replay accepts this sharing only between matching confirmed originals and still rehashes every original.
- Confidence/timing policies operate after loading immutable ASR caches. Cheap voice-evidence sidecars and derived catalog versions refresh without retranscribing the footage. Old analysis warnings are recomputed instead of accumulating stale language/speech messages.

## Verification

The final local replay used all 15 videos and the production pipeline, completed in 32.08 seconds with **zero external provider calls**, and produced a draft marked `needs_review` because independent AI review was disabled. This is a cached replay measurement, not the duration of first-time speech analysis or a quality approval.

- Full `internal/processing`, `internal/story` and `cmd/story-eval` Go suites passed with native FFmpeg and explicit Whisper/Silero controls enabled. Processing took 67.779 seconds in the recorded run. One existing symbolic-link escape test was skipped because this Windows host cannot create symbolic links; it is not counted as passed.
- Native negative controls: tone/noise do not produce spoken captions. Positive controls retain genuine speech after silence and across two utterances separated by six seconds, without captioning the intervening silence.
- Regression coverage includes weak negations, original voice clocks, overlapping words, unavailable detection, immutable cache reuse, duplicate provenance, visual gaps, context dependencies, chronological fallback and subtitle cue pauses.
- Processing/story/evaluator vet passed; the worker command compiled.
- Narrated-editor and normal Story browser regressions passed using an isolated browser and mocked API. Frontend typecheck and focused lint passed. React Doctor reported 98/100 with no issues in the scanned changed component.

Local evidence: `final-tests.jsonl`, `inventory.json`, `vad-summary.json`, and `final-local/run-20260930T075233Z-3540225983/` under the private evaluation directory.

## External model evaluation

The user explicitly approved sending selected frames, audio excerpts, transcripts and the rendered edit through OpenRouter, then requested a stronger model than the configured Gemini 2.5 Flash. The evaluation selects `google/gemini-3.1-pro-preview`, which supports video and audio input, with a maximum of six provider calls and one repair cycle. This evaluation override does not change the application's global default model.

The public model catalog and pricing were checked on the evaluation date: [Gemini 3.1 Pro Preview on OpenRouter](https://openrouter.ai/google/gemini-3.1-pro-preview). Published base pricing was $2 per million input tokens and $12 per million output tokens, with higher rates for larger contexts. Provider-call counts are not a dollar-cost measurement or application credit charge.

The actual Pro evaluation completed in 301.45 seconds with **five provider calls**. It selected ten sequences and rendered a 46.53-second, 1080×1920 H.264/AAC draft. Its status remains **`needs_review`**. The independent media review detected a cut-off spoken phrase and missing Romanian diacritics in a rendered caption. It also incorrectly treated an intentionally withheld caption as a transcription defect. The draft is evidence for review, not an approved professional output.

The attempted context repair exposed a chronological bug: a following continuation was inserted before its beginning. Repair now distinguishes preceding context from a proven following continuation, validates source bounds and overlap, preserves locks, and retains chronological audio. Regression coverage reproduces the captured 0–2.51 / 2.51–3.52-second intervals and verifies preceding/following dependencies, repeated repairs and locked blocks. Review prompts now distinguish deliberate caption abstention from incorrect rendered text and prohibit treating token confidence alone as proof of a wrong word. The focused processing review/caption tests passed after those prompt changes. These final changes have **not** had another paid end-to-end model evaluation; the saved preview predates them and retains the reported defects. No additional provider calls were spent.

Private evidence: `configured/run-20260930T075443Z-3706648543/` and the convenient draft copy `montaj-revizie-pro.mp4`. A six-frame contact sheet was inspected locally. Correct Romanian spelling still requires verification against the audio; this task does not silently rewrite uncertain speech.

## Limits

VAD and ASR are probabilistic. Retained captions still require actual audio comparison; automatic `ready` cannot replace human editorial acceptance. The local native speech runtime was whisper.cpp 1.9.3; the worker Dockerfile remains pinned to 1.8.3 with a narrow standalone-VAD argument-parser correction. The updated Docker image was not rebuilt or deployed during this task. The wider bilingual human launch evaluation remains separate from this dataset.
