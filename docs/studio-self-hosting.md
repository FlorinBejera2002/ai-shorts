# SneepCut Studio integration

All generated clips appear in one library at `/dashboard/clips`, including
ordinary clips and Story results. Opening a clip establishes an authenticated
Studio session and navigates directly to its project on the configured Studio
origin (`VITE_STUDIO_URL`, the Studio subdomain in production).

Studio is the application's only editor. The dashboard has no embedded Studio,
secondary clip editor or separate editing gallery. `/dashboard/studio` launches
an existing owned Studio project, creating a private blank workspace only when
none exists. Legacy clip detail/edit URLs and Studio clip/project query links
also launch the main Studio. Failed authentication or project preparation stays
on a retry screen with a link back to the clip library.

The creation wizard still prepares sources, generation options and progress.
Completed Stories show a read-only result preview, downloads and an **Open in
Studio** action. Manual editing happens in Studio. Ordinary dashboard navigation
continues to preserve the shared layout and sidebar state.

## Story editing

Newly generated Stories and ordinary clips already have a native Studio
composition: the worker renders that document through Studio's sandbox. Opening
the result copies the exact saved document and assets into an editable project.
Later opens reuse that project without replacing manual edits. See the
[shared composition pipeline](studio-composition-pipeline.md) for versioning,
native trims, service configuration and verification.

Source scenes remain separate editable groups. Drag either end of a scene to shorten or extend
it within the source duration. Camera audio, cleaned speech and its captions
remain attached when the scene is trimmed or moved; double-click the scene to
edit its contents. Narration and music remain on independent tracks, so review
their synchronization after changing scene timing. Extending footage beyond the
originally transcribed interval may require additional captions.

Caption text, timing, font weight and spacing remain editable, with the selected
font copied into the project. Music credits are retained as an editable closing
layer and a text file. Undo and redo are available in the header on desktop and
mobile. The aspect selector supports 9:16, 16:9, 1:1, 4:5 and 2:3; changes are saved,
undoable and applied to the linked scene dimensions.

Select a scene and open **Inspector** to adjust brightness, contrast, saturation,
sharpening and camera/voice volume, or mute that cut. Each setting changes the
selected cut by default; its **Apply to all** action copies only that setting.
Split clips keep independent settings. Original Click, Pop and Whoosh sound
effects can be added at a cut's start, with separate volume and removal controls.
The effects remain at the cut boundary when source footage is trimmed. These
changes are saved with the project and support undo/redo. On phones, Inspector
opens as an overlay so the editing controls remain usable.

Native compositions retain the generated framing, transitions and overlays.
Review synchronization after moving or extending scenes. Automatic revisions
receive separate saved documents; an existing editable project is not overwritten.

Browser-incompatible camera media can use SDR preview proxies while the saved
document retains original render sources. Native compositions retain their SDR
or HDR render setting when opened in Studio.

Older clips without a native artifact reference use the compatibility importer.
That importer reconstructs Story transitions as cuts and uses static framing and
SDR editing proxies up to 1280 pixels. Its untouched completed video remains in
`original-export.html`, and `import-notes.txt` records the limitations. Existing
legacy projects and manual edits remain available. This compatibility path cannot
recover independently editable layers from a flattened MP4.

## Assistant and import security

The native Studio renews its existing 15-minute cookie session every five minutes
and when the tab becomes visible. A hidden authentication transport at the exact
app route `/studio-session` uses the app's existing HttpOnly refresh cookie and
connects to Studio with a freshly verified bearer. Credentials never enter URLs
or cross-frame messages. Both sides validate the exact origin and frame source;
renewal also checks the originally authenticated account before replacing a
session. The main Studio stays mounted during renewal and failures, retaining
pending edits. A retry action reloads only the authentication transport. If login
is required, sign in to the same account in a separate tab and retry.

Only HTML served by the authenticated SneepCut Studio host enables this flow;
upstream local Studio does not contact SneepCut authentication. A full-page visit
with an expired session returns through the existing dashboard launcher and
preserves a valid project identifier. Failed API requests continue to return 401.

Framing is allowed only for the authentication route: local Nginx permits the
explicit localhost Studio origins on port 5191; production Caddy permits only
`https://studio.sneepcut.com`. Keep that exact CSP exception aligned with any
deliberately changed Studio origin. Other dashboard routes retain their existing
framing policy. This transport does not embed an editor or create another Studio.

Studio's **AI assistant** edits the active composition; **Ask agent** on a selected
element passes its source file and selection context into the same assistant.
Proposals remain read-only until applied, use the current file version as a write
precondition, and record an undoable source edit. These tools use the authenticated
Studio AI endpoint and the configured provider below.

The editor uses neutral primary actions and shared radius tokens. Its canvas tools
remain a dark editing surface; the surrounding dashboard follows the app theme.

