# SneepCut Studio integration

Studio is available in the dashboard at `/dashboard/studio`. It runs on its own
origin so its HTML/CSS editor dependencies do not interfere with the application.
The complete Studio editing APIs are retained, with per-account project storage
and render-job state. The existing clip recut editor is preserved.

The dashboard shows the clip gallery and an **Open workspace** action. The
workspace restores the last selected Studio project or creates one private blank
workspace. Its clips panel reads the
existing authenticated clip library, including search and pagination. Selecting
a generated clip imports an editable copy and reuses that project on later opens.
Original clip files and existing edits are preserved.

The projects panel can also create named blank projects. Session renewal and
reconnection keep the active editor mounted. Returning to the gallery or moving
between dashboard routes preserves the shared dashboard layout and sidebar state.

Studio's **AI assistant** edits the active composition; **Ask agent** on a selected
element passes its source file and selection context into the same assistant.
Proposals remain read-only until applied, use the current file version as a write
precondition, and record an undoable source edit. The dashboard's optional assistant
panel edits the main `index.html` composition. Both call the same authenticated
Studio AI endpoint and share the configured provider below.

The editor uses neutral primary actions and shared radius tokens. Its canvas tools
remain a dark editing surface; the surrounding dashboard follows the app theme.

Studio revalidates clip ownership through the Go API. It accepts only the clip ID
from the browser, downloads the signed file from `SNEEPCUT_MEDIA_ORIGIN` (the
application origin by default), and publishes the project after initialization
completes. Downloads are bounded to 512 MB and 120 seconds. Media audio detection
runs inside the same isolated job environment as rendering, so silent clips and
clips with audio receive the correct composition metadata.

For container deployments, `SNEEPCUT_MEDIA_INTERNAL_ORIGIN` optionally sets the
internal HTTP(S) origin used to download media. Studio still validates signed
URLs against the public `SNEEPCUT_MEDIA_ORIGIN` first, then preserves the path and
signature query when forwarding to that internal origin. The local Compose
overlay uses `http://nginx`, since public `localhost` URLs cannot reach the app
from inside the Studio container. The override accepts an origin only, without
credentials, paths, queries or fragments.

The import regression suite is `packages/sneepcut-server/src/clip-import.test.ts`.
The sandbox suite also exercises audio detection on actual silent/audible MP4s.
`frontend/scripts/test-studio-import.mjs` verifies the integrated frontend on
localhost:3105 with disposable Studio on localhost:5195. Use the production-image
fixture setup with `STUDIO_IMPORT_FIXTURE=1` on mock auth; it generates its own
synthetic video. Set Studio's media origin to `http://studio-import-auth:8080`.
The test browser bypasses CSP solely for the HTTP localhost fixture; production
uses HTTPS and retains its CSP. Never point these fixtures at production data.

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
The overlay uses the same unprivileged namespace security settings as production
and temporary job storage, as described in [the execution policy](../deploy/studio-sandbox.md).
Sandbox rendering requires Linux namespace support; a native Windows server alone
cannot run these isolated export jobs.

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
When those Studio-specific variables are unset, Studio shares the main app's
`AI_PROVIDER` selection: `gemini` uses `GEMINI_API_KEY` and `GEMINI_MODEL_NAME`,
and `openrouter` uses `OPENROUTER_API_KEY` and `OPENROUTER_MODEL_NAME`.
`auto` prefers Gemini when its key is present, then OpenRouter, matching the API
and worker. Explicit provider selection never silently switches providers.
Gemini uses Google's [OpenAI-compatible API](https://ai.google.dev/gemini-api/docs/openai).
Both local and production Compose stacks pass these settings to Studio; keys
remain on the server. Custom Studio endpoint settings take precedence and require
both a base URL and a model.

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
