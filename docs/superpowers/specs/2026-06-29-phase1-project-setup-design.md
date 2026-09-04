# Phase 1: Project Setup & Repository Structure — Design Spec

## Overview

Bootstrap the Sneepcut monorepo with the full directory tree, Docker orchestration for all 6 services, environment configuration, and Nginx reverse proxy. At completion, `docker compose up` starts everything with placeholder apps responding to health checks.

## Exit Criteria

- `docker compose up` starts all services (postgres, redis, backend, worker, frontend, nginx) without errors
- `http://localhost` proxies to Next.js placeholder via Nginx
- `http://localhost/api/health` proxies to FastAPI placeholder via Nginx
- PostgreSQL and Redis reachable from backend/worker containers
- `.env.example` documents every variable from the master plan
- All directories from the master plan exist with placeholder files

## Architecture Decisions

### Adapted from wib_my-acount patterns

| Pattern | wib_my-acount | Sneepcut adaptation |
|---------|--------------|---------------------|
| Bundler | Vite + React SPA | Next.js 15 App Router (plan requirement) |
| State mgmt | Zustand + React Query | Same — Zustand for client, React Query for server |
| UI components | Radix UI + CVA + Tailwind | shadcn/ui (Radix + CVA + Tailwind bundled) |
| Styling | Tailwind v4 + CSS tokens in index.css | Same — CSS variables in globals.css |
| Linter/formatter | Biome | Biome (same config: single quotes, 2 spaces, no semis) |
| HTTP client | Axios with interceptors | Axios with interceptors (same pattern) |
| Forms | React Hook Form + Zod | Same |
| Icons | lucide-react | Same |
| File naming | kebab-case | Same |
| Component naming | PascalCase | Same |
| Component org | components/{feature}/ | Same — components/{feature}/ |
| Docker | Multi-stage node:20-alpine + nginx:alpine | Similar but Next.js standalone output |
| Toasts | sonner | Same |
| Animations | framer-motion | Same |

### Divergences from wib_my-acount (driven by master plan)

- **Auth:** NextAuth.js v5 instead of custom auth store (backend handles sessions)
- **ORM:** Prisma (frontend) + SQLAlchemy (backend) instead of pure API
- **Routing:** Next.js App Router file-based routing instead of react-router
- **i18n:** next-intl or built-in Next.js i18n (not i18next, simpler for SSR)
- **Backend:** FastAPI (Python) as a separate service — not Symfony
- **Queue:** Redis + Celery for background video processing
- **Payments:** Stripe subscriptions + credits system

## Directory Structure

