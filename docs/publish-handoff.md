# Publish handoff to Tristan — 2026-09-08

The user assigned uploading and deploying the project to Tristan. No further
server transfers or deployment actions should occur without a new instruction.
The application is not live, and social publishing is not enabled.

## Existing server state

- SSH: `root@159.195.254.38`, hostname `v2202609414443516173.quicksrv.de`.
- Debian 13.6; Docker Engine 29.8.0 and Compose 5.5.1 installed from Docker's
  official Debian repository; Docker starts on boot.
- Sources were already transferred to `/opt/sneepcut` before the user clarified
  deployment ownership. Base revision: `65bc1c43fa9375a61aaa26b38e0be871e2079de6`.
  Production Compose/deploy files and the frontend test correction were overlaid.
- Backend Go, Python API and ML images were built. The frontend OpenNext build
  and Wrangler dry-run also completed there; no Worker was deployed.
- PostgreSQL and Redis containers were started and reported healthy. ClamAV was
  started but failed to parse CRLF configuration. The LF correction was copied
  afterward; its restart and successful readiness have **not** been verified.
- API, application worker, dispatcher, nginx and Caddy were not started. No
  application migration or TLS certificate issuance was performed.
- `/opt/sneepcut/.env.production.local` contains newly generated independent core
  secrets, mode 0600. Retain it; do not replace it with the example or regenerate
  the encryption key. Provider secrets remain unconfigured and publishing is off.
- Logs: `/opt/sneepcut/build.log`, `frontend-build.log`, `infra-start.log`.
  Named volumes use project `sneepcut-production`; do not delete them casually.

## DNS and Cloudflare

- GoDaddy: added DNS-only A `api` → `159.195.254.38` and TXT `@` with
  `tiktok-developers-site-verification=KvAuujEfOVdi9yxp6hgSfZQiYrU6MC4j`.
- Existing apex website, www, email, SPF and DMARC records were preserved.
- Cloudflare onboarding is at domain plan selection. Nameservers were not changed,
  and the frontend has not been routed to Cloudflare.
- Wrangler login succeeded on the operator's workstation with explicitly approved
  account/user/zone read, Workers/routes write and persistent OAuth access. This
  authentication was not copied to the server.

## Verification and remaining work

- Go Docker build passed its race tests and vet after normalizing embedded prompt
  files to LF. Database integration behavior was not verified in production.
- Frontend typecheck passed; all 70 Node tests passed after correcting the old
  redesign page count to exclude later pages on Windows and Linux.
- OpenNext production build and Wrangler dry-run passed: 151 assets, approximately
  1.64 MiB compressed Worker upload. No deployment was executed.
- General Biome check remains failing with 64 pre-existing diagnostics after
  removing archive CRLF conversion. It is not a passing verification.
- Production Compose validation passed. Runtime nginx/Caddy configuration, HTTPS,
  scanner readiness, OAuth, uploads, signed media and social posting remain unverified.

Use [production-backend.md](production-backend.md) for the deployment commands and
[cloudflare-deployment.md](cloudflare-deployment.md) for the frontend. The archive
must preserve LF; see `.gitattributes` and the Windows archive instructions.
Recreate ClamAV with the corrected configuration before attempting application startup.

Complete provider credentials, verification/reviews and production callback checks
from [social-publishing-setup.md](social-publishing-setup.md). A real social post
requires a separately authorized account and clip.
