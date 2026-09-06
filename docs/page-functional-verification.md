# Page functional verification — 4 September 2026

This pass verifies the existing 23-page application and preserves the concurrent shadcn redesign. Each page and the shared controls have separate tickets on Sneep Cut → IT → Sneepcut Board. Defects found during verification have their own tickets.

## Defects implemented

| Ticket | Change |
| --- | --- |
| [Upload lifecycle](https://app.notion.com/p/3d1c7071a19881b9946acaeced833785) | Show preparation immediately, bound metadata probing and authorization, cancel preparation/transfer on request or unmount, prevent stale responses, show replacement progress, support keyboard file selection, and block generation during replacement. |
| [Job progress recovery](https://app.notion.com/p/3d1c7071a19881e6a28edbfeb2284550) | Explicit cancelled/failed/completed states, no ETA for terminal jobs, immediate handling of terminal HTTP errors, retry control, and cancellation/reset when the job changes. |
| [Clip trim and clipboard](https://app.notion.com/p/3d1c7071a19881ee8ee1e42931c12a3e) | Block non-finite, negative, out-of-bounds, and shorter-than-three-second trim ranges; handle clipboard permission errors for all copy actions. |
| [Password recovery](https://app.notion.com/p/3cfc7071a198814cbe41ce8f010e6a4c) | Add configurable reset-email delivery, trusted HTTPS link construction, bounded requests, idempotency, failed-token revocation and database cleanup. Real delivery acceptance remains dependent on sender configuration. |

## Page inventory

Public: home, pricing, login, registration, forgot password, reset password, privacy, terms.

Authenticated: dashboard, create, review, clips, clip detail, clip editor, history, job detail, analytics, calendar, script generator, publish, brand, billing, settings.

The matrix checks HTTP status, expected route, rendered heading, horizontal overflow, uncaught browser errors and missing translations/hydration errors in Chromium desktop light, desktop dark and Romanian mobile. Screenshots and the machine-readable matrix are saved under `frontend/test-results/all-pages/`. These generated files are ignored by Git.

The disposable account harness also exercises empty and populated dashboard data, account isolation, date-range filters, sidebar navigation, locale/theme controls, keyboard interaction, modal focus return, calendar draft creation, profile saving, brand saving and clip metadata persistence. Controlled API responses exercise job terminal/error states, upload replacement/cancellation, clipboard denial and invalid trim inputs without rendering or publishing real media.

## Running locally

Run the local Docker stack first. Set `SNEEPCUT_BROWSER_MUTATIONS=allow-synthetic-account`, `SNEEPCUT_ALL_PAGES=1`, and `SNEEPCUT_PLAYWRIGHT_MODULE` to an installed Playwright module's absolute `index.mjs` path. Run `node scripts/test-dashboard-design.mjs` from `frontend`. The harness creates isolated accounts ending in `@example.invalid` and deletes its fixtures in `finally`.

The default mobile browser is Firefox. `SNEEPCUT_MOBILE_ENGINE=chromium` explicitly selects Chromium mobile when Firefox cannot launch; report names retain the actual browser. Do not claim Firefox coverage for that run.

Run `node --test tests/*.test.mjs` and `node node_modules/typescript/bin/tsc --noEmit --incremental false` from `frontend` for the automated gates. `docker compose build frontend` verifies the production bundle.

Avoid rebuilding or restarting the shared app during a browser run. After changing the code, recreate the frontend from the completed image and reload nginx before testing.

## Password-reset delivery setup

Set `RESEND_API_KEY`, `AUTH_EMAIL_FROM` to a verified sender, and `NEXTAUTH_URL` to the trusted public HTTPS origin. The adapter uses the [Resend email API](https://resend.com/docs/api-reference/emails/send-email) with a per-token idempotency key. Secrets remain server-side. The example environment file documents these settings.

Explicit `APP_ENV=development` or `test` allows local reset-link logging when delivery is not configured. Production and other environments return a uniform 503 before looking up an account if delivery is unconfigured. Provider errors revoke the newly issued token, log a non-sensitive failure, and preserve the same public response as unknown accounts to avoid disclosing account existence. Operators must monitor delivery errors.

## Acceptance boundaries

- Direct social publishing remains an explicitly unavailable feature with working links to the library and planning calendar; scheduling does not post externally. Its existing feature ticket remains open.
- Live Stripe checkout/portal, Google OAuth, email receipt and full AI video processing require configured provider environments. Local page rendering and handled errors are not proof of those external services.
- Synthetic media bytes are supplied for playback/editor UI checks; this pass does not claim production video quality, throughput or deliverability.
- No production deployment, payment or external publication was performed.

## Final results

The final production build (including the restored original Home), TypeScript validation, 132 automated tests and Biome checks for the six functional implementation files passed.

`frontend/test-results/functional-interactions.log` records a complete successful Chromium interaction run: create controls, script choices/empty-input guard, editor shortcuts/export cancellation/focus return, calendar/profile/brand persistence, auth visibility/reset validation, pricing FAQ/mobile menu, job recovery, clip metadata/trim/clipboard handling and upload replacement/cancellation. All synthetic fixtures were removed. The three new defect tickets are Done.

The final matrix passed **69/69 checks**: all 23 pages in Chromium desktop light, desktop dark and Romanian mobile. Every row returned HTTP 200 at the expected route, rendered its heading, had no horizontal overflow and produced no uncaught JavaScript, missing-message or hydration errors. Evidence: `frontend/test-results/all-pages/report.json` and `frontend/test-results/functional-audit.log`.

Home retains its original cinematic design. The focused Home check initially expected the short HTML language tag `ro` instead of the app's correct `ro-RO`; after correcting that test assertion, `frontend/test-results/home-navigation.log` records both mobile keyboard/locale navigation and navigation with JavaScript disabled passing. The 69-row matrix was already complete and was not rerun for this test-only correction.

The 25 page/shared-control tickets and three defect tickets are **Done**; a final Notion query confirmed all 28 statuses. Password-recovery delivery acceptance remains open. Firefox could not launch reliably on this machine; the final matrix explicitly uses Chromium and does not claim final Firefox coverage. No synthetic test accounts remain.
