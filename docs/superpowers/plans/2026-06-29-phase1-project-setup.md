# Phase 1: Project Setup & Repository Structure — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bootstrap the ClipForge monorepo so `docker compose up` starts all 6 services (postgres, redis, backend, worker, frontend, nginx) with placeholder apps responding to health checks.

**Architecture:** Monorepo with Next.js 15 frontend, FastAPI backend, Celery worker, PostgreSQL, Redis, and Nginx reverse proxy. All services orchestrated via Docker Compose. Patterns cloned from wib_my-acount (Biome, Zustand, Tailwind v4, CVA, shadcn/ui conventions).

**Tech Stack:** Next.js 15, TypeScript, Tailwind CSS 4, Biome, Zustand, FastAPI, Python 3.11, Docker Compose, Nginx, PostgreSQL 16, Redis 7

---

## File Map

### Root level
| File | Purpose |
|------|---------|
| `clipforge/.gitignore` | Git ignore for monorepo (node_modules, __pycache__, .env, etc.) |
| `clipforge/.env.example` | All environment variables documented with comments |
| `clipforge/.env` | Actual env file (copied from .env.example, gitignored) |
| `clipforge/docker-compose.yml` | Production-like orchestration of all 6 services |
| `clipforge/docker-compose.dev.yml` | Dev overrides with hot reload |
| `clipforge/nginx/nginx.conf` | Reverse proxy routing frontend/backend/media |

### Frontend (`clipforge/frontend/`)
| File | Purpose |
|------|---------|
| `Dockerfile` | Multi-stage build: node:20-alpine → Next.js standalone |
| `package.json` | Phase 1 minimal deps (next, react, tailwind, zustand, biome) |
| `next.config.ts` | Next.js config with standalone output |
| `tsconfig.json` | Strict TS matching wib pattern + `@/*` path alias |
| `biome.json` | Identical rules to wib_my-acount |
| `postcss.config.mjs` | Tailwind v4 postcss plugin |
| `src/app/globals.css` | Design tokens (CSS vars) + Tailwind — adapted from wib |
| `src/app/layout.tsx` | Root layout with Inter font, dark mode default, metadata |
| `src/app/page.tsx` | Landing page placeholder |
| `src/lib/utils.ts` | cn() helper (shadcn pattern) |
| `src/stores/ui-store.ts` | Zustand UI store (sidebar, theme) matching wib |
| `src/types/index.ts` | Shared TypeScript types placeholder |
| `prisma/schema.prisma` | Minimal Prisma schema placeholder |
| All `src/app/*/page.tsx` | Placeholder pages for every route |
| All `src/app/api/*/route.ts` | Placeholder API routes |
| All `src/components/*/` | Empty feature component directories with .gitkeep |
| All `src/lib/*.ts` | Placeholder lib files (api, auth, db, stripe, storage) |
| `public/logo.svg` | Placeholder SVG logo |
| `public/logo-icon.svg` | Placeholder SVG icon |

### Backend (`clipforge/backend/`)
| File | Purpose |
|------|---------|
| `Dockerfile` | python:3.11-slim with uvicorn |
| `Dockerfile.worker` | Same base, celery entrypoint (placeholder sleep loop) |
| `requirements.txt` | Phase 1 minimal deps (fastapi, uvicorn, pydantic) |
| `app/__init__.py` | Package init |
| `app/main.py` | FastAPI app with CORS, mounts router |
| `app/config.py` | Pydantic Settings from env vars |
| `app/api/router.py` | Main API router including health |
| `app/api/health.py` | GET /api/health endpoint |
| All `app/models/*.py` | Empty placeholder model files |
| All `app/schemas/*.py` | Empty placeholder schema files |
| All `app/services/*.py` | Empty placeholder service files |
| All `app/api/*.py` | Empty placeholder API endpoint files |
| `app/workers/celery_app.py` | Placeholder (prints deferred message) |
| `app/workers/tasks.py` | Placeholder |
| `app/utils/*.py` | Placeholder utility files |
| `alembic.ini` | Alembic config placeholder |
| `alembic/env.py` | Alembic env placeholder |
| `alembic/script.py.mako` | Alembic template |

### Scripts (`clipforge/scripts/`)
| File | Purpose |
|------|---------|
| `setup.sh` | First-time setup (copy .env, docker compose up) |
| `seed_db.sh` | Placeholder for DB seeding |
| `deploy.sh` | Placeholder for production deploy |

---

## Tasks

### Task 1: Initialize Git Repository & Root Config Files

**Files:**
- Create: `clipforge/.gitignore`
- Create: `clipforge/.env.example`

- [ ] **Step 1: Initialize git repo**

```bash
cd C:/Users/flori/Documents/projects/clipforge
git init
```

- [ ] **Step 2: Create .gitignore**

```gitignore
# Dependencies
node_modules/
.pnp
.pnp.js

# Build
.next/
out/
dist/
build/

# Python
__pycache__/
*.py[cod]
*$py.class
*.egg-info/
.eggs/
*.egg
venv/
.venv/

# Environment
.env
.env.local
.env.*.local

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Docker
postgres_data/

# Media uploads
media/

# Prisma
frontend/prisma/migrations/

# Misc
*.log
coverage/
.cache/
```

- [ ] **Step 3: Create .env.example**

