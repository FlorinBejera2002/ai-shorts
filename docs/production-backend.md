# Production deployment

The standalone `docker-compose.production.yml` runs the Vite frontend, Go API,
job processing, database, scanner, and signed media gateway on `159.195.254.38`.
Do not combine it with the development Compose files. Its project name is
`sneepcut-production`, with separate persistent volumes.

## Server prerequisites

- Docker Engine and the Compose plugin on Debian 13; enough disk and RAM for the
  CPU worker (6 GiB limit), ClamAV (4 GiB limit), and remaining services.
- `sneepcut.com` and `api.sneepcut.com` A records point directly to
  `159.195.254.38`; `www.sneepcut.com` is a CNAME to `sneepcut.com`. Publish an
  AAAA record only after verifying IPv6 HTTP and HTTPS reachability.
- Permit inbound TCP 80/443 and SSH; UDP 443 is optional HTTP/3. No database,
  Redis, scanner, nginx, or Go ports are published.
- Verify `172.30.94.0/24` does not overlap a host or existing Docker network. If
  changing it, update both fixed addresses, nginx's `set_real_ip_from`, and Go's
  `TRUSTED_PROXY_CIDRS` together.

## Deploy the verified GitHub commit

Commit and push the reviewed changes before deploying. On the server, run the
GitHub helper with the full commit SHA returned by `git rev-parse HEAD`:

```sh
export DEPLOY_EXPECTED_COMMIT=FULL_40_CHARACTER_COMMIT_SHA
bash /opt/sneepcut/scripts/deploy-github.sh build all
# Back up PostgreSQL, media, Studio data and the production environment outside
# /opt/sneepcut, /opt/sneepcut.incoming and /opt/sneepcut.previous.
bash /opt/sneepcut/scripts/deploy-github.sh deploy all
bash /opt/sneepcut/scripts/deploy-github.sh verify all
```

The helper fetches `main` from GitHub (or `DEPLOY_BRANCH` when explicitly set),
rejects a commit mismatch before touching the release directories, and archives
only committed source. Run the helper from the reviewed commit when bootstrapping
a server that predates this guard. Git attributes preserve LF for shell scripts
and configuration. Production secrets are copied separately from the active
release and never committed. A build stages the incoming release without changing
the running containers; deployment applies migrations and recreates services.

Verify the backup with an isolated restore before activation. Stop application
writers briefly for a consistent final database and media snapshot when needed.
Before building, pin the running application images with release-specific recovery
tags. Recording image IDs alone does not retain overwritten image manifests.
Keep those tagged images and the previous checkout for recovery. Source rotation
does not roll back database migrations: an older Go migrator can reject an unknown newer
revision, so assess schema compatibility before invoking `rollback`. Do not
restore an older database over newer user writes as an automatic rollback step.

## Secrets and configuration

From the repository root on the server:

```sh
umask 077
cp deploy/production.env.example .env.production.local
```

Populate the file securely. Generate independent values using `openssl rand -hex
32` for each of `DB_PASSWORD`, `JWT_SECRET`, `INTERNAL_API_KEY`, and
`UPLOAD_TOKEN_SECRET`. Generate `SOCIAL_TOKEN_ENCRYPTION_KEY` using `openssl rand
-base64 32` and retain it across deployments so stored provider tokens remain
decryptable. Never copy the development `.env.example` as production credentials.
The Compose configuration rejects missing required core secrets. Configure provider
credentials and enable social publishing only after completing provider setup in
`docs/social-publishing-setup.md`.

All application processes receive production mode, the same local media volume,
database credentials, signing secret, and Redis broker. ClamAV is mandatory and
the API waits for its initial signature download/readiness. Media volume ownership
is initialized by the application image as UID/GID 10001; do not prepopulate it
with root-owned upload directories.

## Stripe billing

