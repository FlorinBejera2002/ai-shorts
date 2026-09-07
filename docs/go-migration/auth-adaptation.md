# Authentication adaptation

Updated 2026-09-06. Go owns authentication, account lifecycle and authorization;
the Next.js client and default Compose/Nginx routing use the Go API. Registration,
activation, password recovery/change and Google sign-in are implemented. This
page describes the implementation and focused verification. See
[the migration plan](backend-go-migration.md) for aggregate checks and the
remaining deployment acceptance work.

## Source contract and implementation

The local `/Users/tristan/GolandProjects/xstairs_api` reference supplied the
access/refresh JWT design: login returns an access JWT and user, while an
HttpOnly cookie holds the longer-lived refresh JWT. Refresh issues an access
JWT without extending the refresh session. Those responsibilities now live in
`backend-go/internal/identity`, split across handlers, token validation, service,
repository, account lifecycle, Google OAuth and request limits.

The local `/Users/tristan/WebstormProjects/gradali` reference supplied the client
behavior: memory-held access credentials, cookie-enabled login/refresh/logout,
startup refresh and protected navigation. Sneepcut implements that behavior in
`frontend/src/lib/auth-client.ts`, its singleton in `src/lib/auth.ts`, and
`src/components/auth/auth-guard.tsx`. It does not copy the reference's page tree,
React Router setup, second Axios client, persisted login flag or credentials.

`GO_AUTH_ENABLED=true` or `-auth-enabled` enables the full application API.
Without it, startup is liveness-only and opens no database/provider connections.
The Go process never migrates or seeds the configured database. The standard
Compose stack enables Go, runs Alembic first, and routes browser API traffic to
Go. Next.js has no Auth.js authority, database client or business API handlers.

## Session and account endpoints

| Endpoint | Request and successful behavior |
| --- | --- |
| `POST /v1/auth/login` | JSON `email`, `password`; 201 with `access_token`, `user`, `authenticated_at`, plus the refresh cookie. |
| `POST /v1/auth/refresh` | Refresh cookie; 200 with the same response fields. Original sign-in time and refresh expiry remain fixed. |
| `POST /v1/auth/logout` | Refresh cookie; 200 with `null`, removes the server session and expires the cookie. Missing/expired cookies are safe to retry. |
| `GET /v1/auth/me` | Bearer access JWT; 200 with current `user` and `authenticated_at`. |
| `POST /v1/auth/register` | JSON `email`, `name`, `password`; 201 with `user`, `verificationRequired`. Registration does not itself create a session. |
| `POST /v1/auth/resend-activation` | JSON `email`; 200 with `sent: true` for known and unknown valid addresses when delivery is configured. |
| `POST /v1/auth/activate` | JSON `email`, `token` (email may be omitted); consumes the activation token and returns `activated: true`. |
| `POST /v1/auth/forgot-password` | JSON `email`; 200 with `sent: true`, with the same anti-enumeration behavior. |
| `POST /v1/auth/reset-password` | JSON `email`, `token`, `password` (email may be omitted); consumes the reset token, revokes sessions, clears the cookie and returns `reset: true`. |
| `POST /api/user/password` | Bearer access JWT plus `currentPassword`, `newPassword`, `confirmPassword`; revokes sessions and returns `changed: true`, `signInRequired: true`. |
| `GET /v1/auth/google` | Optional `returnTo`, `locale`; starts Google OAuth. |
| `GET /v1/auth/google/callback` | Valid state cookie, matching state and authorization code; creates a Go session and redirects to the allowed dashboard path. |

Registration, forgot-password and reset-password also have `/api/auth/*` aliases
served by Go. Auth/account JSON bodies use strict decoding, reject unknown
fields, require `application/json` and are capped at 16 KiB. Account profile and
deletion payloads have their own smaller bounds.

Auth failures return 401 with a generic error; driver/provider failures do not
expose secret-bearing error text. Storage outages return 503. Request limits
return 429 with `Retry-After`, and rejected origins return 403 before account
work. Responses are no-store and use explicit credentialed CORS.

The access lifetime is 15 minutes and the refresh lifetime is 30 days.
`refreshToken` is HttpOnly, SameSite=Strict, host-only, path `/v1/auth`, and Secure
outside development/test. Browser and API must share a site; CORS does not
remove SameSite restrictions.

Tokens carry a UUID subject, issuer, audience, issued/not-before/expiry times,
explicit `token_use`, random `session_id`, `session_version` and original
`auth_time`. Access and refresh JWTs cannot substitute for each other. Every
use checks the database session, current user, version and expiry. Logout
removes the session, so an overlapping refresh cannot recreate it or make its
resulting access token valid afterward. A storage failure during logout retains
the cookie so the client can retry revocation.