```bash
# === Database ===
DB_PASSWORD=changeme
DATABASE_URL=postgresql://clipforge:changeme@postgres:5432/clipforge
DIRECT_URL=postgresql://clipforge:changeme@postgres:5432/clipforge

# === Redis ===
REDIS_URL=redis://redis:6379/0

# === NextAuth ===
NEXTAUTH_SECRET=generate-with-openssl-rand-base64-32
NEXTAUTH_URL=http://localhost:3000

# === Google OAuth ===
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# === Stripe ===
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_CREATOR=price_...
STRIPE_PRICE_PRO=price_...
STRIPE_PRICE_AGENCY=price_...
STRIPE_PRICE_CREDITS_100=price_...
STRIPE_PRICE_CREDITS_500=price_...
STRIPE_PRICE_CREDITS_1000=price_...

# === AI APIs ===
GEMINI_API_KEY=

# === Social Posting ===
UPLOAD_POST_API_KEY=

# === Storage ===
STORAGE_TYPE=local
# For S3/R2:
# STORAGE_TYPE=s3
# AWS_ACCESS_KEY_ID=
# AWS_SECRET_ACCESS_KEY=
# AWS_REGION=auto
# AWS_S3_BUCKET=clipforge-media
# AWS_ENDPOINT_URL=https://xxx.r2.cloudflarestorage.com

# === App ===
APP_NAME=ClipForge
APP_URL=http://localhost
APP_ENV=development
MAX_UPLOAD_SIZE_MB=2048
MAX_VIDEO_DURATION_MINUTES=120
DEFAULT_FREE_CREDITS=100
```

- [ ] **Step 4: Copy .env.example to .env for local dev**

```bash
cp .env.example .env
```

- [ ] **Step 5: Commit**

```bash
git add .gitignore .env.example
git commit -m "chore: init repo with gitignore and env template"
```

---

### Task 2: Backend — FastAPI Scaffold with Health Check

**Files:**
- Create: `backend/requirements.txt`
- Create: `backend/app/__init__.py`
- Create: `backend/app/main.py`
- Create: `backend/app/config.py`
- Create: `backend/app/api/__init__.py`
- Create: `backend/app/api/router.py`
- Create: `backend/app/api/health.py`

- [ ] **Step 1: Create requirements.txt**

```
fastapi==0.115.*
uvicorn[standard]==0.34.*
python-dotenv==1.1.*
pydantic==2.11.*
pydantic-settings==2.9.*
```

- [ ] **Step 2: Create app/__init__.py**

Empty file.

- [ ] **Step 3: Create app/config.py**

```python
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "ClipForge"
    app_env: str = "development"
    database_url: str = "postgresql://clipforge:changeme@postgres:5432/clipforge"
    redis_url: str = "redis://redis:6379/0"
    nextauth_secret: str = ""
    gemini_api_key: str = ""
    storage_type: str = "local"
    max_upload_size_mb: int = 2048
    max_video_duration_minutes: int = 120
    default_free_credits: int = 100

    class Config:
        env_file = ".env"


settings = Settings()
```

- [ ] **Step 4: Create app/api/__init__.py**

Empty file.

- [ ] **Step 5: Create app/api/health.py**

```python
from fastapi import APIRouter

router = APIRouter()


@router.get("/api/health")
def health_check():
    return {"status": "ok", "service": "clipforge-backend", "version": "0.1.0"}
```

- [ ] **Step 6: Create app/api/router.py**

```python
from fastapi import APIRouter

from app.api.health import router as health_router

api_router = APIRouter()
api_router.include_router(health_router, tags=["health"])
```

- [ ] **Step 7: Create app/main.py**

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router

app = FastAPI(
    title="ClipForge API",
    version="0.1.0",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)
```

- [ ] **Step 8: Verify backend runs locally (optional, requires Python)**

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
# Visit http://localhost:8000/api/health
# Expected: {"status":"ok","service":"clipforge-backend","version":"0.1.0"}
```

- [ ] **Step 9: Commit**

```bash
git add backend/requirements.txt backend/app/
git commit -m "feat: add FastAPI backend scaffold with health endpoint"
```

---

### Task 3: Backend — Placeholder Files for Models, Schemas, Services, Workers, Utils

**Files:**
- Create: `backend/app/database.py`
- Create: `backend/app/models/__init__.py`
- Create: `backend/app/models/user.py`
- Create: `backend/app/models/job.py`
- Create: `backend/app/models/clip.py`
- Create: `backend/app/models/brand.py`
- Create: `backend/app/schemas/__init__.py`
- Create: `backend/app/schemas/job.py`
- Create: `backend/app/schemas/clip.py`
- Create: `backend/app/schemas/user.py`
- Create: `backend/app/api/jobs.py`
- Create: `backend/app/api/clips.py`
- Create: `backend/app/api/upload.py`
- Create: `backend/app/services/__init__.py`
- Create: `backend/app/services/video_downloader.py`
- Create: `backend/app/services/transcriber.py`
- Create: `backend/app/services/highlight_detector.py`
- Create: `backend/app/services/clip_generator.py`
- Create: `backend/app/services/subtitle_burner.py`
- Create: `backend/app/services/smart_crop.py`
- Create: `backend/app/services/social_poster.py`
- Create: `backend/app/services/storage.py`
- Create: `backend/app/workers/__init__.py`
- Create: `backend/app/workers/celery_app.py`
- Create: `backend/app/workers/tasks.py`
- Create: `backend/app/utils/__init__.py`
- Create: `backend/app/utils/ffmpeg_utils.py`
- Create: `backend/app/utils/file_utils.py`

- [ ] **Step 1: Create database.py placeholder**

```python
# Database engine and session — configured in Phase 3 (SQLAlchemy + Alembic)
```

- [ ] **Step 2: Create all model placeholders**

Each file (user.py, job.py, clip.py, brand.py) contains:
```python
# Model defined in Phase 3
```

`__init__.py` is empty.

- [ ] **Step 3: Create all schema placeholders**

Each file (job.py, clip.py, user.py) contains:
```python
# Pydantic schemas defined in Phase 3
```

`__init__.py` is empty.

- [ ] **Step 4: Create API endpoint placeholders**

Each file (jobs.py, clips.py, upload.py) contains:
```python
# API endpoints defined in Phase 3
```

- [ ] **Step 5: Create all service placeholders**