Studio revalidates clip ownership through the Go API. It accepts only the clip ID
from the browser, downloads the signed file from `SNEEPCUT_MEDIA_ORIGIN` (the
application origin by default), and publishes the project after initialization
completes. The finished-clip preview download is bounded to 512 MiB and 120 seconds.
Additional Story media has a five-minute deadline per download. The complete
editable Story project is limited to 500 MiB, including source files, proxies,
retained originals/exports, processed audio, fonts and music. Imports exceeding
that budget fail explicitly and clean up the partial project, before it opens.
This leaves headroom below the isolated renderer's existing 512 MiB project cap.
Media audio detection runs inside the same isolated job environment as rendering,
so silent clips and clips with audio receive the correct composition metadata.

For container deployments, `SNEEPCUT_MEDIA_INTERNAL_ORIGIN` optionally sets the
internal HTTP(S) origin used to download media. Studio still validates signed
URLs against the public `SNEEPCUT_MEDIA_ORIGIN` first, then preserves the path and
signature query when forwarding to that internal origin. The local Compose
overlay uses `http://nginx`, since public `localhost` URLs cannot reach the app
from inside the Studio container. The override accepts an origin only, without
credentials, paths, queries or fragments.

The import regression suites are `clip-import.test.ts`, `story-import.test.ts`
and `story-caption-import.test.ts` in `editor/packages/sneepcut-server/src`.
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
The base/development Compose stack includes `studio` by default and binds it only
to loopback. `docker-compose.studio.yml` remains an empty compatibility overlay
for older commands; it is not a production deployment configuration.
The local service uses the same unprivileged namespace security settings as production
and temporary job storage, as described in [the execution policy](../deploy/studio-sandbox.md).
Sandbox rendering requires Linux namespace support; a native Windows server alone
cannot run these isolated export jobs.

The development frontend defaults to `http://localhost:5191`. Configure
`VITE_STUDIO_URL` at frontend build time when changing that address; set
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

Compose deployments set `SNEEPCUT_AI_ROUTING=central`. The admin console's
**Modele AI → Studio: editarea compoziției** stage selects the model for every Studio assistant
proposal, including **Ask agent**. Before each proposal, Studio retrieves the
current provider/model from `/api/internal/ai-routing/studio` on
`SNEEPCUT_AUTH_BASE_URL`, authenticated with the shared `STUDIO_AGENT_SECRET`
(at least 32 characters). The lookup has a five-second deadline within the
proposal's existing 30-second limit. Admin changes affect the next proposal
without restarting Studio.

Provider credentials stay in Studio's environment: `OPENROUTER_API_KEY` or
`GEMINI_API_KEY`. The central response contains no credentials and cannot choose
an arbitrary endpoint. Studio uses fixed OpenRouter and Google API endpoints.
If central configuration is unavailable, invalid, or selects a provider whose
key is missing locally, the proposal reports unavailability. It never falls
back to a stale model or the standalone configuration. The Studio container and
API must have credentials for the same enabled providers.

Standalone installations can explicitly set `SNEEPCUT_AI_ROUTING=standalone`
(the default outside Compose). This mode uses an OpenAI-compatible server
selected by `SNEEPCUT_AI_BASE_URL` (including its API version path),
`SNEEPCUT_AI_MODEL`, and optional `SNEEPCUT_AI_API_KEY`; it can target your own
model host. When those Studio-specific variables are unset, Studio uses
`AI_PROVIDER` selection: `gemini` uses `GEMINI_API_KEY` and `GEMINI_MODEL_NAME`,
and `openrouter` uses `OPENROUTER_API_KEY` and `OPENROUTER_MODEL_NAME`.
`auto` prefers Gemini when its key is present, then OpenRouter.
Explicit provider selection never silently switches providers.
Gemini uses Google's [OpenAI-compatible API](https://ai.google.dev/gemini-api/docs/openai).
Custom Studio endpoint settings take precedence only in standalone mode and
require both a base URL and a model. They are ignored in central mode.

Background removal has its own admin stage, **Studio: eliminarea fundalului**.
Before starting the isolated job, central mode reads
`/api/internal/ai-routing/studio-background` with the same authenticated lookup.
The installed engine currently supports only `u2net_onnx / u2net_human_seg`;
the admin inventory does not imply that other segmentation models are available.
Studio validates this selection and passes it into the sandbox's render pipeline.
An unavailable or incompatible route fails before the sandbox job starts.
Standalone mode continues to use the same installed default model.

No default HeyGen endpoint or key is used. Without available AI configuration,
the assistant reports unavailability instead of fabricating success. Proposals
do not write files; the user reviews and applies them using the editor's
version-checked save API.

## Production deployment

The production Compose stack includes Studio at `https://studio.sneepcut.com`,
with persistent `studio_data` storage and backend session validation. The
frontend receives that HTTPS URL at build time. Both apex and www application
origins are explicitly allowed through `SNEEPCUT_APP_ORIGIN` and the comma-separated
`SNEEPCUT_APP_ADDITIONAL_ORIGINS`. Caddy terminates HTTPS and
proxies Studio on its separate Docker network.

Use `make prod-build-studio` to stage the image and `make deploy-studio` to
build and activate Studio, its frontend integration and the gateway. The
release scripts also include Studio when deploying `all`, `backend` or `workers`.
The initial switch to shared rendering requires the API, migration, worker,
Studio and gateway to deploy together as described in the
[composition pipeline](studio-composition-pipeline.md). `DEPLOY_HOST`
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
