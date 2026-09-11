# SneepCut Studio integration

Studio is available in the dashboard at `/dashboard/studio`. It runs on its own
origin so its HTML/CSS editor dependencies do not interfere with the application.
The complete Studio editing APIs are retained, with per-account project storage
and render-job state. The existing clip recut editor is preserved.

## Local startup

Install the pinned workspace dependencies using Bun in `editor`, then build the
parsers, lint, studio-server, core, engine, producer, player, Studio, SDK and shader
packages. Start `bun packages/sneepcut-server/src/main.ts` from `editor`.
Local exports require both `ffmpeg` and `ffprobe` on PATH, plus Chromium.
Alternatively set `HYPERFRAMES_FFMPEG_PATH`, `HYPERFRAMES_FFPROBE_PATH` and
`PRODUCER_HEADLESS_SHELL_PATH` to locally installed executables. These names
are compatibility configuration keys, not calls to external services.
Alternatively add `docker-compose.studio.yml` after the base/development Compose
files and build/start the `studio` service. This overlay binds only to loopback;
it is not a production deployment configuration.

The development frontend defaults to `http://localhost:5191`. Configure
`NEXT_PUBLIC_STUDIO_URL` at frontend build time when changing that address.
The Vite frontend uses `VITE_STUDIO_URL` for the same setting; set
`SNEEPCUT_APP_ORIGIN=http://localhost:5173` when running that frontend locally.
`SNEEPCUT_APP_ORIGIN` must exactly match the browser's application origin;
`SNEEPCUT_STUDIO_ORIGIN` must match the editor origin. Use same-site HTTPS origins
outside localhost for Strict session cookies. The auth backend is selected by
`SNEEPCUT_AUTH_BASE_URL` (default `http://localhost:8080`).

## Storage and AI

`SNEEPCUT_STUDIO_DATA` is persistent user data. Each account has isolated UUID
project directories. Do not delete this directory or its Docker volume as a test
cleanup operation. `SNEEPCUT_REGISTRY_DIR` points to the vendored catalog in a
packaged deployment. Missing catalog assets are errors, not upstream fallbacks.

The independent assistant uses an OpenAI-compatible server selected by
`SNEEPCUT_AI_BASE_URL` (including its API version path), `SNEEPCUT_AI_MODEL`, and
optional `SNEEPCUT_AI_API_KEY`. It can target your own model host. No default
HeyGen endpoint or key is used. Without a configured model, the assistant reports
unavailability instead of fabricating success. Proposals do not write files;
the user reviews and applies them using the editor's version-checked save API.

## Production deployment

The production Compose stack includes Studio at `https://studio.sneepcut.com`,
with persistent `studio_data` storage and backend session validation. The
frontend receives that HTTPS URL at build time. Both apex and www application
origins are explicitly allowed through `SNEEPCUT_APP_ORIGIN` and the comma-separated
`SNEEPCUT_APP_ADDITIONAL_ORIGINS`. Caddy terminates HTTPS and
proxies Studio on its separate Docker network.

Use `make prod-build-studio` to stage the image and `make deploy-studio` to
build and activate Studio, its frontend integration and the gateway. The
release scripts also include Studio when deploying `all`. `DEPLOY_HOST`
selects the configured SSH destination. Deployment verifies service health
and rejects unauthenticated project listing.

Rendering, thumbnails and background removal run in per-job Linux namespaces,
with only the current project's inputs, cleared environment and no external
network. The container and job limits are documented in
[the execution policy](../deploy/studio-sandbox.md). Namespace creation failure
is a job failure; there is no fallback to running untrusted compositions in
the Studio server process. The background-removal model is baked into the image.

The disposable production-image browser verification is documented in
[production-image.md](../editor/packages/sneepcut-server/verification/production-image.md).
It uses synthetic auth and tmpfs project storage, never production accounts or
persistent volumes. Release verification must include actual render output
and file/network isolation checks before activation.

Do not equate the independent assistant with reproduced proprietary avatar,
voice, lip-sync or video-generation models. Those capabilities require separate
implementation and validation. The copied source retains its Apache license
and attribution; product branding does not remove those obligations.