Each file contains a comment describing what it will do:
```python
# video_downloader.py — yt-dlp YouTube download (Phase 2)
# transcriber.py — faster-whisper transcription (Phase 2)
# highlight_detector.py — Gemini AI highlight scoring (Phase 2)
# clip_generator.py — FFmpeg clip extraction (Phase 2)
# subtitle_burner.py — Subtitle rendering + styles (Phase 2)
# smart_crop.py — YOLOv8 + MediaPipe face tracking (Phase 2)
# social_poster.py — Upload-Post API integration (Phase 2)
# storage.py — S3/R2 file management (Phase 2)
```

`__init__.py` is empty.

- [ ] **Step 6: Create worker placeholders**

`celery_app.py`:
```python
# Celery configuration — defined in Phase 4
# Worker container uses a sleep loop until this is configured
import sys
print("Celery not configured yet — waiting for Phase 4")
sys.stdout.flush()
```

`tasks.py`:
```python
# Background processing tasks — defined in Phase 4
```

`__init__.py` is empty.

- [ ] **Step 7: Create utils placeholders**

Each file:
```python
# ffmpeg_utils.py — FFmpeg helper functions (Phase 2)
# file_utils.py — File management helpers (Phase 2)
```

`__init__.py` is empty.

- [ ] **Step 8: Commit**

```bash
git add backend/
git commit -m "chore: add backend placeholder files for models, schemas, services, workers"
```

---

### Task 4: Backend — Alembic Scaffold

**Files:**
- Create: `backend/alembic.ini`
- Create: `backend/alembic/env.py`
- Create: `backend/alembic/script.py.mako`
- Create: `backend/alembic/versions/.gitkeep`

- [ ] **Step 1: Create alembic.ini**

```ini
[alembic]
script_location = alembic
sqlalchemy.url = postgresql://clipforge:changeme@postgres:5432/clipforge

[loggers]
keys = root,sqlalchemy,alembic

[handlers]
keys = console

[formatters]
keys = generic

[logger_root]
level = WARN
handlers = console

[logger_sqlalchemy]
level = WARN
handlers =
qualname = sqlalchemy.engine

[logger_alembic]
level = INFO
handlers =
qualname = alembic

[handler_console]
class = StreamHandler
args = (sys.stderr,)
level = NOTSET
formatter = generic

[formatter_generic]
format = %(levelname)-5.5s [%(name)s] %(message)s
datefmt = %H:%M:%S
```

- [ ] **Step 2: Create alembic/env.py**

```python
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = None


def run_migrations_offline():
    url = config.get_main_option("sqlalchemy.url")
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online():
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
```

- [ ] **Step 3: Create alembic/script.py.mako**

```mako
"""${message}

Revision ID: ${up_revision}
Revises: ${down_revision | comma,n}
Create Date: ${create_date}
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
${imports if imports else ""}

revision: str = ${repr(up_revision)}
down_revision: Union[str, None] = ${repr(down_revision)}
branch_labels: Union[str, Sequence[str], None] = ${repr(branch_labels)}
depends_on: Union[str, Sequence[str], None] = ${repr(depends_on)}


def upgrade() -> None:
    ${upgrades if upgrades else "pass"}


def downgrade() -> None:
    ${downgrades if downgrades else "pass"}
```

- [ ] **Step 4: Create versions/.gitkeep**

Empty file.

- [ ] **Step 5: Commit**

```bash
git add backend/alembic.ini backend/alembic/
git commit -m "chore: add Alembic migration scaffold"
```

---

### Task 5: Backend — Dockerfiles

**Files:**
- Create: `backend/Dockerfile`
- Create: `backend/Dockerfile.worker`

- [ ] **Step 1: Create backend/Dockerfile**

```dockerfile
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p /app/media

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 2: Create backend/Dockerfile.worker**

```dockerfile
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p /app/media

CMD ["python", "-c", "import time; print('Worker waiting for Celery config (Phase 4)'); time.sleep(999999)"]
```

- [ ] **Step 3: Commit**

```bash
git add backend/Dockerfile backend/Dockerfile.worker
git commit -m "chore: add backend and worker Dockerfiles"
```

---

### Task 6: Frontend — Initialize Next.js Project

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/next.config.ts`
- Create: `frontend/tsconfig.json`
- Create: `frontend/biome.json`
- Create: `frontend/postcss.config.mjs`
- Create: `frontend/.gitignore`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "clipforge-frontend",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "biome lint ./src",
    "lint:fix": "biome lint --fix ./src",
    "format": "biome format --write ./src",
    "check": "biome check ./src",
    "check:fix": "biome check --fix ./src"
  },
  "dependencies": {
    "next": "^15.3.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "tailwindcss": "^4.0.0",
    "@tailwindcss/postcss": "^4.0.0",
    "zustand": "^5.0.3",
    "lucide-react": "^0.468.0",
    "clsx": "^2.1.1",
    "tailwind-merge": "^2.6.0",
    "class-variance-authority": "^0.7.1"
  },
  "devDependencies": {
    "typescript": "~5.6.0",
    "@biomejs/biome": "^1.9.4",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@types/node": "^22.0.0"
  }
}
```

- [ ] **Step 2: Create next.config.ts**

```typescript
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**'
      }
    ]
  }
}