## Registration, recovery and Google

Credential registration normalizes email, validates an optional name of at most
80 characters, and requires a password of at least 12 characters, at most 72
UTF-8 bytes, with upper/lowercase letters, a digit and a supported special
character. Passwords use bcrypt cost 12. Duplicate email returns 409.
`DEFAULT_FREE_CREDITS` defaults to 100.

`AUTH_REQUIRE_EMAIL_VERIFICATION` defaults to false. Enabling it gates newly
registered credential users until activation, and requires configured email
delivery. Existing accounts keep access because the migration adds
`email_activation_required` with a false default. Registration remains durable
if mail delivery fails; resend can recover it. If a mailer is configured,
registration requests an activation email even when activation is optional.

Activation links expire after 24 hours and reset links after one hour. The
shared `verification_tokens` table stores SHA-256 digests rather than usable
link tokens, with purpose/email namespaces. Issuing a replacement serializes
on the user and invalidates the prior token. Consumption is atomic and single
use, checks expiry and an email if supplied, and rejects deletion-pending users.
Password reset/change increments `session_version` and deletes sessions.
Failed mail delivery removes only that delivery's token; cleanup has its own
three-second context so a disconnected request cannot prevent revocation or
revoke a newer request's token.

Google uses authorization code flow with S256 PKCE. A signed, HttpOnly,
SameSite=Lax cookie scoped to `/v1/auth/google` contains a ten-minute state,
verifier and sanitized return path. The database stores a digest of the state
and consumes it once before provider exchange. Missing, tampered, mismatched,
expired or replayed state fails. Returns are normalized to `/dashboard` or
`/ro/dashboard` and their descendants; external paths, traversal outside those
roots and encoded control/backslash tricks do not become redirects.

The token response must contain a Bearer access token; the userinfo response
must contain a bounded subject and verified valid email. Provider requests have
ten-second client timeouts, do not follow redirects, and require complete JSON
responses within 128 KiB. The Google subject identifies an existing linked
account. Matching a credential account's email never silently links it to a
new Google identity; the user must use the existing sign-in method. Successful
callbacks set the ordinary refresh cookie and redirect without putting JWTs
in the URL.

Resend and SMTP implement the same mail interface. Resend uses idempotency keys,
a ten-second client timeout, no redirects and a required acknowledgment within
64 KiB. SMTP honors cancellation and a ten-second operation deadline, requires
TLS outside development/test, validates mail headers and uses parsed mailbox
addresses for the envelope. Provider failures return generic messages without
logging authorization codes, tokens, passwords or mail-provider keys.

## Existing schema and account authorization

The Alembic head is `20260906_0002`, following `20260906_0001`'s durable edit
delivery table. Go keeps the existing schema and user data:

| Existing data | Go behavior |
| --- | --- |
| `users.id` | Preserved UUID is the JWT subject and response `user.id`. |
| `email`, `password_hash` | Existing bcryptjs hashes remain compatible; OAuth-only accounts cannot authenticate with a dummy password. |
| `name`, `avatar_url`, `email_verified`, `created_at` | Nullable values map to `name`, `profile_pic`, `email_verified` and creation time. |
| `credits`, `plan`, `access_role` | Read fresh from storage. Only server-controlled `member` and `viewer` roles are recognized; member guards protect content mutations. |
| `session_version` | Must match current storage. It and the password hash are never serialized in public user responses. |
| `sessions` | Store `go-jwt:<64-hex random ID>`, owner and expiry, never raw JWTs. |
| `accounts` | Preserve Google subject-to-user identity mappings. |
| `verification_tokens` | Purpose-scoped activation/reset and one-use Google state digests. |
| `account_deletion_requests` | Durable deletion marker freezes ordinary access while allowing a restricted session to inspect settings/export and retry deletion. |

Account profile, credits, JSON export and deletion live in
`backend-go/internal/account`. Deletion requires email confirmation and current
password for credential accounts, or an OAuth sign-in within ten minutes for
accounts without a password. It records the marker, stops/fences work,
reconciles Stripe cancellation, waits for worker activity to end, removes media
and then deletes records. Failure keeps the marker and relevant records for a
retry. Settings remain reachable, and normal application reads/mutations stay
blocked. Final deletion removes verification artifacts and cascades sessions.

Expiry is enforced whenever credentials or one-time tokens are used. There is
no periodic Go sweeper for expired session/state/token rows yet; storage
retention cleanup remains an operational follow-up, separate from validity.

## Frontend lifecycle and cutover

One client stores the access token and user in memory and sends the refresh
cookie with credentials enabled. Reload/startup performs a session refresh.
Protected requests attach the bearer token; concurrent 401s share one refresh
request, and each original request is retried at most once with its original
body. Login, refresh and logout use the public request path and do not enter
that retry loop. Requests are restricted to local `/api/` or `/v1/` paths.

