# Deploy from GitHub on the server

Commit and push changes to `main` before deploying. The server downloads the
committed branch; uncommitted local edits are not included.

One-time installation on the server (also use this to replace the old helper):

```bash
curl --fail --location \
  https://raw.githubusercontent.com/FlorinBejera2002/ai-shorts/main/scripts/deploy-github.sh \
  -o /tmp/sneepcut-deploy-github.sh
bash -n /tmp/sneepcut-deploy-github.sh
install -m 755 /tmp/sneepcut-deploy-github.sh /usr/local/bin/sneepcut-deploy
```

Run:

```bash
sneepcut-deploy deploy all
```

The helper clones GitHub, prints the exact commit, and invokes the repository's
release workflow. That workflow preserves `/opt/sneepcut/.env.production.local`,
builds images, runs migrations, starts services, and verifies health. Deployment
is complete only when it reports `Release ... is active`. A build alone does
not update running containers. If migration or verification fails, resolve the
reported error and rerun the command.

The helper lives outside the checkout so release rotation does not remove it.
Do not use the obsolete `/opt/sneepcut/deploy.sh`.

Supported components: `all`, `backend`, `frontend`, `admin`, `studio`, `api`, `workers`,
`gateway`. Use `all` when updating service names or shared configuration.

```bash
sneepcut-deploy status all
sneepcut-deploy verify all
```

`DEPLOY_BRANCH` defaults to `main`, `DEPLOY_REPOSITORY` to the GitHub repository,
and `DEPLOY_ROOT` to `/opt/sneepcut`. Private repositories require Git credentials
on the server and an authenticated method for downloading the helper.

## Admin hostname

GoDaddy DNS: an A record named admin points to 159.195.254.38, with a
600-second TTL. Caddy serves https://admin.sneepcut.com and obtains its
HTTPS certificate automatically. The admin container has no public port.

The admin build uses VITE_API_URL=https://sneepcut.com, keeping login,
refresh cookies, and the existing Google callback on the main hostname.
Production CORS must include https://admin.sneepcut.com; if CORS_ORIGINS
is overridden in .env.production.local, update that value too.
The Google callback remains https://sneepcut.com/v1/auth/google/callback.
An admin deployment does not grant administrative access to any account.

## Caption release (migration 046)

Pin the reviewed full commit SHA during both staging and activation:

```bash
DEPLOY_EXPECTED_COMMIT=<40-character-sha> bash /path/to/reviewed/deploy-github.sh build all
DEPLOY_EXPECTED_COMMIT=<40-character-sha> bash /path/to/reviewed/deploy-github.sh deploy all
```

The older installed helper may lack this check. Use the reviewed repository helper
when pinning; do not assume setting an ignored environment variable pins a release.
Before activation, preserve the current images and an owner-only database/media/
Studio/environment backup outside `/opt/sneepcut` and `/opt/sneepcut.previous`.
Restore-check the database backup in a network-isolated disposable
`sneepcut_integration_test` database. Never restore an old backup over new user writes
as a routine rollback.

Migration 046 is additive, but the previous migrator rejects the new revision.
The ordinary old-release `rollback` command therefore cannot be assumed to work.
Prefer a reviewed forward fix; if reverting application code is necessary, retain
the current compatible migration chain and existing data, then rebuild and verify.
Activation does not automatically roll back when its final verification fails.

The new optional cleanup adapter remains unavailable until explicitly verified and
provisioned; see [audio setup and evidence](audio-cleanup.md). After deployment,
check public readiness and protected media, the caption catalog/resource routes,
and real FFmpeg caption exports in an isolated container using the deployed worker
image. Runtime health alone does not verify font rendering or audio quality.