```
sneepcut/
├── docker-compose.yml
├── docker-compose.dev.yml
├── .env.example
├── .gitignore
├── README.md
├── nginx/
│   └── nginx.conf
│
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   ├── next.config.ts
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   ├── biome.json
│   ├── prisma/
│   │   └── schema.prisma          # Placeholder — filled in Phase 5
│   ├── public/
│   │   ├── logo.svg               # Placeholder
│   │   └── logo-icon.svg          # Placeholder
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx         # Root layout (fonts, theme, providers)
│   │   │   ├── page.tsx           # Landing page placeholder
│   │   │   ├── globals.css        # Tailwind + CSS design tokens
│   │   │   ├── pricing/
│   │   │   │   └── page.tsx       # Placeholder
│   │   │   ├── login/
│   │   │   │   └── page.tsx       # Placeholder
│   │   │   ├── register/
│   │   │   │   └── page.tsx       # Placeholder
│   │   │   ├── dashboard/
│   │   │   │   ├── layout.tsx     # Placeholder
│   │   │   │   ├── page.tsx       # Placeholder
│   │   │   │   ├── create/
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── jobs/
│   │   │   │   │   └── [id]/
│   │   │   │   │       └── page.tsx
│   │   │   │   ├── clips/
│   │   │   │   │   ├── page.tsx
│   │   │   │   │   └── [id]/
│   │   │   │   │       └── page.tsx
│   │   │   │   ├── history/
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── brand/
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── publish/
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── settings/
│   │   │   │   │   └── page.tsx
│   │   │   │   └── billing/
│   │   │   │       └── page.tsx
│   │   │   └── api/
│   │   │       ├── auth/
│   │   │       │   └── [...nextauth]/
│   │   │       │       └── route.ts   # Placeholder
│   │   │       ├── webhooks/
│   │   │       │   ├── stripe/
│   │   │       │   │   └── route.ts   # Placeholder
│   │   │       │   └── processing/
│   │   │       │       └── route.ts   # Placeholder
│   │   │       ├── jobs/
│   │   │       │   └── route.ts       # Placeholder
│   │   │       ├── clips/
│   │   │       │   └── route.ts       # Placeholder
│   │   │       ├── upload/
│   │   │       │   └── route.ts       # Placeholder
│   │   │       └── user/
│   │   │           ├── credits/
│   │   │           │   └── route.ts   # Placeholder
│   │   │           └── brand/
│   │   │               └── route.ts   # Placeholder
│   │   ├── components/
│   │   │   ├── ui/                    # shadcn/ui base components (added later)
│   │   │   ├── landing/
│   │   │   ├── dashboard/
│   │   │   ├── create/
│   │   │   ├── clips/
│   │   │   ├── billing/
│   │   │   └── shared/
│   │   ├── lib/
│   │   │   ├── utils.ts               # cn() helper (shadcn pattern)
│   │   │   ├── api.ts                 # Axios client (wib pattern)
│   │   │   ├── auth.ts               # NextAuth config placeholder
│   │   │   ├── db.ts                  # Prisma client placeholder
│   │   │   ├── stripe.ts             # Stripe client placeholder
│   │   │   └── storage.ts            # S3/R2 client placeholder
│   │   ├── hooks/
│   │   ├── stores/
│   │   │   └── ui-store.ts           # Zustand: sidebar, theme (wib pattern)
│   │   └── types/
│   │       └── index.ts
│   └── ...
│
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── alembic.ini
│   ├── alembic/
│   │   ├── env.py
│   │   ├── script.py.mako
│   │   └── versions/
│   │       └── .gitkeep
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                    # FastAPI entry point with /api/health
│   │   ├── config.py                  # Pydantic Settings
│   │   ├── database.py                # SQLAlchemy engine placeholder
│   │   ├── models/
│   │   │   ├── __init__.py
│   │   │   ├── user.py               # Placeholder
│   │   │   ├── job.py                # Placeholder
│   │   │   ├── clip.py               # Placeholder
│   │   │   └── brand.py              # Placeholder
│   │   ├── schemas/
│   │   │   ├── __init__.py
│   │   │   ├── job.py                # Placeholder
│   │   │   ├── clip.py               # Placeholder
│   │   │   └── user.py               # Placeholder
│   │   ├── api/
│   │   │   ├── __init__.py
│   │   │   ├── router.py             # Main router with /api/health
│   │   │   ├── jobs.py               # Placeholder
│   │   │   ├── clips.py              # Placeholder
│   │   │   ├── upload.py             # Placeholder
│   │   │   └── health.py             # Health check endpoint
│   │   ├── services/
│   │   │   ├── __init__.py
│   │   │   ├── video_downloader.py   # Placeholder
│   │   │   ├── transcriber.py        # Placeholder
│   │   │   ├── highlight_detector.py # Placeholder
│   │   │   ├── clip_generator.py     # Placeholder
│   │   │   ├── subtitle_burner.py    # Placeholder
│   │   │   ├── smart_crop.py         # Placeholder
│   │   │   ├── social_poster.py      # Placeholder
│   │   │   └── storage.py            # Placeholder
│   │   ├── workers/
│   │   │   ├── __init__.py
│   │   │   ├── celery_app.py         # Celery config placeholder
│   │   │   └── tasks.py              # Placeholder
│   │   └── utils/
│   │       ├── __init__.py
│   │       ├── ffmpeg_utils.py       # Placeholder
│   │       └── file_utils.py         # Placeholder
│   └── ...
│
└── scripts/
    ├── setup.sh
    ├── seed_db.sh
    └── deploy.sh
```

## Docker Compose Services

### docker-compose.yml (production-like)

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: sneepcut
      POSTGRES_USER: sneepcut
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U sneepcut"]
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
      - backend
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

volumes:
  postgres_data:
  media_data:
