# Sneepcut

Sneepcut is a local video-to-shorts stack with a Next.js frontend, FastAPI backend, PostgreSQL, Redis, a Celery/ML worker, and Nginx.

## Prerequisites

- Docker Desktop with Docker Compose
- At least 6 GB of memory available to Docker for the ML worker
- Node.js 22 or newer for running frontend checks outside Docker
- Go 1.24+ for the optional Go foundation and its tests

## Quick start

From the repository root:

```bash
make setup
```

This creates an ignored `.env` from `.env.example` when needed, builds the images, applies database migrations, starts the stack in the background, and verifies backend health. The first build is slower because the worker downloads CPU-only PyTorch and video-processing dependencies.

Run `make help` to see every available project command. `bash scripts/setup.sh` remains available as the original setup entry point.

Open:

- App: <http://localhost:3000> (also available at <http://localhost>)
- Backend health: <http://localhost/api/health>

The default stack uses production-style frontend and backend images. Before using OAuth, Stripe, Gemini, email delivery, or social publishing, replace the corresponding placeholders in `.env`. The empty third-party keys are safe for basic local navigation and account flows that do not call those services.

## Hot-reload development

Use the development overlay to publish PostgreSQL, Redis, and FastAPI and to mount frontend/backend source code. The command cleanly removes containers from the previous Compose mode while preserving database and media volumes:

```bash
make dev
```

Development URLs:

- Nginx/app: <http://localhost:3000>
- Direct Next.js dev server: <http://localhost:3001>
- FastAPI: <http://localhost:8000>
- FastAPI docs: <http://localhost:8000/api/docs>
- PostgreSQL: `localhost:5433` (container port remains `5432`)
- Redis: `localhost:6379`

If a host port is already in use, override it in `.env` before starting. For example:

```dotenv
POSTGRES_HOST_PORT=5433
REDIS_HOST_PORT=6380
BACKEND_HOST_PORT=8001
FRONTEND_HOST_PORT=3002
```

Container-to-container ports do not change when these host overrides are used.

Source changes hot reload without rebuilding images. After changing package manifests, Prisma dependencies, or a Dockerfile, rebuild the development images with `make build-dev`.

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
make logs SERVICE=backend
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

Install and generate the local frontend client before running checks:

```bash
make install
make check
```

Run the Go foundation tests:

```bash
make test-go
```

`backend-go/` is a clean server foundation based on the supplied Go example.
It currently exposes only health endpoints. The earlier Go job API experiment
has been removed; keep `BACKEND_URL` on Python while features are implemented.
See the [Go migration plan](docs/go-migration/backend-go-migration.md) and
[Go foundation commands and structure](backend-go/README.md).

The Docker build itself runs Prisma generation and a full Next.js production build.

## Environment notes

- `.env` is ignored by Git. Start from `.env.example` if it is missing.
- `GEMINI_API_KEY` is required for Gemini-backed script/assistant functionality.
- Google OAuth, Stripe, Resend email, social publishing, and S3/R2 storage each require their matching variables.
- Local media uses the `media_data` Docker volume; PostgreSQL data uses `postgres_data`.
- Do not use the placeholder secrets or database password outside local development.