A 401 refresh makes the session anonymous. Network/server errors show a
retryable outage state instead of redirecting as though the user signed out.
Logout clears in-memory state immediately, invalidates in-flight results,
waits for a pending refresh and then revokes the server session. Failed logout
shows a retry action and prevents refresh from silently restoring the session.
Neither JWT is written to localStorage. The auth guard preserves localized
return paths and sends deletion-pending users to settings for recovery.

The login/register/recovery/activation pages and dashboard/account UI now use
this client. Middleware handles locale/noindex behavior; it does not treat an
old cookie or UI hint as identity. `GO_API_URL` points Next.js rewrites at Go;
Nginx proxies `/api/*` and `/v1/auth/*` to Go directly in the standard stack.
`NEXT_PUBLIC_API_URL` may select an explicit browser API base when required.

Existing Auth.js cookies do not become Go sessions: the cutover requires a fresh
Go sign-in and preserves accounts/passwords. Keep the JWT secret, issuer and
audience stable across Go replicas. The retained Python HTTP profile is an
explicit compatibility option, not an automatic frontend-auth rollback; any
rollback must restore a compatible frontend and routing together.

## Runtime configuration and request policy

See [backend-go/README.md](../../backend-go/README.md#configuration) and
`.env.example` for the complete configuration. Auth needs `DATABASE_URL`,
`REDIS_URL`, `JWT_SECRET`, matching browser `APP_URL`/`CORS_ORIGINS`, allowed
hosts and explicit trusted proxy networks. Google and mail require their own
provider configuration; missing optional providers return unavailable errors.
Production enforces HTTPS origins, Secure cookies, SMTP TLS and upload scanning.

The active limiter uses atomic Redis windows with hashed keys. Login allows
30 requests per peer and 10 per normalized email per 15 minutes. Registration
allows 10 per peer/hour, recovery/resend 5, reset/activation 10 and Google
start/callback 30. Authenticated operations use per-user feature limits. Redis
failure returns 503; production cannot fall back to local counters. Proxy
headers influence peer identity only when the socket peer matches
`TRUSTED_PROXY_CIDRS`, and only validated `X-Real-IP` is used.

Host allowlisting and security headers wrap the application. Header reads are
limited to five seconds/64 KiB, with one-minute connection idle and up to
30 seconds for graceful shutdown. Route deadlines are 20 seconds for ordinary
operations (15 seconds to read), 100 seconds for script/chat generation,
ten minutes for uploads/logo requests and two minutes for deletion. Provider
and database operations also have their own narrower bounds.

Liveness at `/v1/healthcheck` and `/api/health` does not certify dependencies.
Readiness at `/api/ready` checks PostgreSQL, the required activation/edit schema
and Redis, returning 503 when unavailable. It does not certify workers,
ClamAV, media storage or live providers. Compose uses `/api -healthcheck` to
probe that readiness endpoint.

## Focused verification — 2026-09-06

- The complete `internal/identity` and `internal/email` packages passed
  `go test -race` with current Alembic SQL in the dedicated loopback
  `sneepcut_integration_test` database. Tests create/drop isolated schemas and
  use synthetic accounts.
- PostgreSQL tests exercise existing bcrypt compatibility, schema/null mapping,
  fresh roles/credits, session insertion guards and revocation, registration,
  activation, token replacement/replay, password reset/change and Google identity
  linking. The cancellation regression verifies failed delivery leaves no reset
  token even after its request context is canceled.
- Google callback tests combine real PostgreSQL with mocked token/userinfo
  endpoints: state/PKCE, hashed state storage, secure cookies, redirects, repeat
  identity, mismatch/replay, cancellation, provider failure and credential-email
  conflict. Unit tests reject malformed/oversized provider responses, unverified
  identity, unsafe redirects and secret-bearing failures.
- Resend HTTP mocks and ephemeral SMTP servers cover delivery content,
  acknowledgments, response bounds, redirects, header injection, TLS
  refusal/handshake errors, authentication/envelope/body/quit failures and
  cancellation. No live provider sends are performed.
- Frontend auth-client tests cover coalesced refresh, one retry with the original
  mutation body, logout races/failure, outage states and refusal to send bearer
  tokens to arbitrary URLs. Browser route checks use synthetic API interception;
  the migration plan records the separate built-stack and worker checks.

The focused provider checks do not claim live Google consent, Resend/SMTP
account delivery, a successful SMTP TLS handshake against a real provider,
or a public production cutover. Those need configured deployment credentials
and deployment authorization. The migration plan is the current source for
aggregate verification rather than treating an unconfigured/skipped test as a
pass.