export default nextConfig
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "incremental": true,
    "skipLibCheck": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    },
    "plugins": [{ "name": "next" }]
  },
  "include": ["src", "next-env.d.ts", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Create biome.json (matching wib_my-acount)**

Copy the exact biome.json from `wib_my-acount` but update the ignore paths:
- Replace `**/dist/**` → `**/.next/**`
- Remove vite-specific ignores
- Keep `**/components/ui/**` ignore (for shadcn)

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "files": {
    "maxSize": 50000,
    "ignore": [
      "**/.next/**",
      "**/public/**",
      "**/node_modules/**"
    ]
  },
  "formatter": {
    "enabled": true,
    "formatWithErrors": false,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineEnding": "lf",
    "lineWidth": 80,
    "attributePosition": "auto"
  },
  "organizeImports": { "enabled": true },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": false,
      "a11y": {
        "noAccessKey": "error",
        "noAriaUnsupportedElements": "error",
        "noAutofocus": "error",
        "noBlankTarget": "error",
        "noDistractingElements": "error",
        "noHeaderScope": "error",
        "noInteractiveElementToNoninteractiveRole": "error",
        "noNoninteractiveElementToInteractiveRole": "error",
        "noNoninteractiveTabindex": "error",
        "noPositiveTabindex": "error",
        "noRedundantAlt": "error",
        "noRedundantRoles": "error",
        "useAltText": "error",
        "useAnchorContent": "error",
        "useAriaActivedescendantWithTabindex": "error",
        "useAriaPropsForRole": "error",
        "useHeadingContent": "error",
        "useHtmlLang": "error",
        "useIframeTitle": "error",
        "useKeyWithClickEvents": "off",
        "useKeyWithMouseEvents": "error",
        "useMediaCaption": "error",
        "useValidAnchor": "warn",
        "useValidAriaProps": "error",
        "useValidAriaRole": "error",
        "useValidAriaValues": "error"
      },
      "complexity": {
        "noBannedTypes": "error",
        "noExtraBooleanCast": "error",
        "noMultipleSpacesInRegularExpressionLiterals": "error",
        "noUselessCatch": "error",
        "noUselessThisAlias": "error",
        "noUselessTypeConstraint": "error",
        "noWith": "error",
        "useArrowFunction": "off"
      },
      "correctness": {
        "noChildrenProp": "error",
        "noConstAssign": "error",
        "noConstantCondition": "error",
        "noEmptyCharacterClassInRegex": "error",
        "noEmptyPattern": "error",
        "noGlobalObjectCalls": "error",
        "noInnerDeclarations": "error",
        "noInvalidConstructorSuper": "error",
        "noNewSymbol": "error",
        "noNonoctalDecimalEscape": "error",
        "noPrecisionLoss": "error",
        "noSelfAssign": "error",
        "noSetterReturn": "error",
        "noSwitchDeclarations": "error",
        "noUndeclaredVariables": "error",
        "noUnreachable": "error",
        "noUnreachableSuper": "error",
        "noUnsafeFinally": "error",
        "noUnsafeOptionalChaining": "error",
        "noUnusedLabels": "error",
        "noUnusedVariables": "error",
        "useArrayLiterals": "off",
        "useExhaustiveDependencies": "warn",
        "useHookAtTopLevel": "error",
        "useIsNan": "error",
        "useJsxKeyInIterable": "error",
        "useValidForDirection": "error",
        "useYield": "error"
      },
      "style": {
        "noDefaultExport": "off",
        "noImplicitBoolean": "error",
        "noNamespace": "error",
        "useAsConstAssertion": "error",
        "useBlockStatements": "off",
        "useConsistentArrayType": "error",
        "useConsistentBuiltinInstantiation": "error",
        "useShorthandArrayType": "error"
      },
      "security": { "noDangerouslySetInnerHtmlWithChildren": "error" },
      "suspicious": {
        "noAssignInExpressions": "error",
        "noAsyncPromiseExecutor": "error",
        "noCatchAssign": "error",
        "noClassAssign": "error",
        "noCommentText": "error",
        "noCompareNegZero": "error",
        "noConsoleLog": "error",
        "noControlCharactersInRegex": "error",
        "noDebugger": "error",
        "noDuplicateCase": "error",
        "noDuplicateClassMembers": "error",
        "noDuplicateJsxProps": "error",
        "noDuplicateObjectKeys": "error",
        "noDuplicateParameters": "error",
        "noEmptyBlockStatements": "error",
        "noExplicitAny": "warn",
        "noExtraNonNullAssertion": "error",
        "noFallthroughSwitchClause": "error",
        "noFunctionAssign": "error",
        "noGlobalAssign": "error",
        "noImportAssign": "error",
        "noMisleadingCharacterClass": "error",
        "noMisleadingInstantiator": "error",
        "noPrototypeBuiltins": "error",
        "noRedeclare": "error",
        "noShadowRestrictedNames": "error",
        "noUnsafeDeclarationMerging": "error",
        "noUnsafeNegation": "error",
        "useGetterReturn": "error",
        "useValidTypeof": "error"
      }
    },
    "ignore": [
      "**/node_modules/",
      "**/.next/",
      "**/public/",
      "**/components/ui/**"
    ]
  },
  "javascript": {
    "formatter": {
      "jsxQuoteStyle": "double",
      "quoteProperties": "asNeeded",
      "trailingCommas": "none",
      "semicolons": "asNeeded",
      "arrowParentheses": "always",
      "bracketSpacing": true,
      "bracketSameLine": false,
      "quoteStyle": "single",
      "attributePosition": "auto"
    }
  },
  "overrides": [
    { "include": ["*.ts", "*.tsx"] },
    {
      "include": ["*.ts", "*.tsx", "*.mts", "*.cts"],
      "linter": {
        "rules": {
          "correctness": {
            "noConstAssign": "off",
            "noGlobalObjectCalls": "off",
            "noInvalidConstructorSuper": "off",
            "noInvalidNewBuiltin": "off",
            "noNewSymbol": "off",
            "noSetterReturn": "off",
            "noUndeclaredVariables": "off",
            "noUnreachable": "off",
            "noUnreachableSuper": "off"
          },
          "style": {
            "noArguments": "error",
            "noVar": "error",
            "useConst": "error"
          },
          "suspicious": {
            "noDuplicateClassMembers": "off",
            "noDuplicateObjectKeys": "off",
            "noDuplicateParameters": "off",
            "noFunctionAssign": "off",
            "noImportAssign": "off",
            "noRedeclare": "off",
            "noUnsafeNegation": "off",
            "useGetterReturn": "off"
          }
        }
      }
    }
  ]
}
```

- [ ] **Step 5: Create postcss.config.mjs**

```javascript
/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    '@tailwindcss/postcss': {}
  }
}

