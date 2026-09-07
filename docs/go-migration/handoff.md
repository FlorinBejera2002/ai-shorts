# Go migration handoff

Updated 2026-09-06. Application APIs and authentication now live in Go; Next.js
contains the UI and transport rewrites. Python video/ML workers, the durable
dispatcher and Alembic remain. This file lists the remaining operator tests,
configuration and decisions; local verification evidence is in
[backend-go-migration.md](backend-go-migration.md).

The persistent development stack and production have not been switched by this
work. Verification runs use disposable infrastructure and synthetic accounts.
No production provider calls, payments, email deliveries or deployments were
performed.

## What to provide/configure

Existing `.env` files are not overwritten by `make setup`. Merge the Go settings
from [`.env.example`](../../.env.example), preserving the existing PostgreSQL
credentials, media/signing configuration and provider account identifiers.

| Configuration | Required values / action |
| --- | --- |
| Go runtime | `GO_AUTH_ENABLED=true`, `APP_ENV`, `DATABASE_URL` and `REDIS_URL`. Compose supplies service addresses; external hosting must supply its own private addresses. |
| Authentication | New random `JWT_SECRET` of at least 32 bytes; `JWT_ISSUER=sneepcut`, `JWT_AUDIENCE=sneepcut-web`. Use a value generated for this application, not the example placeholder. |
| Signing/upload | `INTERNAL_API_KEY` for shared media signatures and a separate `UPLOAD_TOKEN_SECRET`, each at least 32 bytes outside development. Keep the current shared signing secret when preserving old URLs. Go and retained workers must agree. |
| Browser/API origins | `APP_URL` is the canonical browser origin. Set `NEXT_PUBLIC_APP_URL` to the same origin. Set `CORS_ORIGINS`, `GO_ALLOWED_HOSTS`/`ALLOWED_HOSTS` and narrowly scoped `TRUSTED_PROXY_CIDRS` for the actual proxy topology. Use HTTPS outside development/test. |
| Google sign-in | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URL`. Register the exact callback `<public Go/auth origin>/v1/auth/google/callback` in Google's console. The old Auth.js callback is superseded. |
| Email | A verified `AUTH_EMAIL_FROM` and either `RESEND_API_KEY` or `SMTP_HOST`, `SMTP_PORT`, optional credentials and TLS settings. Production requires SMTP TLS. Configure delivery before enabling mandatory activation or testing password recovery. |
| Registration activation | `AUTH_REQUIRE_EMAIL_VERIFICATION` defaults to false. If enabled, it applies to newly registered users; the additive migration leaves existing users able to sign in. |
| Stripe | Test-mode `STRIPE_SECRET_KEY`, the endpoint's `STRIPE_WEBHOOK_SECRET`, recurring prices for creator/pro/agency and one-time credit-pack prices for 100/500/1000 credits. Configure `/api/webhooks/stripe` on the Go public origin. Use matching currencies/products and existing customer/subscription identifiers. |
| Gemini/Whisper | `GEMINI_API_KEY` and `GEMINI_MODEL_NAME` for Go scripts/assistant and retained worker highlights. Choose/provision the worker's Whisper model/device/compute type and model cache. |
| Media/storage | `STORAGE_TYPE=local` with the shared media volume, or S3/R2 bucket/endpoint/region/access credentials. Configure the same storage namespace for Go and the worker. S3/R2 must remain private where signed access is expected. |
| Upload scanning | Start ClamAV with `make security-up` or provide its host/port. Production forces scanning on. Allow time/resources for virus database readiness and test failure behavior. |
| Frontend public settings | Optional contact email, public direct upload URL and image remote hosts. Docker builds explicitly receive these public values; rebuild after changes. Next.js no longer receives DB, Redis, mail, Stripe, Google, Gemini or storage secrets. |

Generate new secrets locally, for example with `openssl rand -base64 48`. Do not
paste real secrets into the repository or a ticket. Placeholder Stripe values
are not working credentials; leave optional services unconfigured until their
real test configuration is available.

For Cloudflare-hosted Next.js, follow the updated
[Cloudflare deployment guide](../cloudflare-deployment.md). Auth stays on the
browser's site through the Go rewrite. `NEXT_PUBLIC_UPLOAD_URL` may point at the
public Go direct-upload endpoint to bypass frontend request limits. Credentialed
refresh cookies require a compatible site/origin arrangement; CORS by itself
cannot make cross-site Strict cookies work.

## What to test yourself

Use a staging environment and synthetic account/media first. These checks need
real provider configuration or a human judgment that deterministic fixtures
cannot provide:

1. **Account flows:** sign in with an existing password account, reload, open a
   second tab, sign out and verify protected pages close. Register a new account,
   receive/consume activation and reset emails, change password and verify older
   sessions are rejected. Try Google sign-in and existing Google account linking.
2. **A real video:** upload a representative video and process it with actual
   Whisper/Gemini/smart crop. Inspect transcription accuracy, caption timing,
   framing, aspect ratio, audio, thumbnails and download/playback. Test a YouTube
   or URL input using any required cookies/provider access.
3. **Editing:** trim and reorder source segments, save metadata, recut, then
   reload and play the result. Check failure/retry keeps the previous usable
   version. Cancel queued/running work and inspect credit/refund behavior.
4. **Brand/calendar/dashboard:** upload and replace a logo, save an existing
   brand kit, create/change/delete a scheduled calendar item, and inspect progress,
   history, review and analytics on desktop/mobile in English and Romanian.
5. **Stripe in test mode:** subscription checkout, return/reload, portal,
   cancellation, renewal/payment failure, each credit pack, duplicate and
   out-of-order webhooks. Confirm credits and subscription state in the app.
6. **Data lifecycle:** export an account and review the contents. Delete a
   disposable password account and Google account; verify billing cancellation,
   owned-media cleanup, retry after an induced storage/provider failure and loss
   of access after completion. Never use a real account for destructive QA.
7. **Infrastructure:** large direct upload through the real proxy, rejected
   scanner/malware fixtures, S3/R2 signed playback/range requests and cleanup,
   actual TLS email delivery, worker/model cold start and provider timeouts.
8. **Staging operations:** observe readiness, API/worker logs and resource usage
   under representative concurrent jobs/uploads; rehearse a rollback and make
   sure work already in progress completes or recovers as intended.

The local suites already cover contract/ownership/concurrency/failure behavior
with mocks, actual PostgreSQL and FFmpeg. They do not establish live-provider
availability, ML output quality, production throughput or deployment readiness.
React Doctor's scan reported no new frontend source diagnostics, but two existing
errors remain and its score/maintainability engine was unavailable; that check is
not recorded as a full pass.

## What to decide

- **Python:** keep the current worker/dispatcher service, move orchestration and
  deterministic FFmpeg work to Go while retaining a narrow ML service, or pursue
  a full replacement. The first option has the least migration work now. The
  actual modules, model/runtime dependencies and tradeoffs are in
  [remaining-python.md](remaining-python.md). No Python removal is assumed.
- **Schema tooling:** keep Alembic with the remaining Python service, or choose
  a Go migration tool and an explicit baseline/handoff. Current code has one
  schema writer—Alembic. Do not enable another migration engine on the same
  database before that transition is tested.
- **Activation:** whether new password accounts must verify email before login.
  The default preserves the previous immediate-login behavior; requiring
  activation needs working delivery.
- **Hosting/storage:** the target Go/worker/database/Redis/ClamAV environment,
  private connectivity, canonical public origins and local versus S3/R2 media.
- **Follow-ups:** whether to remove the optional retired Python HTTP source/image
  once rollback is no longer needed, add periodic expired-auth-record retention,
  or implement real social publishing (calendar records currently do not publish).

## What to do to switch an installation

1. Review the diff and commit/release it. Back up PostgreSQL and media and record
   the previous matching frontend/API/worker/proxy version for rollback.
2. Merge configuration and confirm provider test credentials. For the canonical
   local app use `APP_URL=http://localhost:3000`; include any direct dev frontend
   origin in `CORS_ORIGINS`. Production requires HTTPS and non-placeholder secrets.
3. Drain or pause job/edit creation before replacing the dispatcher/workers.
   Upgrade the API and workers together for the durable edit protocol. Do not
   run an old and new dispatcher against the same queue during rollout.
4. Apply the two additive migrations through the existing `migrate` service
   (`make migrate` after configuration). The target Alembic head is
   `20260906_0002`; there is no schema replacement or destructive baseline.
5. Build/start the target stack (`make up`, or `make security-up` with local
   ClamAV). This is the actual operator cutover; the local test fixtures did not
   perform it. Review service health/logs with `make status`, `make health` and
   `make logs SERVICE=backend-go`/`worker`/`job-dispatcher`.
6. Sign in again. Old Auth.js sessions are intentionally not accepted by Go;
   existing accounts/passwords remain. Run the staging/manual scenarios above,
   then enable traffic/jobs gradually and inspect errors, credits and outputs.

The `legacy-python-api` Compose profile only starts the retired Python HTTP
process. A complete rollback requires the previous matching frontend/Auth.js,
Nginx and worker/dispatcher version, preserving data and shared secrets. Rehearse
that combination on a disposable restored backup; do not drop the additive
schema columns/tables or delete worker media as an improvised rollback.
