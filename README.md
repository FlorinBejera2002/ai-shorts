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

Use the development overlay to publish PostgreSQL, Redis, and Go and to mount frontend/worker source code. The command removes containers from the previous Compose mode while preserving database and media volumes:

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

Frontend changes hot reload. Run `make restart-go` after Go source changes and restart the worker after Python worker changes. After changing package manifests or a Dockerfile, rebuild the development images with `make build-dev`.

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
- `GEMINI_API_KEY` is required for Gemini-backed script/assistant functionality.
- Google OAuth, Stripe, Resend/SMTP email, and S3/R2 storage each require their matching variables on the Go API or worker, as documented in [the handoff](docs/go-migration/handoff.md).
- Local media uses the `media_data` Docker volume; PostgreSQL data uses `postgres_data`.
- Do not use the placeholder secrets or database password outside local development.