export default config
```

- [ ] **Step 6: Create frontend/.gitignore**

```gitignore
node_modules/
.next/
out/
.env
.env.local
```

- [ ] **Step 7: Commit**

```bash
git add frontend/package.json frontend/next.config.ts frontend/tsconfig.json frontend/biome.json frontend/postcss.config.mjs frontend/.gitignore
git commit -m "feat: initialize Next.js 15 project with Biome and Tailwind v4"
```

---

### Task 7: Frontend — Design Tokens, Root Layout, and Core Lib Files

**Files:**
- Create: `frontend/src/app/globals.css`
- Create: `frontend/src/app/layout.tsx`
- Create: `frontend/src/lib/utils.ts`
- Create: `frontend/src/stores/ui-store.ts`
- Create: `frontend/src/types/index.ts`

- [ ] **Step 1: Create globals.css (adapted from wib_my-acount, dark mode default)**

```css
@import "tailwindcss";

:root {
  --radius: 0.5rem;

  --background: #ffffff;
  --foreground: #020817;

  --card: #ffffff;
  --card-foreground: #020817;

  --popover: #ffffff;
  --popover-foreground: #020817;

  --primary: #6366f1;
  --primary-foreground: #ffffff;

  --secondary: #f1f5f9;
  --secondary-foreground: #0f172a;

  --muted: #f1f5f9;
  --muted-foreground: #64748b;

  --accent: #8b5cf6;
  --accent-foreground: #ffffff;

  --destructive: #ef4444;
  --destructive-foreground: #f8fafc;

  --border: #e2e8f0;
  --input: #e2e8f0;
  --ring: #6366f1;

  --sidebar: #fafafa;
  --sidebar-foreground: #3f3f46;
  --sidebar-primary: #6366f1;
  --sidebar-primary-foreground: #ffffff;
  --sidebar-accent: #f4f4f5;
  --sidebar-accent-foreground: #18181b;
  --sidebar-border: #e4e4e7;
  --sidebar-ring: #6366f1;

  --chart-1: #6366f1;
  --chart-2: #8b5cf6;
  --chart-3: #06b6d4;
  --chart-4: #10b981;
  --chart-5: #f59e0b;
}

.dark {
  --background: #09090b;
  --foreground: #fafafa;

  --card: #09090b;
  --card-foreground: #fafafa;

  --popover: #09090b;
  --popover-foreground: #fafafa;

  --primary: #818cf8;
  --primary-foreground: #09090b;

  --secondary: #1e293b;
  --secondary-foreground: #f8fafc;

  --muted: #1e293b;
  --muted-foreground: #94a3b8;

  --accent: #a78bfa;
  --accent-foreground: #09090b;

  --destructive: #7f1d1d;
  --destructive-foreground: #f8fafc;

  --border: #27272a;
  --input: #27272a;
  --ring: #818cf8;

  --sidebar: #09090b;
  --sidebar-foreground: #f4f4f5;
  --sidebar-primary: #818cf8;
  --sidebar-primary-foreground: #ffffff;
  --sidebar-accent: #18181b;
  --sidebar-accent-foreground: #f4f4f5;
  --sidebar-border: #27272a;
  --sidebar-ring: #818cf8;

  --chart-1: #818cf8;
  --chart-2: #a78bfa;
  --chart-3: #22d3ee;
  --chart-4: #34d399;
  --chart-5: #fbbf24;
}

@custom-variant dark (&:is(.dark *));

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);

  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);

  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);

  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);

  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);

  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);

  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);

  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);

  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);

  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);

  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);

  --radius-lg: var(--radius);
  --radius-md: calc(var(--radius) - 2px);
  --radius-sm: calc(var(--radius) - 4px);
}

@layer base {
  * {
    @apply border-border;
  }

  html,
  body {
    @apply min-h-dvh bg-background text-foreground antialiased;
    font-family: "Inter", system-ui, -apple-system, sans-serif;
  }
}

input:-webkit-autofill,
input:-webkit-autofill:hover,
input:-webkit-autofill:focus {
  -webkit-box-shadow: 0 0 0 100px var(--background) inset;
  -webkit-text-fill-color: inherit;
  caret-color: inherit;
}

.dark input:-webkit-autofill,
.dark input:-webkit-autofill:hover,
.dark input:-webkit-autofill:focus {
  -webkit-box-shadow: 0 0 0 100px var(--background) inset;
}

.hide-scrollbar::-webkit-scrollbar {
  display: none;
}

.hide-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: var(--primary);
  border-radius: 0;
}

::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, var(--primary) 80%, black);
}

* {
  scrollbar-width: thin;
  scrollbar-color: var(--primary) transparent;
}
```

- [ ] **Step 2: Create layout.tsx**

```tsx
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'ClipForge — AI Video Clipping',
  description:
    'Turn long videos into viral clips with AI. Upload, analyze, and generate ready-to-post short-form content.'
}

export default function RootLayout({
  children
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  )
}
```

- [ ] **Step 3: Create lib/utils.ts**

```typescript
import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}
```

- [ ] **Step 4: Create stores/ui-store.ts (matching wib pattern)**

```typescript
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface UiState {
  sidebarOpen: boolean
  theme: 'light' | 'dark'
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
  setTheme: (theme: 'light' | 'dark') => void
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      theme: 'dark',

      toggleSidebar: () =>
        set((state) => ({ sidebarOpen: !state.sidebarOpen })),

      setSidebarOpen: (open) => set({ sidebarOpen: open }),

      setTheme: (theme) => set({ theme })
    }),
    {
      name: 'clipforge-ui',
      partialize: (state) => ({
        sidebarOpen: state.sidebarOpen,
        theme: state.theme
      })
    }
  )
)
```

- [ ] **Step 5: Create types/index.ts**

```typescript
export interface Job {
  id: string
  userId: string
  sourceType: 'upload' | 'youtube' | 'url'
  sourceUrl: string | null
  status:
    | 'pending'
    | 'downloading'
    | 'transcribing'
    | 'analyzing'
    | 'clipping'
    | 'rendering'
    | 'completed'
    | 'failed'
  progress: number
  progressMessage: string | null
  numClipsRequested: number
  aspectRatio: string
  creditsCharged: number
  createdAt: string
  completedAt: string | null
}

