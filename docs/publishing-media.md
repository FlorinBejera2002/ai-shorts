# Device uploads and ordered carousels

Verified against current official documentation on 2026-09-16.

## Supported behavior

- The calendar accepts up to 10 uploaded images/videos and preserves their array order in PostgreSQL and provider requests. The first item is the carousel cover. Drafts may retain combinations that a chosen destination cannot publish.
- Instagram supports image, video, and mixed carousels. Each child is created with its correct media type. The worker saves ordered child IDs, polls their readiness, creates the parent only after every child is ready, and then publishes the ready parent.
- Each remote mutation has a durable intent. An ambiguous parent creation/publication is marked unknown and is not automatically repeated. All destinations are checked before any calendar jobs are queued.
- Facebook currently supports photo sets or one video through this integration. Mixed sets and multiple videos are rejected before scheduling. TikTok's existing direct publishing flow supports one video; calendar publishing remains limited to Instagram and Facebook. YouTube publishing is unavailable.
- Meta video uploads must use MP4 or MOV. Unsupported originals can remain in drafts; they are not silently transcoded. Container validation does not replace provider validation of codecs, duration, frame rate, and other platform requirements.

## Original quality and platform constraints

Uploaded originals retain their bytes and dimensions. JPG is used directly. PNG/WebP receives a separate JPEG at quality 100 for Instagram, with transparency composited on white. This conversion is not lossless. Originals and previews keep the original reference, including after saving and reopening a draft. Oversized prepared Instagram JPEGs are rejected at scheduling/processing rather than automatically compressed or resized.

Meta requires JPEG images and a maximum 8 MB image file. Its API accepts at most 10 carousel children. Carousel cropping follows the first image; Meta can also resize media or convert color space. Its current media reference lists MP4/MOV and H.264/HEVC requirements for reels, with a 300 MB reel maximum. Preserving originals in Sneep Cut does not guarantee identical bytes, crop, or quality after platform publication. Sources: [Meta content publishing](https://developers.facebook.com/docs/instagram-platform/content-publishing/), [Meta IG User Media reference](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media/).

TikTok's photo endpoint accepts a photo list and an explicit cover index; it is separate from video publishing. That endpoint has not been added by this change. Source: [TikTok photo publishing](https://developers.tiktok.com/docs/en/content-posting-api-reference-photo-post).

## Verification

Nginx configuration validation passes. An isolated nginx instance with a stub upstream accepted all 10 rapid uploads with HTTP 201; the publishing route permits a burst of 20 while retaining its 2 requests/second limit and the backend's 60 uploads/hour limit. Uploads stream through the proxy with a 600-second timeout.

Frontend verification: all 18 focused Node tests pass (`node --test tests/publishing-media.test.mjs tests/content-calendar-validation.test.mjs` from `frontend`), together with TypeScript and Biome checks on the changed files. React Doctor reports no errors in its changed-file scan; remaining warnings concern existing component complexity.

`frontend/scripts/test-publishing-media-browser.mjs` runs against a local frontend and intercepts every API request with a synthetic account. It verifies desktop mouse dragging, touch dragging at 390 px, keyboard reordering through the handle, multi-selection, incremental additions, retained successes on partial failure, retry of the same file, removal, the total count limit, unchanged multipart bytes, saved order, and loaded previews after reopening. Item controls contain only the drag handle and removal button. Uploads show a large centered indicator, current filename, and per-file steps until the batch finishes; the fixture holds upload responses to check both desktop and mobile loading states. Set `SNEEPCUT_BROWSER_URL` to the local frontend (including `/ro` for Romanian) and, if needed, `PLAYWRIGHT_MODULE` to an installed Playwright module. This browser fixture mocks HTTP; the Go suite below separately verifies real database and upload handlers.

Native multi-file input and FormData follow [MDN file-input guidance](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/file) and [FormData guidance](https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest_API/Using_FormData_Objects). Touch/pointer handles and scroll-container measurements follow [Motion Reorder](https://motion.dev/docs/react-reorder). HEIC/HEIF requires an exported JPEG copy; the interface states this restriction.

Focused Go tests exercise mixed child payloads, order persistence, video readiness, child failure, durable parent creation, ambiguous-outcome non-retry, destination rejection before any enqueue, and changed library-clip rejection. Real PostgreSQL tests use random schemas inside a disposable `sneepcut_integration_test` database. Upload tests cover missing/generic mobile MIME metadata, originals, prepared images, authenticated previews, and image size preflight. HTTP policy tests cover the longer device-upload timeout.

The affected Go packages (`calendar`, `publishing`, `media`, `httpapi`) passed `go test -race` with the current migration fixture, followed by `go vet ./...`. The disposable PostgreSQL container was removed after verification; no persistent development database or media volume was changed. Frontend verification passed 18 focused Node tests, TypeScript checking, and Biome.

Real external publication, a physical phone's native picker, and provider-specific transcoding are separate live acceptance checks. No social post is published by the local test suite.

## Local backend synchronization

If every device upload returns HTTP 404 while the new picker is visible, check the running Go backend version. The frontend uses mounted source files; Go uses copied source and Compose Watch. Without an active `make dev-watch`, new backend routes are absent until the service is rebuilt. A plain backend restart does not copy changed source. This follows Docker's [Compose Watch synchronization model](https://docs.docker.com/compose/how-tos/file-watch/).

To apply the current backend without restarting the frontend:

```sh
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build --no-deps backend-go
# Wait for backend-go to become healthy before reloading the proxy.
docker exec sneepcut-nginx-1 nginx -t
docker exec sneepcut-nginx-1 nginx -s reload
```

Verify `/api/ready` returns HTTP 200 through nginx. An unauthenticated `POST /api/publishing/media` should return HTTP 401, not 404. Test authenticated uploads only with an isolated fixture account/database.

The 2026-09-16 follow-up reproduced two upload requests returning 404 against stale Go source. After rebuilding only Go and reloading nginx, readiness returned 200 and the upload route returned 401 without credentials. Frontend regression coverage now checks 404/405 and server errors show service unavailability instead of implying invalid files. All 19 focused Node tests, TypeScript, Biome, and the desktop/mobile browser fixture passed; React Doctor remained at 71/100 with no errors.

Local media files use owner/group permissions (`0750` directories, `0640` files). The Compose nginx service runs as the same UID/GID `10001:10001` as Go, with the media volume mounted read-only. This allows signed previews to read originals without widening filesystem permissions. The PID and temporary paths are under `/tmp`, following the official [NGINX unprivileged container guidance](https://github.com/nginx/docker-nginx-unprivileged). Changes to the service's user require recreating nginx (`docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --no-deps nginx`); reloading its configuration alone does not change the container user.

`node backend-go/scripts/test-publishing-media-integration.mjs` now verifies the full HTTP path using a fresh local Go image, the repository nginx configuration, current migrations, a synthetic account, and disposable PostgreSQL/Redis/media. It passed with two concurrent JPEG uploads (1,224,506 and 2,448,327 bytes), PNG and MP4 uploads, signed previews with identical SHA-256 hashes, unsigned-preview rejection, a separate full-dimension JPEG derivative, and mixed draft save/reorder/reload. The runner lists its local image prerequisites and removes its isolated resources in `finally`. Evidence is written to `.cache/sneepcut-publishing-http-test-<id>/verification.json` and `media-evidence.json`.

The matching nginx ownership/runtime-path correction is also included in the production configuration; its nginx syntax was validated in a disposable container. Only the local Go and nginx services were updated. No production deployment or external social publication was performed.
