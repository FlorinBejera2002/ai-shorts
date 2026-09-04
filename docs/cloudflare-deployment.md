# Sneepcut frontend on Cloudflare Workers

The Next.js frontend is packaged with OpenNext and deployed from the
`frontend/` directory. The Python API, PostgreSQL database, Redis service, and
media origin remain separate public services; Docker-only names such as
`backend`, `postgres`, `redis`, and `nginx` cannot be used by the Worker.

## Prerequisites

- Node.js 22 or newer and `npm ci` run inside `frontend/`.
- A clean release checkout without a developer `.env.local` file. OpenNext
  packages Next.js environment files as server-only fallback configuration;
  provide release values through the build environment and Worker bindings.
- A Cloudflare Workers account with Cloudflare Images enabled for the `IMAGES`
  binding.
- Public TLS endpoints for PostgreSQL, Redis, the Python API, and media.
- The latest Alembic migrations applied before the new Worker receives traffic.
- The Python API `CORS_ORIGINS` contains the exact frontend origin, and
  `ALLOWED_HOSTS` contains the API hostname.

Large videos never pass through the Worker. The browser first obtains a
five-minute, single-use, user- and file-bound authorization from
`/api/upload/authorize`, then uploads directly to
`NEXT_PUBLIC_UPLOAD_URL`. The upload URL must be the public Python endpoint
ending in `/api/upload/direct`, and both services must share the same
`UPLOAD_TOKEN_SECRET`. The Python endpoint authenticates and atomically claims
the upload nonce before reading the raw request body. Its local media path must
be a durable volume shared with the processing workers and media server.

## Build and runtime configuration

Keep `keep_names: false` in `wrangler.jsonc`: Wrangler's default name-preservation
helper breaks the serialized browser initialization script from `next-themes`.
This follows the [OpenNext keep-names guidance](https://opennext.js.org/cloudflare/howtos/keep_names).
The local smoke checks reject this helper in inline scripts; also check the
browser console when verifying a release.

Prisma uses `engineType = "client"` with `@prisma/adapter-pg`, not a native Rust
query engine. The `prebuild` hook regenerates the client, and OpenNext's
external-package transform selects its workerd/WASM entry point. Keep the
Prisma packages in `serverExternalPackages` and use the request-scoped factory
in `src/lib/db.ts`; native query engines and cross-request pooled connections
are not compatible with the Worker runtime.

On Windows, the external-package list also includes native-separator aliases.
OpenNext 1.20.6 compares Windows paths before normalizing their separators; these
aliases ensure its workerd rewrite actually runs for both Prisma packages.
The package-copy regression and authenticated local Worker smoke test cover
this platform-specific behavior. WSL/Linux remains the preferred release
build environment. See the [OpenNext workerd-resolution guidance](https://opennext.js.org/cloudflare/howtos/workerd)
and [Prisma configuration guidance](https://opennext.js.org/cloudflare/howtos/db).

Set these both as Cloudflare Workers build variables/secrets and as runtime
variables/secrets. Values prefixed with `NEXT_PUBLIC_` are embedded during the
Next.js build and must therefore be available to the build.

Public configuration:

- `APP_ENV=production`
- `APP_URL`, `NEXTAUTH_URL`, and `NEXT_PUBLIC_APP_URL`: the same HTTPS origin
- `BACKEND_URL`: public HTTPS Python API origin
- `MEDIA_PROXY_HOST`: public HTTPS media origin
- `NEXT_PUBLIC_UPLOAD_URL`: public HTTPS Python URL ending in
  `/api/upload/direct` and using the same origin as `BACKEND_URL`
- `NEXT_IMAGE_REMOTE_HOSTS`: comma-separated, explicitly trusted image hosts
- `NEXT_PUBLIC_CONTACT_EMAIL`: optional verified operator mailbox shown on the
  privacy and terms pages; leave empty rather than publishing a placeholder
- `AUTH_TRUST_HOST=true`: required because Cloudflare is the trusted public
  reverse proxy; the deployment validator rejects every other value

Secrets:

- `AUTH_SECRET` (or legacy-compatible `NEXTAUTH_SECRET`)
- `INTERNAL_API_KEY`
- `UPLOAD_TOKEN_SECRET`
- `DATABASE_URL` using a public PostgreSQL endpoint or pooler and enforcing TLS
  with `sslmode=require`, `verify-ca`, or `verify-full`
- `DIRECT_URL` for migration jobs only
- `REDIS_URL` using `rediss://`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- unique `STRIPE_PRICE_CREATOR`, `STRIPE_PRICE_PRO`, and
  `STRIPE_PRICE_AGENCY` values
- Google OAuth client ID/secret if Google sign-in is enabled

Placeholder/test secrets are rejected by the production validator. Keep
secrets out of `wrangler.jsonc` and Git. Set them in the Cloudflare
dashboard or with interactive `wrangler secret put` commands. Deploy uses
`--keep-vars` so dashboard-managed runtime values are retained.

## Verification and release

From `frontend/`:

1. Load the production variables into the shell (or run Node with an
   appropriate `--env-file`) and run `npm run cloudflare:validate`.
2. Run `npm run cloudflare:types` and `npm run typecheck`.
3. Run the frontend tests and `npm run check`.
4. Run `npm run cloudflare:dry-run`. Review Wrangler's compressed Worker size;
   that is the size Cloudflare enforces.
5. Apply Alembic migrations to production and verify the API health endpoint.
6. Run `npm run deploy:cloudflare` from `frontend/`, never the repository root.
7. Configure the Stripe webhook as
   `https://<frontend-origin>/api/webhooks/stripe` and OAuth callbacks under the
   same canonical frontend origin.
8. Smoke-test `/`, `/ro`, sign-in, a protected redirect, billing portal return,
   direct upload, signed media playback, and account export/delete.

For repeatable local route checks, start the built app and run
`npm run test:smoke -- http://localhost:3001`. The script checks localized public
pages, authentication redirects, anonymous API rejection, sitemap, and robots
without modifying accounts or calling a payment flow. If testing the output
of `cloudflare:dry-run` with `next start`, also set `NEXT_DIST_DIR=.next` when
starting the server; ordinary `npm run build` uses `.next-prod` instead.

Prefer checking the actual built Worker with `npx wrangler dev --local --port 8787`
and `npm run test:smoke -- http://127.0.0.1:8787` so bundler/runtime differences
are covered too.

For interactive browser tests, use `http://localhost:8787`, matching Wrangler's
forwarded hostname. Mixing `127.0.0.1` with that hostname causes Next.js to
correctly reject Server Actions on origin checks. Authenticated production-build
checks also need a disposable Redis instance: rate limiting remains fail-closed
even when the local `APP_ENV` value is development.

With a disposable local database and a synthetic signed-in account, set
`SNEEPCUT_SMOKE_COOKIE` to that local session's Cookie header to add authenticated
dashboard, settings, clips, billing, calendar, and read-only API checks. Never
use a production session or database for these local checks. Disable external
provider credentials in the test runtime to exercise safe unavailable states.

Local checks do not replace the authenticated deployment smoke test in step 8.

Rollback by deploying the previously known-good Worker version in Cloudflare.
Do not roll back database migrations after a new application version has begun
writing data unless that migration's downgrade path has been rehearsed against
a backup.
