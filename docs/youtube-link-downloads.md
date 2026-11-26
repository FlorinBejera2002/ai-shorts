# YouTube links in Create clips

The YouTube source has two paths: the existing connected-channel library and
**Paste link**. Paste link queues one public or unlisted YouTube video through
`POST /api/jobs` (`source_type: youtube`, `source_url`). It uses the normal job
progress, cancellation, credit reservation, refunds and retry flow.

The worker selects the best available video stream up to 2160p plus its best
audio stream and merges them into MP4. The limit is **10,000,000,000 bytes**,
checked against known stream sizes and actual temporary/final files. Unknown
sizes cannot bypass it. Live/upcoming streams, playlists, arbitrary sites and
videos requiring an authenticated account are rejected.

Only this direct YouTube path skips antivirus. Uploads, narration, music and
Google channel-export imports retain their existing scanner requirements. The
client cannot request a scanner bypass.

## Runtime

The worker image includes a checksum-pinned official yt-dlp executable, its
bundled EJS components, Node.js and FFmpeg. `YT_DLP_PATH` and `YOUTUBE_NODE_PATH`
can select installed executables. Nothing installs plugins, updates itself,
loads user cookies or downloads executable components at job runtime. The
subprocess receives a small environment without application secrets. Its local
HTTPS proxy only permits public YouTube/media destinations and rejects private
addresses after DNS resolution.

`PROCESSING_TEMP_DIR=/app/processing-tmp` uses a private disk-backed mount,
outside served media and the memory-backed `/tmp`. Allow at least **40 GB free
per concurrent maximum-size job** for separate streams, merging, the retained
original and processing derivatives. Files are removed on completion, failure
or cancellation. A container/host crash can leave scratch directories; inspect
and remove only inactive `sneep-process-*` / `clip-studio-*` directories before
reclaiming that space.

S3 saves above 128 MiB use bounded-memory multipart uploads. Completion is a
conditional create, and failed multipart sessions are aborted. This requires an
unversioned S3-compatible bucket supporting conditional multipart completion.
No bucket policy, CORS, credentials or production data changes are performed by
this feature.

Originals above 256 MiB remain stored for future trims. Studio receives short,
full-resolution H.264/AAC windows of the chosen segments, with local source
offsets. Captions, tracking and retrim metadata retain the original timeline.
This avoids copying a multi-GB source into every clip's Studio project. Normal
clip export resolution continues to follow the existing aspect-ratio settings.

## Verification

- `node scripts/test-youtube-link.mjs`: authenticated creation/retries, credit
  refunds and fencing in `sneepcut_integration_test`, plus real local S3
  multipart/range/no-overwrite checks. Uses disposable schemas and random object
  prefixes; requires the local Docker stack and `sneepcut-go-dev` image.
- `frontend/tests/youtube-link.browser.mjs`: synthetic account and mocked API,
  English/desktop and Romanian/mobile, input validation, retry, state retention
  and mounted dashboard navigation. Set `PLAYWRIGHT_MODULE`, `TEST_ORIGIN` and
  optionally `TEST_FAST_REFRESH=1` for the reversible component-update check.
- Focused Go tests cover URL/delivery validation, subprocess isolation,
  cancellation, unknown-size overshoot, multipart cleanup and actual 4K source
  window timing. `TestPublicYouTubeDownload` is an opt-in real-network lane:
  set `SNEEPCUT_TEST_YOUTUBE_URL` to a video you may download, with the worker's
  pinned tools available. Its downloaded fixture is discarded automatically.

Production deployment and storage migration remain separate operations.
