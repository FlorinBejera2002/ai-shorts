# Sneepcut frontend on Cloudflare Workers

The Next.js frontend is packaged with OpenNext and deployed from `frontend/`.
Go owns authentication, database access, billing, email, uploads and every API
route. Next.js renders the interface and forwards `/api/*` and `/v1/*` to Go.
The Python processing workers, PostgreSQL, Redis, and media storage run outside
Cloudflare Workers.

## Prerequisites

- Node.js 22 or newer and a clean `npm ci` inside `frontend/`.
- A release checkout without developer `.env.local` or `.dev.vars` files.
  Frontend build and Worker configuration must contain no backend credentials.
- A Cloudflare Workers account with the `IMAGES`, `ASSETS`, and
  `WORKER_SELF_REFERENCE` bindings declared in `frontend/wrangler.jsonc`.
- Public HTTPS origins for Go and media. Docker service names and loopback
  addresses are valid only for the local Docker stack.
- Current Alembic migrations applied to Go's PostgreSQL database, with Go,
  Redis, and the processing workers healthy.
- Go `CORS_ORIGINS` includes the exact frontend origin, and `ALLOWED_HOSTS`
  includes the public API hostname. Configure `TRUSTED_PROXY_CIDRS` for the
  actual reverse proxies; do not trust arbitrary forwarded headers.

Large videos bypass the frontend Worker. The browser obtains a short-lived,
single-use, user- and file-bound authorization from `/api/upload/authorize`.
Go returns `uploadUrl` and a purpose-bound token. Configure
`NEXT_PUBLIC_UPLOAD_URL` **in Go's environment** as its public HTTPS
`/api/upload/direct` endpoint. The browser sends the file directly to that URL;
Go verifies the token, consumes its nonce, scans the upload, and stores it.
Local storage must be durable and accessible to the processing workers and
media server. Object storage credentials also belong in Go and its workers.

## Frontend build configuration

Keep `keep_names: false` in `frontend/wrangler.jsonc`. Name preservation can
break the serialized browser initialization script from `next-themes`; local
smoke checks cover that regression.

Provide these values to the frontend build:

- `NEXT_PUBLIC_APP_URL`: canonical public HTTPS frontend origin.
- `NEXT_DEPLOYMENT_ID`: optional unique release identifier containing only
  letters, numbers, hyphens or underscores. If omitted, the build uses the
  first valid CI commit identifier and then the checked-out git commit. This
  enables Next.js version-skew protection so an open browser reloads onto a
  consistent release after deployment.
- `GO_API_URL`: public HTTPS Go origin, without an API path, query or fragment.
- `MEDIA_PROXY_HOST`: public HTTPS media origin, without a path, query or
  fragment.
- `NEXT_PUBLIC_API_URL`: optional public HTTPS Go origin for direct browser API
  requests. Leave unset to use the frontend's `/api/*` and `/v1/*` rewrites.
  A direct origin must be on the same site as the frontend because Go's refresh
  cookie uses `SameSite=Strict`; unrelated API and frontend domains cannot share
  that browser authentication flow. Go must allow the exact frontend origin.
- `NEXT_IMAGE_REMOTE_HOSTS`: optional comma-separated trusted image hosts.
- `NEXT_PUBLIC_CONTACT_EMAIL`: optional verified operator mailbox shown on the
  privacy and terms pages.

Next.js embeds `NEXT_PUBLIC_*` values and evaluates rewrites during the build.
Changing a runtime Worker variable alone does not change the bundled API or
media destination: rebuild when these origins change. Deployment validation
requires clean public HTTPS origins and rejects backend secrets in the build
environment. The Worker no longer needs Prisma, PostgreSQL, Redis, NextAuth,
Stripe, upload-signing, mail, or object-storage credentials. Remove obsolete
secret bindings from an existing Worker during migration; `--keep-vars` retains
existing dashboard-managed values.

Go's separate environment contains `APP_URL`, `JWT_SECRET`, `DATABASE_URL`,
`REDIS_URL`, `INTERNAL_API_KEY`, `UPLOAD_TOKEN_SECRET`, and the enabled provider
credentials. Configure `GOOGLE_REDIRECT_URL` for `/v1/auth/google/callback` on
the public origin used for the OAuth flow. With the default frontend rewrites,
that is the canonical frontend origin; with direct browser API requests, it is
the Go origin. Access tokens remain in browser memory and refresh tokens stay
in Go-issued HttpOnly cookies.

## Verification and release

From `frontend/`:

1. Load the public frontend build variables and run `npm run cloudflare:validate`.
2. Run `npm run typecheck`, `npm test`, and `npm run check`.
3. Run `npm run cloudflare:dry-run` and review the resulting Worker artifact.
4. Verify current migrations and the Go health/readiness endpoints before
   routing traffic to the new backend.
5. Once deployment is authorized, run `npm run deploy:cloudflare` from
   `frontend/`.
6. Point Stripe webhooks at Go's `/api/webhooks/stripe`, either directly on the
   public Go origin or through the frontend rewrite. Configure Google OAuth's
   callback to match `GOOGLE_REDIRECT_URL` exactly.
7. Verify `/`, `/ro`, sign-in and refresh, protected redirects, email activation
   and password reset, billing return, direct upload, signed media playback,
   calendar edits, account export, and account deletion using a dedicated test
   account and test-mode provider resources.

For local route checks, start Go and the built frontend, then run
`npm run test:smoke -- http://localhost:3001`. The script checks public routes,
API authentication boundaries, sitemap and robots. Client-side protected-page
redirects are covered by browser checks. If testing the output of the OpenNext
build with `next start`, set `NEXT_DIST_DIR=.next`; ordinary `npm run build`
uses `.next-prod`.

`frontend/scripts/go-browser-checks.mjs` checks desktop English and mobile
Romanian pages with mocked Go responses, plus sign-in, sign-out, and restricted
account-deletion recovery. It intercepts all API requests and never touches a
database. For actual browser mutations, use the isolated database and synthetic
account procedures in [frontend-backend-verification.md](frontend-backend-verification.md).
A mock provider pass does not verify real Stripe redirects, webhook delivery,
Google OAuth, outbound email, or production origin configuration.

Rollback by redeploying the previously verified frontend and Go versions as a
compatible pair. Keep durable checkout and deletion records intact, and do not
roll back database migrations without a rehearsed recovery procedure.
