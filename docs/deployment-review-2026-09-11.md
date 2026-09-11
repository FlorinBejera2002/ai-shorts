# Production deployment review — 2026-09-11

Target: `root@159.195.254.38`, `/opt/sneepcut`.
Notion ticket: https://app.notion.com/p/3d8c7071a198816399e8dbd6ae969f0f

## Corrections made during review

- Validate project folder parent ownership and project membership on create/move; PostgreSQL regression coverage included.
- Handle the possible undefined processing stage during TypeScript compilation.
- Use Windows-compatible file URL conversion and explicit Bash invocation in frontend tests; exclude the later Studio route from the historical redesign page count.
- Show Studio as unavailable when production has no valid HTTPS Studio origin, instead of connecting to the visitor's localhost. The renderer remains excluded from production pending execution isolation; see `studio-self-hosting.md`.

## Verification

- Frontend: 91 Node tests passed; TypeScript passed; Biome passed for the three React/config files changed during this review.
- Go: all unit tests and vet passed; affected projects/account/identity/scripts/publishing integration tests passed against disposable PostgreSQL.
- Migrations: fresh database upgraded through `20260911_0003` successfully.
- Python downloader: two affected tests passed in a disposable container.
- React Doctor: 70/100, eight warnings, no errors. Remaining warnings concern test code, state organization and component complexity; no baseline comparison is claimed.
- Local browser check could not complete because the existing local frontend returned HTTP 500. Production browser verification is recorded separately below.

## Backup

Created `/opt/sneepcut-backups/predeploy-20260911-093633` before activation. PostgreSQL custom-format dump has a readable restore catalog; media archive listing passed. Media archive is approximately 301 MB. This verifies archive readability, not a full restore rehearsal.

## Release status

Release `4ffed045fb79e345` is active. Previous application checkout is retained at `/opt/sneepcut.previous`. All three new migrations applied successfully in production.

Public readiness reports database, Redis and schema ready. Unsigned media returns HTTP 403. Nginx validation, ClamAV ping, proof-of-origin provider connectivity, Deno/yt-dlp checks and Celery ping passed. Frontend is healthy and both public domains respond successfully.

Production browser checks passed for home and English/Romanian login pages. The processing panel passed simulated progress, terminal polling, success, failure, cancellation, mobile overflow and reduced-motion checks with no page errors. Screenshots were visually inspected. Authenticated browser data was mocked; no real customer account was modified and no full live video processing/provider transaction is claimed.

Studio shows its unavailable state with zero localhost requests. The standalone renderer and alternate Vite frontend were not deployed. Studio execution isolation remains a release blocker, so the overall all-components ticket remains in Testing rather than Done.

## Studio follow-up (in progress)

Ticket: https://app.notion.com/p/3d8c7071a19881c4a443e63315933e59

The follow-up adds a production Studio service, HTTPS gateway, persistent storage,
frontend URL configuration and component release commands. DNS for
`studio.sneepcut.com` resolves to the existing application server. Rendering,
thumbnails and background removal now use per-job Bubblewrap namespaces.
A thumbnail traversal issue was corrected and covered by regression tests.

Deployment/session frontend checks pass (15); focused thumbnail checks pass (20).
Sandbox TypeScript and lint pass. Linux runtime checks now pass: native file,
credential and network isolation; JPEG thumbnail; MP4 export and duration metadata;
foreground PNG from the bundled model; cancellation without output; symlink rejection
(2 tests, 13 assertions). Auth/origin checks pass (9 tests, 86 assertions), including
www support. The final sandbox rerun also covers explicit-port thumbnails and compositions
using GSAP CDN URLs, rewritten to bundled scripts for offline rendering. Supporting
asset/runtime tests pass (3 tests, 22 assertions). TypeScript and lint pass after
these fixes. The disposable production-entry browser test passed: preview/play/pause,
JPEG response (200, 3511 bytes), saved composition readback, completed render and
MP4 download (200, 118556 bytes, ftyp signature). Screenshot visually inspected.
No runtime page exceptions or CDN failures; the unauthenticated fixture bootstrap
recorded only the expected favicon 401. Synthetic containers and network are
removed after verification. The final source was tested as a read-only bind over
the built image; a fresh production build remains required before activation. The first build is staged as `e042a81db228a429`; additional
review fixes require a fresh build before activation. Automatic approval review
rejected a temporary source transfer and explicit destination approval was
requested. Studio is not yet activated; the main release above remains active.