Use independent live resources and credentials for real payments. Set
`STRIPE_MODE=live`, the verified `STRIPE_EXPECTED_ACCOUNT_ID`,
`STRIPE_SECRET_KEY`, all three approved `STRIPE_PRICE_*` plan IDs,
`STRIPE_PORTAL_CONFIGURATION` and the production endpoint's
`STRIPE_WEBHOOK_SECRET` in the private server environment. The expected account
identifier is shown in Admin as configuration context; provisioning must verify
the key's actual account before activation. Presence flags in Admin are not a
provider connectivity or account-activation check.

Register the HTTPS snapshot callback at
`https://api.sneepcut.com/api/webhooks/stripe`, with the version and event list in
[the billing runbook](stripe-billing.md). A local CLI listener secret cannot
authenticate deliveries from this registered endpoint. The owner explicitly
authorized an initial public-server test phase on 21 October 2026. During this
phase use `STRIPE_MODE=test`, the reviewed sandbox resources and a visible
test-payment notice in the product and Admin. Use Stripe test cards only; this
phase does not accept real payments. Otherwise leave billing credentials empty
until the intended environment is ready. A later switch to real payments needs
independent live resources, keys and the live endpoint's signing secret.

Admin's **Facturare** view reads authenticated `/api/admin/billing/*` endpoints.
It shows effective plans, synchronized subscription state, scheduled cancellation,
credit balances and committed event history. Failed attempts do not enter that
ledger; inspect application logs and Stripe Workbench for failed delivery. The
view cannot charge, refund, cancel or alter a customer's subscription.

## YouTube download authentication

