# Production deployment

The standalone `docker-compose.production.yml` runs the Next.js frontend, Go API,
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

## Transfer source from Windows

Create the committed application source archive with newline conversion disabled.
Use `--worktree-attributes` so the current `.gitattributes` is applied even before
that file has been committed:

```powershell
New-Item -ItemType Directory -Force .cache | Out-Null
git -c core.autocrlf=false archive --worktree-attributes --format=tar --output=.cache/production-source.tar HEAD backend backend-go frontend
```

Transfer the archive to the server and extract it into the intended application
directory using `tar -xf production-source.tar`. This archive contains the selected
paths from `HEAD`; it does **not** include uncommitted edits or untracked files.
Explicitly copy reviewed working-tree overlays after extraction, including
`docker-compose.production.yml`, `deploy/Caddyfile`,
`deploy/nginx.production.conf`, and any application changes not yet committed.
Preserve LF newlines when copying shell scripts, embedded prompt text, and runtime
configuration. Keep `.env.production.local` separate from the source archive.

The repository attributes enforce LF for these sensitive files. Without this
policy, Windows newline conversion can produce an archive that breaks embedded
prompt contracts or makes ClamAV reject valid configuration values.

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
and previous checkouts and redeploys the complete stack. If activation fails, it
attempts to restore and redeploy the release that had been active.

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