```

### docker-compose.dev.yml (overrides for development)

Adds:
- Hot reload for frontend (volume mount src/, node_modules excluded)
- Hot reload for backend (volume mount app/, uvicorn --reload)
- Worker with --reload flag
- Exposed debug ports

## Nginx Configuration

```
/ → frontend:3000
/api/ → backend:8000
/media/ → static files (media_data volume)
client_max_body_size 2G
proxy_read_timeout 300s
gzip on (text, json, js, css)
```

## Environment Variables (.env.example)

Complete list from master plan — all documented with comments, grouped by service.

## Frontend Scaffold Details

### package.json dependencies (Phase 1 only — minimum viable)

```json
{
  "dependencies": {
    "next": "^15",
    "react": "^19",
    "react-dom": "^19",
    "tailwindcss": "^4",
    "@tailwindcss/postcss": "^4",
    "zustand": "^5",
    "lucide-react": "latest",
    "clsx": "^2",
    "tailwind-merge": "^2",
    "class-variance-authority": "^0.7"
  },
  "devDependencies": {
    "typescript": "^5.6",
    "@biomejs/biome": "^1.9",
    "@types/react": "^19",
    "@types/react-dom": "^19"
  }
}
```

Additional deps (next-auth, prisma, stripe, axios, react-query, etc.) added in later phases when needed.

### biome.json (matching wib_my-acount)

- Single quotes
- 2-space indent
- No semicolons
- 80-char line width
- JSX double quotes
- Organize imports
- a11y rules as errors
- No console.log in production

### globals.css — Design Tokens (matching wib_my-acount pattern)

CSS variables on :root for light mode, .dark for dark mode:
- `--color-primary`: #6366f1 (indigo)
- `--color-primary-foreground`: #ffffff
- `--color-secondary`: #8b5cf6
- `--color-accent`: #06b6d4
- `--color-background`, `--color-foreground`
- `--color-card`, `--color-card-foreground`
- `--color-muted`, `--color-muted-foreground`
- `--color-border`, `--color-input`, `--color-ring`
- `--color-destructive`, `--color-destructive-foreground`
- `--color-sidebar-*` variants
- `--radius`: 0.5rem
- Dark mode as default (matches master plan)

### UI Store (Zustand — wib pattern)

```ts
interface UiState {
  sidebarOpen: boolean
  theme: 'light' | 'dark'
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
  setTheme: (theme: 'light' | 'dark') => void
}
```

Persisted to localStorage via zustand/middleware.

### lib/utils.ts (shadcn cn() helper)

```ts
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

### Placeholder Pages

Every page.tsx will render a minimal component:
```tsx
export default function PageName() {
  return <div className="p-8"><h1>Page Name</h1><p>Coming in Phase X</p></div>
}
```

## Backend Scaffold Details

### requirements.txt (Phase 1 — minimum)

```
fastapi==0.115.*
uvicorn[standard]==0.34.*
python-dotenv==1.1.*
pydantic==2.11.*
pydantic-settings==2.9.*
```

Full deps (sqlalchemy, celery, whisper, etc.) added in Phase 2-3.

### main.py

Minimal FastAPI app with CORS middleware, mounts the API router.

### health.py

```python
@router.get("/api/health")
def health_check():
    return {"status": "ok", "service": "sneepcut-backend"}
```

### Dockerfile

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Dockerfile.worker (placeholder)

Same base, entry point: `celery -A app.workers.celery_app worker --loglevel=info`
Will fail gracefully until Celery is configured in Phase 4.

## What Phase 1 Does NOT Include

- No database models or migrations (Phase 3)
- No auth (Phase 5)
- No Stripe (Phase 7)
- No video processing logic (Phase 2)
- No shadcn/ui components installed (Phase 6 — added as pages are built)
- No OpenShorts code extraction (Phase 2)

## Verification Plan

1. `docker compose up --build` — all 6 services start
2. `curl http://localhost` — returns Next.js HTML
3. `curl http://localhost/api/health` — returns `{"status": "ok"}`
4. `docker compose exec postgres psql -U sneepcut -c '\l'` — DB accessible
5. `docker compose exec redis redis-cli ping` — returns PONG
6. Worker container starts (may log Celery not configured — acceptable)