export interface Clip {
  id: string
  jobId: string
  title: string
  hookText: string | null
  viralScore: number
  scoreReason: string | null
  startTime: number
  endTime: number
  duration: number
  filePath: string
  fileUrl: string | null
  thumbnailUrl: string | null
  fileSize: number
  resolution: string
  aspectRatio: string
  hasSubtitles: boolean
  transcriptText: string | null
  createdAt: string
}

export type Plan = 'free' | 'creator' | 'pro' | 'agency'
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/
git commit -m "feat: add design tokens, root layout, utils, UI store, and types"
```

---

### Task 8: Frontend — All Placeholder Pages and API Routes

**Files:**
- Create: `frontend/src/app/page.tsx`
- Create: `frontend/src/app/pricing/page.tsx`
- Create: `frontend/src/app/login/page.tsx`
- Create: `frontend/src/app/register/page.tsx`
- Create: `frontend/src/app/dashboard/layout.tsx`
- Create: `frontend/src/app/dashboard/page.tsx`
- Create: `frontend/src/app/dashboard/create/page.tsx`
- Create: `frontend/src/app/dashboard/jobs/[id]/page.tsx`
- Create: `frontend/src/app/dashboard/clips/page.tsx`
- Create: `frontend/src/app/dashboard/clips/[id]/page.tsx`
- Create: `frontend/src/app/dashboard/history/page.tsx`
- Create: `frontend/src/app/dashboard/brand/page.tsx`
- Create: `frontend/src/app/dashboard/publish/page.tsx`
- Create: `frontend/src/app/dashboard/settings/page.tsx`
- Create: `frontend/src/app/dashboard/billing/page.tsx`
- Create: `frontend/src/app/api/auth/[...nextauth]/route.ts`
- Create: `frontend/src/app/api/webhooks/stripe/route.ts`
- Create: `frontend/src/app/api/webhooks/processing/route.ts`
- Create: `frontend/src/app/api/jobs/route.ts`
- Create: `frontend/src/app/api/clips/route.ts`
- Create: `frontend/src/app/api/upload/route.ts`
- Create: `frontend/src/app/api/user/credits/route.ts`
- Create: `frontend/src/app/api/user/brand/route.ts`

- [ ] **Step 1: Create landing page (src/app/page.tsx)**

```tsx
export default function HomePage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-4xl font-bold">ClipForge</h1>
      <p className="text-muted-foreground">
        Turn long videos into viral clips with AI
      </p>
      <p className="text-sm text-muted-foreground">
        Landing page — Phase 8
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Create public pages (pricing, login, register)**

Each follows the same placeholder pattern with page-specific title:

`pricing/page.tsx`:
```tsx
export default function PricingPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-3xl font-bold">Pricing</h1>
      <p className="text-muted-foreground">Pricing page — Phase 8</p>
    </div>
  )
}
```

`login/page.tsx`:
```tsx
export default function LoginPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-3xl font-bold">Log In</h1>
      <p className="text-muted-foreground">Auth — Phase 5</p>
    </div>
  )
}
```

`register/page.tsx`:
```tsx
export default function RegisterPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-3xl font-bold">Create Account</h1>
      <p className="text-muted-foreground">Auth — Phase 5</p>
    </div>
  )
}
```

- [ ] **Step 3: Create dashboard layout and all dashboard pages**

`dashboard/layout.tsx`:
```tsx
export default function DashboardLayout({
  children
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-dvh">
      <aside className="w-64 border-r border-sidebar-border bg-sidebar p-4">
        <div className="text-lg font-bold text-sidebar-foreground">
          ClipForge
        </div>
        <nav className="mt-8 space-y-2 text-sm text-sidebar-foreground">
          <a href="/dashboard" className="block rounded p-2 hover:bg-sidebar-accent">Home</a>
          <a href="/dashboard/create" className="block rounded p-2 hover:bg-sidebar-accent">Create</a>
          <a href="/dashboard/clips" className="block rounded p-2 hover:bg-sidebar-accent">My Clips</a>
          <a href="/dashboard/history" className="block rounded p-2 hover:bg-sidebar-accent">History</a>
          <a href="/dashboard/publish" className="block rounded p-2 hover:bg-sidebar-accent">Publish</a>
          <a href="/dashboard/brand" className="block rounded p-2 hover:bg-sidebar-accent">Brand Kit</a>
          <a href="/dashboard/settings" className="block rounded p-2 hover:bg-sidebar-accent">Settings</a>
          <a href="/dashboard/billing" className="block rounded p-2 hover:bg-sidebar-accent">Billing</a>
        </nav>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  )
}
```

Each dashboard page follows the pattern:
```tsx
export default function DashboardPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <p className="mt-2 text-muted-foreground">Dashboard home — Phase 6</p>
    </div>
  )
}
```

Create all: `create/page.tsx` ("Create — Phase 6"), `jobs/[id]/page.tsx` ("Job Progress — Phase 6"), `clips/page.tsx` ("Clips Gallery — Phase 6"), `clips/[id]/page.tsx` ("Clip Detail — Phase 6"), `history/page.tsx` ("History — Phase 6"), `brand/page.tsx` ("Brand Kit — Phase 6"), `publish/page.tsx` ("Publish — Phase 6"), `settings/page.tsx` ("Settings — Phase 6"), `billing/page.tsx` ("Billing — Phase 7").

- [ ] **Step 4: Create all API route placeholders**

Each API route returns a JSON placeholder:

`api/auth/[...nextauth]/route.ts`:
```typescript
import { NextResponse } from 'next/server'

export function GET() {
  return NextResponse.json({ message: 'NextAuth — Phase 5' })
}

export function POST() {
  return NextResponse.json({ message: 'NextAuth — Phase 5' })
}
```

