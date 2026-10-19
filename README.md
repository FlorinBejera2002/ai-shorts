# Sneepcut

Sneepcut is a video-to-shorts stack with a React/Vite frontend, Go application API and media worker, Studio composition renderer, PostgreSQL, Redis, and Nginx.

## Prerequisites

- Docker Desktop with Docker Compose
- At least 6 GB of memory available to Docker for the ML worker
- Node.js 22 or newer for running frontend checks outside Docker
- Go 1.26.5+ for running backend checks outside Docker

## Quick start

From the repository root:

```bash
make setup
```

This creates an ignored `.env` from `.env.example` when needed, generates a missing local Studio service credential once, builds the images, applies the embedded SQL database migrations, and starts the stack including Studio. Existing credentials are retained. The worker waits for Studio and the media gateway before starting. Existing installations must add the new Go variables in [the migration handoff](docs/go-migration/handoff.md) before restarting. The first build is slower because the worker builds whisper.cpp and downloads its speech and face detection models, and Studio builds its browser renderer.

Run `make help` to see every available project command. `bash scripts/setup.sh` remains available as the original setup entry point.

Open:

- App: <http://localhost:3000> (also available at <http://localhost>)
- Backend liveness: <http://localhost/api/health>
- Backend readiness: <http://localhost/api/ready>

The default stack uses production-style frontend and backend images. Before using OAuth, Stripe, Gemini, or email delivery, configure their variables in `.env`. Unconfigured providers return explicit unavailable responses. The calendar stores drafts and scheduled posts; publishing requires a connected account and the configured publishing worker.

## Social publishing options

The Calendar composer supports a shared photo format for Instagram, Facebook and TikTok
(square, 4:5 portrait or 1.91:1 landscape), with position and zoom for each
photo. Alternative text and positioned user tags stay with their photo when
reordered, saved or scheduled. Crop previews use the same geometry as the
publishing copy; originals are retained. Alternative text is limited to 1,000
Unicode characters per image and is sent to Instagram and Facebook. Positioned
user tags are sent only to Instagram.

Instagram options include up to three collaborators, a Facebook Place ID,
and AI disclosure. Single Reels also support an uploaded cover or a cover
frame, an original audio name, feed sharing and trial sharing. Name-based
location search is unavailable through the current Instagram Login connection.
Comment controls are managed in Instagram: the publishing connection does not
request comment-management permission. Legacy drafts requesting disabled
comments must be reviewed before scheduling. Meta's [publishing reference](https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-user/media)
defines the platform restrictions; uploading a cover or naming original audio
does not add licensed music, filters or stickers.

Facebook Pages support a Place ID for posts and Reels, with an optional Reel
title and AI disclosure for single-video Reels. Photo alt text is sent through
`alt_text_custom`. Migration `049_20261019_facebook_options.sql` adds persistent
Facebook settings and must be applied when deploying this version.

