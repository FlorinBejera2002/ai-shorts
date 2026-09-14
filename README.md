# Sneepcut

Sneepcut is a video-to-shorts stack with a Next.js frontend, Go application API, PostgreSQL, Redis, Python Celery/ML workers, and Nginx.

## Prerequisites

- Docker Desktop with Docker Compose
- At least 6 GB of memory available to Docker for the ML worker
- Node.js 22 or newer for running frontend checks outside Docker
- Go 1.24+ for running backend checks outside Docker

## Quick start

From the repository root:

```bash
make setup
```

This creates an ignored `.env` from `.env.example` when needed, builds the images, applies Alembic database migrations, starts the stack in the background, and verifies Go/PostgreSQL/Redis readiness. Existing installations must add the new Go variables in [the migration handoff](docs/go-migration/handoff.md) before restarting. The first build is slower because the worker downloads CPU-only PyTorch and video-processing dependencies.

Run `make help` to see every available project command. `bash scripts/setup.sh` remains available as the original setup entry point.

Open:

- App: <http://localhost:3000> (also available at <http://localhost>)
- Backend liveness: <http://localhost/api/health>
- Backend readiness: <http://localhost/api/ready>

The default stack uses production-style frontend and backend images. Before using OAuth, Stripe, Gemini, or email delivery, configure their variables in `.env`. Unconfigured providers return explicit unavailable responses. The calendar stores a publishing plan; it does not automatically publish to social networks.

## Hot-reload development

Use the development overlay with Docker Compose 2.32+ to publish PostgreSQL, Redis, and Go and enable source reload. Compose updates changed services without taking down the entire stack or deleting database/media volumes:

```bash
make dev
```

Development URLs:

- Nginx/app: <http://localhost:3000>
- Direct Next.js dev server: <http://localhost:3001>
- Go API: <http://localhost:8080/api/ready>
- PostgreSQL: `localhost:5433` (container port remains `5432`)
- Redis: `localhost:6379`

If a host port is already in use, override it in `.env` before starting. For example:

```dotenv
POSTGRES_HOST_PORT=5433
REDIS_HOST_PORT=6380
GO_BACKEND_HOST_PORT=8081
FRONTEND_HOST_PORT=3002
```

Container-to-container ports do not change when these host overrides are used.

Keep `make dev` running while editing. Frontend source, public assets and translations are mounted directly; Next.js hot reload picks up edits, including on Windows through polling. Compose Watch synchronizes Go source and restarts only the Go container (recompilation uses its existing cache). Python application edits synchronize and restart the worker and dispatcher. The worker has up to five minutes to finish active jobs before stopping; avoid editing worker code during long jobs you want to preserve.

In PowerShell without Make, use:

```powershell
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build --watch
```

For detached services, run `make dev-up`, then keep `make dev-watch` open in a terminal for Go/Python reload. Without Watch running, only frontend hot reload is active; rerun `make dev-up` to apply Go/Python edits. `make restart-go` only restarts the last built or synchronized Go code.

After changing dependencies, a Dockerfile or `.env`, rerun `make dev` (or `make dev-up`) to rebuild/recreate affected services. `make build-dev` only builds images; it does not update running containers. Database schema changes still require `make migrate`. Use `make up` for production-style images, which intentionally do not hot reload.

To verify reload after building the development images, run `node scripts/test-dev-reload.mjs` from the repository root. It tests Go/Python reload and Next.js source/translation updates using disposable containers and copied fixtures, with no database or media volumes.

Nginx preserves the frontend's cache headers so development CSS/JavaScript revalidate and production chunks retain Next.js's versioned cache policy. After pulling a change to `nginx/nginx.conf`, apply it with `docker compose exec nginx nginx -t` followed by `docker compose exec nginx nginx -s reload`. If a browser previously cached development assets under the old one-year policy, use Ctrl+Shift+R once. To verify CSS updates through Nginx, run `node scripts/test-studio-header-reload.mjs` from `frontend` with Playwright available (or set `PLAYWRIGHT_MODULE` to its `index.mjs`). This uses mocked APIs, checks desktop/mobile rendering and cache headers, and temporarily appends then removes a CSS probe to verify two consecutive hot updates without a page reload.

Press `Ctrl-C` to stop the foreground command. Then remove the stopped containers with:

```bash
make down
```

## Common commands

```bash
# Show service status
make status

# Follow logs for the whole stack
make logs

# Follow one service
make logs SERVICE=backend-go
make logs SERVICE=worker
make logs SERVICE=frontend

# Rebuild and restart after dependency or Dockerfile changes
make up

# Stop containers while preserving database and media volumes
make down
```

To enable local upload malware scanning, include the security profile:

```bash
make security-up
```

## Local validation

Install the local frontend dependencies before running checks:

```bash
make install
make check
```

Run the Go backend tests:

```bash
make test-go
```

`backend-go/` adapts the supplied Go example's structure and two-JWT auth design.
It owns application APIs and authentication; Next.js renders the UI and forwards
API requests to Go. Python handles video/ML execution, durable dispatch and the
existing Alembic schema history. `make check` does not run Python tests or provision
database/browser fixtures; see the dedicated commands and evidence below.
See the [Go migration plan](docs/go-migration/backend-go-migration.md) and
[Go backend commands, integration tests and structure](backend-go/README.md).

The Docker builds run Go race tests/vet and a full Next.js production build.
Next.js no longer needs Prisma, database credentials, Auth.js, or backend provider secrets.

## Environment notes

- `.env` is ignored by Git. Start from `.env.example` if it is missing.
- Cloud AI can use Gemini or OpenRouter for scripts, assistant responses and
  highlight selection. Set `AI_PROVIDER` to `gemini`, `openrouter`, or `auto`.
  OpenRouter accepts any text/chat model slug through `OPENROUTER_MODEL_NAME`.
- Google OAuth, Stripe, Resend/SMTP email, and S3/R2 storage each require their matching variables on the Go API or worker, as documented in [the handoff](docs/go-migration/handoff.md).
- Local media uses the `media_data` Docker volume; PostgreSQL data uses `postgres_data`.
- Do not use the placeholder secrets or database password outside local development.