`api/webhooks/stripe/route.ts`:
```typescript
import { NextResponse } from 'next/server'

export function POST() {
  return NextResponse.json({ message: 'Stripe webhook — Phase 7' })
}
```

`api/webhooks/processing/route.ts`:
```typescript
import { NextResponse } from 'next/server'

export function POST() {
  return NextResponse.json({ message: 'Processing webhook — Phase 4' })
}
```

`api/jobs/route.ts`:
```typescript
import { NextResponse } from 'next/server'

export function GET() {
  return NextResponse.json({ message: 'Jobs API — Phase 3' })
}

export function POST() {
  return NextResponse.json({ message: 'Jobs API — Phase 3' })
}
```

`api/clips/route.ts`:
```typescript
import { NextResponse } from 'next/server'

export function GET() {
  return NextResponse.json({ message: 'Clips API — Phase 3' })
}
```

`api/upload/route.ts`:
```typescript
import { NextResponse } from 'next/server'

export function POST() {
  return NextResponse.json({ message: 'Upload API — Phase 3' })
}
```

`api/user/credits/route.ts`:
```typescript
import { NextResponse } from 'next/server'

export function GET() {
  return NextResponse.json({ credits: 100, plan: 'free' })
}
```

`api/user/brand/route.ts`:
```typescript
import { NextResponse } from 'next/server'

export function GET() {
  return NextResponse.json({ message: 'Brand API — Phase 6' })
}

export function PUT() {
  return NextResponse.json({ message: 'Brand API — Phase 6' })
}
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/
git commit -m "feat: add all placeholder pages and API routes"
```

---

### Task 9: Frontend — Placeholder Lib Files, Component Dirs, Prisma Schema, Public Assets

**Files:**
- Create: `frontend/src/lib/api.ts`
- Create: `frontend/src/lib/auth.ts`
- Create: `frontend/src/lib/db.ts`
- Create: `frontend/src/lib/stripe.ts`
- Create: `frontend/src/lib/storage.ts`
- Create: `frontend/src/hooks/.gitkeep`
- Create: `frontend/src/components/ui/.gitkeep`
- Create: `frontend/src/components/landing/.gitkeep`
- Create: `frontend/src/components/dashboard/.gitkeep`
- Create: `frontend/src/components/create/.gitkeep`
- Create: `frontend/src/components/clips/.gitkeep`
- Create: `frontend/src/components/billing/.gitkeep`
- Create: `frontend/src/components/shared/.gitkeep`
- Create: `frontend/prisma/schema.prisma`
- Create: `frontend/public/logo.svg`
- Create: `frontend/public/logo-icon.svg`

- [ ] **Step 1: Create lib placeholders**

`lib/api.ts`:
```typescript
// Axios HTTP client with interceptors — Phase 3
// Pattern: wib_my-acount/src/api/axios-client.ts
```

`lib/auth.ts`:
```typescript
// NextAuth.js v5 configuration — Phase 5
```

`lib/db.ts`:
```typescript
// Prisma client singleton — Phase 5
```

`lib/stripe.ts`:
```typescript
// Stripe client and helpers — Phase 7
```

`lib/storage.ts`:
```typescript
// S3/R2 upload/download client — Phase 3
```

- [ ] **Step 2: Create .gitkeep files for all component and hooks directories**

Empty `.gitkeep` in each: `hooks/`, `components/ui/`, `components/landing/`, `components/dashboard/`, `components/create/`, `components/clips/`, `components/billing/`, `components/shared/`.

- [ ] **Step 3: Create prisma/schema.prisma placeholder**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

// Models defined in Phase 5
```

- [ ] **Step 4: Create placeholder SVG logos**

`public/logo.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 40" fill="none">
  <rect width="200" height="40" rx="8" fill="#6366f1"/>
  <text x="100" y="26" text-anchor="middle" fill="white" font-family="system-ui" font-size="18" font-weight="bold">ClipForge</text>
</svg>
```

`public/logo-icon.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none">
  <rect width="40" height="40" rx="8" fill="#6366f1"/>
  <text x="20" y="27" text-anchor="middle" fill="white" font-family="system-ui" font-size="20" font-weight="bold">C</text>
</svg>
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/ frontend/src/hooks/ frontend/src/components/ frontend/prisma/ frontend/public/
git commit -m "chore: add placeholder lib files, component dirs, prisma schema, logos"
```

---

### Task 10: Frontend — Dockerfile

**Files:**
- Create: `frontend/Dockerfile`

- [ ] **Step 1: Create frontend/Dockerfile**

```dockerfile
FROM node:20-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package.json ./
RUN npm install

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]
```

- [ ] **Step 2: Commit**

```bash
git add frontend/Dockerfile
git commit -m "chore: add frontend Dockerfile with standalone Next.js build"
```

---

### Task 11: Nginx Configuration

**Files:**
- Create: `nginx/nginx.conf`

- [ ] **Step 1: Create nginx/nginx.conf**

```nginx
upstream frontend {
    server frontend:3000;
}

upstream backend {
    server backend:8000;
}