TikTok photo posts support a chosen cover photo that follows the image when
reordered, automatic music and AI disclosure. Videos can select a cover frame
in seconds (sent as milliseconds). Existing creator-specific audience and
interaction controls still apply. TikTok does not expose per-photo alternative
text in its [photo publishing endpoint](https://developers.tiktok.com/docs/en/content-posting-api-reference-photo-post).

YouTube accepts a single video in this publishing flow. In addition to title,
description, visibility, audience, synthetic-media disclosure and notifications,
the composer supports tags, the standard or Creative Commons Attribution license,
and embedding permission. The 500-character tag budget includes comma separators
and quotes around tags containing spaces. Uploads use the documented
[videos.insert fields](https://developers.google.com/youtube/data/reference/rest/v3/videos/insert).
Changing upload settings requires renewed review consent. Custom thumbnails
are not included in this extension.

## Story Builder music

Story Builder searches Incompetech's public catalogue without a music-provider
account, API key or subscription. The application still uses its normal Sneep Cut
session. Catalogue metadata is cached and paginated; previews stream from the
provider. Only a selected track is downloaded by the media worker and cached in
shared media storage, outside the source checkout. Source licences and credits
are retained with each rendered version. The free CC BY 4.0 attribution is also
included in the video's final seconds and MP4 metadata, and can be copied from
the result for publication captions. See the provider's [catalogue documentation](https://incompetech.com/agent-section/)
and [licensing terms](https://incompetech.com/music/royalty-free/licenses/).

The worker detects rhythmic onsets from the selected recording, mixes music
continuously with fades and ducking beneath original audio, and aligns eligible
new-story visual cuts to nearby measured beats. It preserves the full recorded
narration and original word timing. Clips with original audio, unrecognized
speech, locked blocks and approved revision timings are not shortened to force
a beat match. Audio-free clips can lose at most 350 ms from their tail; narration
visual boundaries move only inside available distinct source footage. Uncertain
rhythm leaves cuts unchanged, and the result reports partial/unchanged alignment
instead of claiming full synchronization. Existing projects without music keep
their previous rendering behavior.

Catalogue outages are shown explicitly. If a selected track cannot be prepared,
generation fails before source analysis instead of silently dropping the music.
There is no provider subscription; normal storage, bandwidth and rendering
costs still apply. The API and worker must run the updated Go code; no database
migration or additional music service is required.

## Story uploads and HDR

Story Builder accepts H.264, HEVC and ProRes video in MP4/MOV, including HLG,
HDR10 and Dolby Vision profile 8 with a compatible HLG/PQ base layer. Originals
are retained. Files still undergo complete decoding before registration; damaged
media and Dolby Vision profiles without a compatible base layer remain rejected
with a specific explanation. Uploads use two concurrent transfers while up to two
additional files complete validation. A 200-file collection fits within the
registration rate limit, including retries.

The **Video color** selector offers SDR H.264 or HDR HEVC Main10 with BT.2020/PQ color.
HDR export preserves original highlights and composites captions, logos and music
credits in linear light at 203-nit graphics white. SDR clips in a mixed HDR story
retain their SDR detail. HDR exports include a separate tone-mapped H.264 preview
for browsers without HEVC playback; downloads and publishing retain the HDR file.
Analysis previews are always SDR, and their cache is independent of speech-model
and language changes so those changes do not re-encode the original video.

All generated clips are listed at `/dashboard/clips`. Opening one goes directly
to the main Studio on its configured subdomain; legacy detail and edit links do
the same. The dashboard has no separate clip editor or embedded Studio.
New automatic montages and clip edits share one editable Studio project.
Dashboard regeneration combines its current saved manual edits with the new
automatic changes, and commits only if no newer edit arrived during rendering.
Opening later results returns to that same project. Browser previews may
use SDR proxies for camera codecs, while export retains the original sources and
the composition's SDR/HDR setting. Legacy clips without a saved composition keep
their compatibility import. See [the shared rendering flow](docs/studio-composition-pipeline.md)
and [Studio editing behavior](docs/studio-self-hosting.md#story-editing).

## Caption typography

The caption editor supports named font weights, including bundled Inter Light
through Black (300–900), plus sliders for letter, word and line spacing. Saved
typography applies to the caption preview and rendered captions. Studio imports
the selected font and editable captions with their verified word timing.
Captions require recognized speech: when captions were requested for all speech
but none could be rendered, Story Builder explains the missing transcript instead
of presenting it as a font failure. Low-confidence phrases retain a proposed
transcript for explicit review: listen to the source, correct the text and approve
the passage to rebuild captions without changing the cuts or audio. Approval
requires measured voice timing; it does not lower the automatic confidence
threshold. Existing projects acquire proposals when their analysis is rerun.
Extending a scene in Studio can expose footage
outside its original transcript and may require additional captions.

## Hot-reload development

Use the development overlay with Docker Compose 2.32+ to publish PostgreSQL, Redis, and Go and enable source reload. Compose updates changed services without taking down the entire stack or deleting database/media volumes:

```bash
make dev
```

Development URLs:

- Nginx/app: <http://localhost:3000>
- Direct Vite dev server: <http://localhost:3001>
- Go API: <http://localhost:8080/api/ready>
- PostgreSQL: `localhost:5433` (container port remains `5432`)
- Redis: `localhost:6379`

If a host port is already in use, override it in `.env` before starting. For example:

```dotenv
POSTGRES_HOST_PORT=5433
REDIS_HOST_PORT=6380
GO_BACKEND_HOST_PORT=8081
FRONTEND_HOST_PORT=3002
```

Container-to-container ports do not change when these host overrides are used.

Keep `make dev` running while editing. Frontend source, public assets and translations are mounted directly; Vite hot reload picks up edits, including on Windows through polling. Compose Watch synchronizes Go source and restarts only the Go container (recompilation uses its existing cache). Worker source changes require rebuilding the worker image with `docker compose up -d --build worker`. The worker has up to five minutes to finish active jobs before stopping; avoid editing worker code during long jobs you want to preserve.

In PowerShell without Make, use:

```powershell
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build --watch
```

For detached services, run `make dev-up`, then keep `make dev-watch` open in a terminal for Go API reload. Without Watch running, only frontend hot reload is active; rerun `make dev-up` to apply Go API edits. `make restart-go` only restarts the last built or synchronized Go code.

After changing dependencies, a Dockerfile or `.env`, rerun `make dev` (or `make dev-up`) to rebuild/recreate affected services. `make build-dev` only builds images; it does not update running containers. Database schema changes still require `make migrate`. Use `make up` for production-style images, which intentionally do not hot reload.

The legacy `scripts/test-dev-reload.mjs` harness targets the previous stack and must not be used as migration evidence. Verify Vite Fast Refresh and Go reload against the development overlay.

Nginx preserves the frontend's cache headers so development CSS/JavaScript revalidate and production chunks retain Vite's versioned cache policy. After pulling a change to `nginx/nginx.conf`, apply it with `docker compose exec nginx nginx -t` followed by `docker compose exec nginx nginx -s reload`. If a browser previously cached development assets under the old one-year policy, use Ctrl+Shift+R once. To verify CSS updates through Nginx, run `node scripts/test-studio-header-reload.mjs` from `frontend` with Playwright available (or set `PLAYWRIGHT_MODULE` to its `index.mjs`). This uses mocked APIs, checks desktop/mobile rendering and cache headers, and temporarily appends then removes a CSS probe to verify two consecutive hot updates without a page reload.

Press `Ctrl-C` to stop the foreground command. Then remove the stopped containers with:

```bash
make down
```

## Common commands

```bash
# Show service status
make status

# Check API readiness, Story routes and the media worker
make health

# Follow logs for the whole stack
make logs

# Follow one service
make logs SERVICE=backend
make logs SERVICE=worker
make logs SERVICE=frontend

# Rebuild and restart after dependency or Dockerfile changes
make up

# Stop containers while preserving database and media volumes
make down
```

If a story stays queued, run `make health` and `make logs SERVICE=worker`. A working API alone cannot process videos: the separate `worker` service must be running. The health check fails if the worker is missing, stopped or restarting; it reports container state and does not start services or certify job progress. Start the development stack with `make dev-up`, or rebuild/start just the worker with `docker compose up -d --build worker`, then rerun `make health`.

To process only one pending Story while leaving the rest of the queue untouched, build the current worker and run `docker compose run --rm --no-deps worker --story-id <story-uuid>`. This one-shot command exits after the selected Story, never falls back to another job, and does not recover interrupted jobs. An unavailable or already claimed Story returns an error. Other running workers continue processing their queues independently; this command does not pause them.

For an explicitly selected Story that already has a rendered version, add `--improve` to queue one `Improve flow` revision and process it immediately: `docker compose run --rm --no-deps worker --story-id <story-uuid> --improve`. The revision reuses the Story's existing credit charge, preserves the previous version for comparison and still leaves unrelated queued work untouched.

To enable local upload malware scanning, include the security profile:

```bash
make security-up
```

## Local validation

Install the local frontend dependencies before running checks:

```bash
make install
make check
```

Run the Go backend tests:

```bash
make test-go
```

The Go API and worker live in `backend/`. The worker claims durable database jobs and runs FFmpeg, whisper.cpp and native Go processing. Vite serves the React application; Nginx forwards API and media requests. Database migration history is embedded in `backend/migrations`.

Docker builds run Go race tests/vet and the Vite production build. Database integration tests require the dedicated `sneepcut_integration_test` database and an isolated schema; skipped integrations are not passes. Frontend code must never receive backend provider secrets.

## Local storage maintenance

```bash
make storage           # Report size and distinguish tools/data from rebuildable outputs
make storage-check     # Check: 512 MiB generated, 3 GiB .cache, 8 GiB checkout
make clean-cache-plan  # Preview exact allowlisted paths
make clean-cache       # Delete those paths, after stopping local tests/builds
```

In PowerShell, the same commands are `node scripts/storage.mjs`, `node scripts/storage.mjs --check`, `node scripts/storage.mjs --clean`, and `node scripts/storage.mjs --clean --apply`. `make check` runs the storage budget check after its tests. Exceeding a budget fails the check; it does not delete data or enforce a filesystem quota.

Cleanup protects media, databases, backups, native tools/models, installed dependencies and Git history. It removes only known regenerable output directories and recognized local release archives, and refuses targets containing tracked files or symbolic links. Unknown directories require review. Scratch work belongs in `.cache/tmp/` with cleanup in `finally`; share `.cache/go-build` instead of making a new compilation cache per task. Run the storage check after artifact-producing work. Release archives are created only for requested release work; the deployment script already removes its local temporary archive on exit.

Sizes are logical file sizes, without following links. Docker images, external database/media volumes, and global package-manager caches are outside this report; deleting them requires a separate review.

## Environment notes

- `.env` is ignored by Git. Start from `.env.example` if it is missing.
- Set initial `AI_PROVIDER` to `gemini`, `openrouter`, or `auto`, then select
  models per task in **Admin → Modele AI**, including Workspace AI and Studio.
  Choices apply without restart; see [AI model routing](docs/ai-model-routing.md)
  for supported tasks, installed processing models and initial rollout.
- Google OAuth, Stripe, Resend/SMTP email, and S3/R2 storage each require their matching variables on the Go API or worker, as documented in [the handoff](docs/go-migration/handoff.md).
- Local media uses the `media_data` Docker volume; PostgreSQL data uses `postgres_data`.
- Do not use the placeholder secrets or database password outside local development.
