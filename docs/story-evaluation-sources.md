# Public real-video evaluation sources

These recordings provide reproducible Romanian and English speech inputs for local Story Builder verification. They are publicly licensed recordings, not synthetic voices. Source and license pages were checked on 22 September 2026.

| Source | Creator | Language | License and provenance |
| --- | --- | --- | --- |
| Raluca speaking Romanian | Wikitongues; recording by Nick Panzarella in Cluj-Napoca | Romanian | [Commons source](https://commons.wikimedia.org/wiki/File:WIKITONGUES-_Raluca_speaking_Romanian.webm), [original publication](https://www.youtube.com/watch?v=6TiSKGRjYLs), [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| Jane Goodall, The Green Interview | The Green Interview | English | [Commons source](https://commons.wikimedia.org/wiki/File:Jane_Goodall,_The_Green_Interview.webm), [original publication](https://www.youtube.com/watch?v=AOHoAi6qN14), [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) |

Credit these creators and link the respective source and license when sharing excerpts or resulting evaluation edits. Indicate the excerpting, transcoding and editing changes. Raluca adaptations retain CC BY-SA 4.0. Nothing here implies a creator or speaker endorses Sneep Cut. Recordings and derivatives stay out of Git under `.cache/story-evaluation`.

## Reproduction

Run `node backend/scripts/prepare-story-evaluation.mjs` from any working directory. The script locates FFmpeg/FFprobe on PATH or through `FFMPEG_PATH` / `FFPROBE_PATH`, with the existing local portable toolchain as a fallback. It streams at most 100 MiB per original, uses bounded timeouts, does not overwrite originals, does not delete files, and stops a source on HTTP 429 without retrying the rate limit.

Alternatively, `node backend/scripts/prepare-story-evaluation.mjs --creator-source` acquires each creator's original public YouTube publication, using the same Go public-stream library as the application. This mode additionally requires Go (PATH, `GO_PATH`, or the local portable toolchain). It never supplies cookies or credentials and does not bypass unavailable/private streams. `acquisition.json` distinguishes the actual acquisition URL and resulting file hash from the Commons license reference.

For each source, the script prepares `ro-5`, `ro-10`, `en-5` and `en-10` input directories where applicable. Each directory contains H.264/AAC MP4 excerpts and a `manifest.json` with exact original in/out times, hashes, transformation notes and a deterministic shuffled upload order. `acquisition.json` records actual preparation success or failure, original hashes and probe durations. Decode checks cover the complete generated files.

The Romanian evaluation window is original seconds 0–92. The English window is seconds 0–160. Each is divided into 5 or 10 consecutive windows, extended by 1.5 seconds on either side within the source window. This overlap provides duplicate speech and recoverable boundary context. It does **not** create independently recorded alternate takes. Upload order is shuffled; filenames and manifests retain recoverable source provenance.

## What this dataset can establish

These inputs exercise real speech, original-context references, multilingual transcription, global reordering, duplicate content, source mapping, crop safety, file decoding and finite review/repair behavior. Artificial excerpt boundaries intentionally expose incomplete phrase edges: the editor must select supported whole phrases or report missing material.

They do not establish broad phone/device/HDR coverage or performance on genuinely independent recordings, retakes, changing camera angles and lighting. The two recordings must be evaluated as separate stories; mixing their unrelated narratives is an insufficiency case, not a coherent-content target.

No human editorial approval is implied by acquiring, transcoding, decoding, transcribing or running an AI reviewer. AC24 remains open until a human compares original recordings with final edits for meaning, attribution, speech, transitions, framing and captions. Add independently recorded, permissioned phone sessions to the launch dataset.

## Acquisition status

The initial Wikimedia downloads returned HTTP 429. Both creator-published originals were then acquired successfully from their licensed public YouTube publications. The preparation script records current status and never treats a missing download or failed pipeline run as a pass. Consult local `.cache/story-evaluation/acquisition.json` and evaluation reports for the latest actual result.