server {
    listen 80;
    server_name localhost;

    client_max_body_size 2G;

    proxy_read_timeout 300s;
    proxy_connect_timeout 75s;
    proxy_send_timeout 300s;

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;
    gzip_min_length 256;

    location / {
        proxy_pass http://frontend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    location /api/ {
        proxy_pass http://backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /media/ {
        alias /app/media/;
        expires 1y;
        add_header Cache-Control "public, immutable" always;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?)$ {
        proxy_pass http://frontend;
        expires 1y;
        add_header Cache-Control "public, immutable" always;
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add nginx/
git commit -m "feat: add Nginx reverse proxy config"
```

---

### Task 12: Docker Compose Files

**Files:**
- Create: `docker-compose.yml`
- Create: `docker-compose.dev.yml`

- [ ] **Step 1: Create docker-compose.yml**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: clipforge
      POSTGRES_USER: clipforge
      POSTGRES_PASSWORD: ${DB_PASSWORD:-changeme}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U clipforge"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

  backend:
    build: ./backend
    env_file: .env
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    volumes:
      - media_data:/app/media
    ports:
      - "8000:8000"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/api/health"]
      interval: 10s
      timeout: 5s
      retries: 3

  worker:
    build:
      context: ./backend
      dockerfile: Dockerfile.worker
    env_file: .env
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    volumes:
      - media_data:/app/media

  frontend:
    build: ./frontend
    env_file: .env
    depends_on:
      backend:
        condition: service_healthy
    ports:
      - "3000:3000"

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - media_data:/app/media:ro
    depends_on:
      - frontend
      - backend
    healthcheck:
      test: ["CMD-SHELL", "curl -f http://localhost/ || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 3

volumes:
  postgres_data:
  media_data:
```

- [ ] **Step 2: Create docker-compose.dev.yml**

```yaml
services:
  backend:
    build: ./backend
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
    volumes:
      - ./backend/app:/app/app
      - media_data:/app/media
    ports:
      - "8000:8000"

  worker:
    build:
      context: ./backend
      dockerfile: Dockerfile.worker
    volumes:
      - ./backend/app:/app/app
      - media_data:/app/media

  frontend:
    build: ./frontend
    command: npm run dev
    volumes:
      - ./frontend/src:/app/src
      - ./frontend/public:/app/public
      - ./frontend/next.config.ts:/app/next.config.ts
      - ./frontend/tsconfig.json:/app/tsconfig.json
      - ./frontend/postcss.config.mjs:/app/postcss.config.mjs
    ports:
      - "3000:3000"
    environment:
      - WATCHPACK_POLLING=true
```

- [ ] **Step 3: Commit**

```bash
git add docker-compose.yml docker-compose.dev.yml
git commit -m "feat: add Docker Compose orchestration (prod + dev)"
```

---

### Task 13: Shell Scripts

**Files:**
- Create: `scripts/setup.sh`
- Create: `scripts/seed_db.sh`
- Create: `scripts/deploy.sh`

- [ ] **Step 1: Create scripts/setup.sh**

```bash
#!/bin/bash
set -e

echo "=== ClipForge Setup ==="

if [ ! -f .env ]; then
  echo "Creating .env from .env.example..."
  cp .env.example .env
  echo "Edit .env with your API keys before starting."
fi

echo "Building and starting services..."
docker compose up --build -d

echo "Waiting for services to be healthy..."
sleep 10

echo "Checking health..."
curl -s http://localhost/api/health | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Backend: {d[\"status\"]}')" 2>/dev/null || echo "Backend not ready yet"
curl -s http://localhost > /dev/null && echo "Frontend: ok" || echo "Frontend not ready yet"

echo ""
echo "=== Setup complete ==="
echo "Frontend: http://localhost"
echo "Backend API: http://localhost/api/health"
echo "Backend docs: http://localhost:8000/api/docs"
```

- [ ] **Step 2: Create scripts/seed_db.sh placeholder**

```bash
#!/bin/bash
set -e
echo "Database seeding — configured in Phase 3"
```

- [ ] **Step 3: Create scripts/deploy.sh placeholder**

```bash
#!/bin/bash
set -e
echo "Production deployment — configured in Phase 9"
```

- [ ] **Step 4: Make scripts executable and commit**

```bash
chmod +x scripts/*.sh
git add scripts/
git commit -m "chore: add setup, seed, and deploy shell scripts"
```

---

### Task 14: Install Frontend Dependencies and Verify Build

- [ ] **Step 1: Install npm dependencies**

```bash
cd C:/Users/flori/Documents/projects/clipforge/frontend
npm install
```

- [ ] **Step 2: Verify Next.js builds without errors**

```bash
npm run build
```

Expected: Build completes with standalone output in `.next/standalone/`.

- [ ] **Step 3: Verify Biome check passes**

```bash
npx @biomejs/biome check ./src
```

Expected: No errors (warnings acceptable for unused vars in placeholders).

- [ ] **Step 4: Commit lockfile**

```bash
cd C:/Users/flori/Documents/projects/clipforge
git add frontend/package-lock.json
git commit -m "chore: add frontend package-lock.json"
```

---

### Task 15: Docker Compose Smoke Test

- [ ] **Step 1: Build all images**

```bash
cd C:/Users/flori/Documents/projects/clipforge
docker compose build
```

Expected: All 4 buildable services (frontend, backend, worker) build without errors.

- [ ] **Step 2: Start all services**

```bash
docker compose up -d
```

- [ ] **Step 3: Verify health checks**

```bash
# Wait for startup
sleep 15

# Backend health
curl http://localhost/api/health
# Expected: {"status":"ok","service":"clipforge-backend","version":"0.1.0"}

# Frontend
curl -s http://localhost | head -5
# Expected: HTML containing "ClipForge"

# Postgres
docker compose exec postgres psql -U clipforge -c '\l'
# Expected: lists databases including "clipforge"

# Redis
docker compose exec redis redis-cli ping
# Expected: PONG

# Worker running (sleep loop)
docker compose logs worker --tail 5
# Expected: "Worker waiting for Celery config (Phase 4)"
```

- [ ] **Step 4: Stop services**

```bash
docker compose down
```

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: Phase 1 complete — all services scaffolded and verified"
```

---

## Verification Summary

After Task 15, all Phase 1 exit criteria must pass:

| Criterion | How to verify |
|-----------|--------------|
| `docker compose up` starts all services | Task 15, Step 2 |
| `http://localhost` → Next.js | Task 15, Step 3 (curl localhost) |
| `http://localhost/api/health` → FastAPI | Task 15, Step 3 (curl /api/health) |
| PostgreSQL reachable | Task 15, Step 3 (psql) |
| Redis reachable | Task 15, Step 3 (redis-cli ping) |
| `.env.example` complete | Task 1, Step 3 |
| All directories exist | Tasks 2-9 create all files |
