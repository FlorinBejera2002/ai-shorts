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
