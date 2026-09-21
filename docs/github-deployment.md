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

Supported components: `all`, `backend`, `frontend`, `studio`, `api`, `workers`,
`gateway`. Use `all` when updating service names or shared configuration.

```bash
sneepcut-deploy status all
sneepcut-deploy verify all
```

`DEPLOY_BRANCH` defaults to `main`, `DEPLOY_REPOSITORY` to the GitHub repository,
and `DEPLOY_ROOT` to `/opt/sneepcut`. Private repositories require Git credentials
on the server and an authenticated method for downloading the helper.