The worker mounts `/opt/sneepcut-secrets` read-only at `/run/secrets`. When
YouTube requires authentication, provision a Netscape-format cookie export at
`/opt/sneepcut-secrets/youtube-cookies.txt`, readable by worker UID 10001. Keep
this file outside Git, source releases, logs and media storage. Follow the
[yt-dlp cookie export instructions](https://github.com/yt-dlp/yt-dlp/wiki/Extractors#exporting-youtube-cookies)
and replace the export when its session expires.

`YOUTUBE_COOKIES_DIR` changes the host directory; `YOUTUBE_COOKIES_PATH` is the
path inside the container. The default path does not provision the cookie file.
Without that optional file the downloader tries public access, which YouTube
may reject from the server. The proof-of-origin provider does not supply an
authenticated YouTube session.

The downloader copies cookies into a private temporary directory for each
YouTube request because yt-dlp saves its cookie jar when closing. The original
secret remains read-only; the temporary copy is removed after success or error.
Direct video URLs do not use the YouTube cookie configuration. Never resolve a
cookie-save error by making the secrets mount writable.

Container health, Celery ping and downloader version checks do not prove that a
YouTube download succeeds. After changing authentication, test a real public
YouTube link from the worker using the temporary-workspace verifier below. It
does not create database records or write to customer media:

```sh
docker compose --env-file .env.production.local -f docker-compose.production.yml \
  cp backend/scripts/verify_video_processing.py worker:/tmp/verify_video_processing.py
docker compose --env-file .env.production.local -f docker-compose.production.yml \
  exec -T worker python /tmp/verify_video_processing.py \
  --url 'https://www.youtube.com/watch?v=YOUR_TEST_VIDEO_ID'
```

Add `--process` to verify transcription, highlight selection, portrait rendering
and subtitles for a short spoken video. For a repeatable synthetic input, copy
an existing synthetic speech WAV to the worker's temporary directory and use
`--fixture /tmp/speech.wav`. Processing uses the configured model provider and
may incur its normal usage charges. The fixture and generated files stay outside
persistent customer media. This checks the worker pipeline; browser/API job
creation and persistence are separate integration checks.

## Automated releases

Run production commands from the repository root on an authorized workstation.
`DEPLOY_HOST` defaults to the `sc` SSH alias and `DEPLOY_ROOT` defaults to
`/opt/sneepcut`.

```sh
make prod-build             # build a complete staged release
make prod-build-backend     # API plus workers, without frontend
make prod-build-frontend
make prod-build-api
make prod-build-workers
make prod-build-gateway

make deploy                 # full stack
make deploy-backend         # backend first; does not start frontend
make deploy-frontend
make deploy-api
make deploy-workers
make deploy-gateway
make rollback               # swap to the one previous app release
make production-status      # show all production containers
make production-verify      # verify the complete production stack
```

Every build uploads only production runtime/build inputs from the tracked and
non-ignored working tree, including reviewed uncommitted changes. Ignored
environment files are never included. A new release is built at
`/opt/sneepcut.incoming` before activation. Activation moves the old checkout to
`/opt/sneepcut.previous`, deleting any older application checkout. Remote release
operations are serialized with a lock. If the same source release is deployed
component-by-component, it is not rotated again. Rollback first rebuilds the
retained release with the current production environment, then swaps the current
and previous checkouts and redeploys the complete stack. A failed new activation
requires an explicit operator recovery; the release script does not automatically
roll it back. The rollback command itself attempts to restore the release that
had been active if that rollback fails. Retain the running image IDs before
building, since normal image tags are reused by subsequent builds.

This one-version policy applies only to application checkouts. PostgreSQL, Redis,
media, ClamAV signatures, and Caddy certificate state remain in named volumes and
are never deleted by build, deployment, or rollback. Rollback does not reverse
database migrations.

## Direct server start and verification

```sh
docker compose --env-file .env.production.local -f docker-compose.production.yml config --quiet
docker compose --env-file .env.production.local -f docker-compose.production.yml build
docker run --rm --network none -v "$PWD/deploy/Caddyfile:/etc/caddy/Caddyfile:ro" caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker compose --env-file .env.production.local -f docker-compose.production.yml up -d
docker compose --env-file .env.production.local -f docker-compose.production.yml ps -a
docker compose --env-file .env.production.local -f docker-compose.production.yml exec nginx nginx -t
docker compose --env-file .env.production.local -f docker-compose.production.yml exec clamav clamdscan --ping=1
docker compose --env-file .env.production.local -f docker-compose.production.yml exec worker celery -A app.workers.celery_app:celery_app inspect ping --timeout=10
curl --fail https://api.sneepcut.com/api/health
curl -I https://api.sneepcut.com/media/not-authorized.mp4
curl --fail --location https://sneepcut.com/ >/dev/null
curl --fail --location https://www.sneepcut.com/ >/dev/null
```

The migration container should exit 0. The final unsigned media request must be
denied (401/403), never serve a file. Verify an actual signed media URL separately,
including a Range request, using synthetic media in the isolated integration
environment described in `docs/frontend-backend-verification.md`. A configuration
check alone does not verify migrations, TLS issuance, Celery delivery, upload
scanning, or provider publishing.

Caddy obtains and renews the certificate automatically after DNS and firewall
changes propagate. Its certificate state persists in `caddy_data`. Caddy discards
untrusted incoming forwarding headers; nginx trusts only Caddy's fixed address
and Go trusts only nginx's fixed address. The frontend Worker's network address
is therefore the client address for proxied requests. Do not trust arbitrary
publicly supplied `X-Forwarded-For` headers to recover browser addresses.

The frontend image is built with:

```text
GO_API_URL=http://backend-go:8080
MEDIA_PROXY_HOST=http://nginx:80
NEXT_PUBLIC_APP_URL=https://sneepcut.com
NEXT_PUBLIC_UPLOAD_URL=https://api.sneepcut.com/api/upload/direct
NEXT_IMAGE_REMOTE_HOSTS=api.sneepcut.com
```

The frontend proxies `/api/`, `/v1/`, and `/media/` over the private Compose
network. Keep Google and social OAuth callbacks on the canonical frontend origin
to retain same-origin auth cookies. Existing local-storage media signing produces
canonical frontend URLs; the frontend media proxy preserves the signed path and
query. Verify the TikTok URL prefix against the URLs actually returned before
provider review.

For subsequent deployments, back up PostgreSQL and the media volume first, then
rebuild and run `up -d`. Retain all named volumes and secrets; `down -v` deletes
production data. Persistent volumes are not backups: arrange off-server database
and media backups, and verify a restore before relying on them.

References: [Compose services](https://docs.docker.com/reference/compose-file/services/),
[Caddy forwarding headers](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy#headers),
[Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https).
