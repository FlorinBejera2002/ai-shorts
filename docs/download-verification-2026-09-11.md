# Production download repair — 2026-09-11

Target: `sneepcut.com`, `159.195.254.38`, `/opt/sneepcut`.
Ticket: https://app.notion.com/p/3d8c7071a19881699615e68368fe0074
Downloader fix: `03936df22a23f63f678f74f709a589481e15970a`.

## Confirmed causes

- Production configured `/run/secrets/youtube-cookies.txt`, but the file was
  absent. yt-dlp attempted to save/create its cookie jar when closing. The
  directory is correctly mounted read-only, so this raised `OSError: [Errno 30]`.
- The same cookie setting was supplied for direct video URLs, affecting those
  downloads too. Cookie-save failures also hid the original extractor error.
- YouTube separately rejected access from this server with its authentication
  challenge. Both default and `mweb` clients reproduced it. The proof-of-origin
  service does not provide an authenticated session.

## Changes

- Use private, independent temporary cookie copies for actual YouTube hosts.
  Preserve the original secret and remove temporary copies on success/failure.
- Missing optional cookies allow a public download attempt; direct URLs ignore
  the YouTube cookie configuration. Explicit invalid cookie paths still fail.
- Present a clear upload/authentication action for the YouTube challenge.
- Add a temporary-workspace verifier for real download and processing tests.
- Wait for the proof-of-origin service to start during deployment verification.
  Initial deployment exposed a startup race; the all-service check passed once
  the service was listening. The follow-up adds bounded connection retries.

## Verification

- 26 downloader regression cases passed with real yt-dlp cookie load/save,
  including read-only source preservation, temporary permissions, concurrent
  isolation, cleanup, missing configuration and error classification.
- The deployment startup regression passed with real curl: the first connection
  was refused, a delayed `/ping` endpoint started, and verification continued to
  Celery successfully. All six existing deployment checks and shell syntax passed.
- Real processing passed before deployment and again inside the activated
  production worker: a 22-second synthetic spoken video downloaded over HTTP,
  transcribed into 58 words, selected by Gemini, cropped and captioned into one
  1080×1920 H.264/AAC clip. Thumbnail, independent local-upload copy, stored
  output bytes and full audio/video decoding passed. Post-deploy run: 41.53 s.
- A separate production-image API/Celery integration test used the dedicated
  `sneepcut_integration_test` database, disposable Redis/media and a synthetic
  account. Registration, login, authorized upload, durable dispatch, persisted
  completion, clip retrieval and media authorization passed. Unsigned media
  returned 403. Test containers, network and media directory were removed.
- In that isolated account, the real YouTube link `IWvLP4IHeVA` failed with the
  new authentication message, cleared `processing_active`, and refunded once:
  balance 90 → 80 → 90, remaining 90 on two later polls. No duplicate clip.
- Authenticated live browser checks passed for navigation, creation source tabs,
  project selection, root breadcrumb, Brand kit panel and existing clip playback.
  The player loaded 1080×1920 media with no media error and advanced past 10 s.
  No browser console errors were observed during these checks. No live project,
  credit balance or brand settings were modified by browser testing.
- All-service verification passed API/database/Redis/schema readiness, Nginx,
  ClamAV, Celery, frontend, public HTTPS and Studio health.

Backup: `/opt/sneepcut-backups/download-fix-20260911` contains an 84 KiB database
dump and 476 MiB media archive. Both catalogs were checked; no full restore test
is claimed. Persistent customer volumes were retained.

## Remaining external dependency

The YouTube cookie file is still absent. A post-deployment attempt of the actual
live project URL `IWvLP4IHeVA` returned the actionable authentication message,
with no read-only error. Full YouTube success cannot be claimed until a valid
cookie export is installed and the download is retested. See
[production authentication setup](production-backend.md#youtube-download-authentication).
The ticket remains in Testing for this reason.

The live account also had 10 credits while the default five clips cost 50.
Selecting one clip changed the cost to 10 and enabled Generate for a valid URL;
no generation was submitted from that account.
