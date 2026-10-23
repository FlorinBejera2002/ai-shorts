# Stripe billing operations

Billing belongs to an authenticated **user**, not to an organization. The Go API
owns Checkout, Customer Portal, subscription state and credit grants. The browser
does not choose the amount, currency, Stripe customer, beneficiary or entitlement.
A Checkout success redirect is a prompt to re-read server state, never payment
proof. A Stripe customer email edited in Portal does not change the app login.

## Launch policy

The launch sandbox uses monthly EUR prices: Creator **€19 / 1,500 credits**,
Pro **€49 / 5,000 credits**, Agency **€149 / 20,000 credits**. Signup retains the
1,000-credit allowance. Paid-cycle credits accumulate without expiration; plan
changes retain the balance and allocate the new plan's credits at the next
successful regular billing cycle. There are no launch top-up packs or paid
trials. A change takes effect immediately with **no proration**. Cancellation is
at period end. There is no additional paid-feature grace period for `past_due`;
previously acquired credits remain usable within the account's available features.

These are product choices, not price equivalence with competitors. Research
references are [OpusClip pricing](https://www.opus.pro/pricing) and
[Klap pricing](https://klap.app/pricing); their minutes, credits and annual terms
are not directly comparable with Sneep Cut credits.

The synchronized access mapping is explicit:

| Stripe subscription state | Application access |
| --- | --- |
| `active` | Actual configured Stripe plan only while verified `currentPeriodEnd` is in the future |
| `trialing` | The same future-coverage rule; preserves legacy trial compatibility, while new Checkout creates no trials |
| `past_due`, `incomplete`, `incomplete_expired`, `unpaid`, `paused`, `canceled` | Free-plan feature access; existing balance retained |

Missing or elapsed verified coverage gives free-plan feature access even if a
delayed callback leaves the stored Stripe status `active` or `trialing`. This
access calculation preserves the raw financial record and credit balance;
manual non-Stripe grants and role-based admin allowances keep their own rules.

Scheduled cancellation can arrive as `cancel_at_period_end=true` **or a positive
`cancel_at` while that boolean remains false**. The persisted
`stripe_cancel_at_period_end` field and API `cancelAtPeriodEnd` normalize both
shapes to mean any scheduled cancellation. `stripe_current_period_end` and API
`currentPeriodEnd` contain the effective verified coverage end, shortened by an
earlier explicit `cancel_at`. The interface displays the scheduled end; paid
access cannot continue past it while waiting for a terminal callback.

Stripe's `pause_collection` can leave the subscription `active`, so access still
depends on its future verified coverage; an actual `paused` status gives free
feature access. Only successful `subscription_create` and
`subscription_cycle` invoices grant recurring credits, exactly once per invoice;
proration/update invoices never create an extra allocation.

Sandbox prices declare `tax_behavior=inclusive`; automatic tax is disabled.
Before live activation, GENESIS PROCUREMENT S.R.L.'s accountant must confirm the
actual tax treatment. This integration does not change tax registrations, legal
details or banking settings. Price tax behavior is not a substitute for tax
registration or a tax calculation policy.

## Safe account configuration

Use a dedicated account sandbox, not live mode. Stripe recommends general
sandboxes for new integrations and separate local/CI sandboxes. See
[Stripe sandboxes](https://docs.stripe.com/sandboxes). Grant access through the
connected Stripe service, Dashboard invitation or authenticated CLI. Supply API
secrets only through the process environment or your secret manager. Never paste
them into chat, checked-in files, command arguments, screenshots or logs.

`config/stripe-sandbox-policy.json` contains the explicit launch settings.
The checked-in policy identifies the verified **GENESIS PROCUREMENT S.R.L.
sandbox**, `acct_1USys6IBapm0ztYV`, and its created product/price/Portal IDs.
`config/stripe-sandbox-manifest.json` records the initial empty inventory and
read-back evidence. These are sandbox resources, not live configuration.
`webhookUrl` remains null until a sandbox HTTPS callback exists. For another
sandbox, use a separate reviewed policy with its verified account and resource IDs.
For localhost, use `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
against that sandbox instead of creating an unreachable remote endpoint.

For the isolated integration harness, install the official npm CLI locally:

```sh
npm install --prefix .cache/tmp/stripe-billing/cli --no-save --no-package-lock @stripe/cli@1.54.1
node scripts/stripe-webhook-listen.mjs
```

This wrapper verifies the ignored
`.env` test key against the expected account, supplies the key to the CLI only
through `STRIPE_API_KEY`, and forwards to loopback
`http://127.0.0.1:58081/api/webhooks/stripe`. It captures the signing secret
directly into ignored `.env`, suppresses raw CLI output, and emits only event IDs,
types and HTTP status evidence. The same structural evidence is appended to
`frontend/test-results/stripe-deliveries.jsonl`; nonsecret process/readiness data
is in `.cache/tmp/stripe-billing/listener-status.json`.
Start the harness after the wrapper reports ready, loading the newly saved `.env`.
Stop the wrapper and its CLI child before removing the scratch CLI installation.

CLI 1.54.1 `listen --help` has no API-version override. Its default payload version
is the sandbox account default (observed `2026-09-30.endive`); Go source reads are
pinned to `2026-06-24.dahlia`. The local real-provider matrix must therefore verify
that adapter compatibility. A production snapshot endpoint can pin its own
`2026-06-24.dahlia` version. CLI transport creates no durable HTTPS endpoint and
does not prove production endpoint delivery or satisfy production registration.
`events resend --webhook-endpoint` is supported by CLI help for registered
endpoints; it does not target an ephemeral CLI listener.

While the isolated harness is running, retrieve a genuine sandbox event and
exercise duplicate delivery locally with:

```sh
node scripts/stripe-sandbox-replay.mjs evt_FROM_THIS_SANDBOX
```

The helper verifies the expected sandbox, retrieves the original Stripe event,
checks its mode/account, signs its unchanged body using the local listener secret,
and POSTs it twice to the fixed loopback callback. It prints and appends only
event ID, HTTP status and duplicate result to
`frontend/test-results/stripe-replays.jsonl`. This is **local redelivery of a
genuine Stripe payload**, not Stripe's provider-side resend or automatic retry.
For outage verification, pause only the disposable harness's delivery handler,
create a fresh tagged synthetic billing event, observe a genuine CLI `503`,
restore that handler and replay the same event twice. Retain both delivery and
replay evidence and verify access/balance recovery without double grants.

Set these process variables securely, without echoing values:

| Variable | Purpose |
| --- | --- |
| `STRIPE_SECRET_KEY` | Sandbox `sk_test_` or restricted `rk_test_` key |
| `STRIPE_MODE` | Explicitly `test` |
| `STRIPE_EXPECTED_ACCOUNT_ID` | Verified `acct_...`, matching policy |

Prepare a read-only review plan from the repository root:

```sh
node scripts/stripe-sandbox.mjs prepare --policy /private/sandbox-policy.json --out /private/stripe-review.json
```

Inspect the review plan, including the account ID and every proposed resource.
Apply that exact reviewed plan only after the intended account and commercial
policy have been confirmed:

```sh
node scripts/stripe-sandbox.mjs apply --policy /private/sandbox-policy.json --reviewed /private/stripe-review.json --out /private/stripe-manifest.json
```

Both commands reject live keys, missing/mismatching account IDs and any non-test
resource. Prepare is read-only. Apply re-reads the full inventory and rejects a
changed review before its first mutation. Products/prices use stable metadata and
lookup keys; explicitly supply `productId`, `priceId` or Portal `configurationId`
to adopt reviewed existing resources. Ambiguous matches or mismatched immutable
prices fail, rather than silently creating replacements. Portal and webhook
configurations must match the policy, including features and event types.

Creates use deterministic idempotency keys. An interrupted apply saves nonsecret
IDs after each completed operation. Do not manually recreate resources after a
timeout: inspect Stripe and the manifest, prepare a fresh review, then resume.
There is no cross-resource Stripe transaction; partial configuration is possible.
Concurrent or retried identical creates share the same idempotency key, and later
runs discover persisted resources by metadata.

The review and manifest retain the nonsecret policy snapshot, exact price IDs,
Portal configuration ID and webhook ID.
Keep it outside disposable `.cache/tmp/` and retain it with the sandbox's operating
records. It never contains the webhook signing secret. Read that secret securely
from the specific Dashboard endpoint, or use the separate CLI-listener secret,
and inject `STRIPE_WEBHOOK_SECRET` into the isolated app. A listener secret is not
the registered endpoint's secret. See [signature verification](https://docs.stripe.com/webhooks#verify-signature).

Configure the runtime with the manifest's `STRIPE_PRICE_CREATOR`,
`STRIPE_PRICE_PRO`, `STRIPE_PRICE_AGENCY`, `STRIPE_PORTAL_CONFIGURATION`,
`STRIPE_MODE=test`, `STRIPE_EXPECTED_ACCOUNT_ID` and the securely injected secrets.
The frontend needs no secret or publishable Stripe key for hosted redirects.
No pack price variables are set for the launch policy.

## Webhooks, monitoring and recovery

The callback is `POST /api/webhooks/stripe`. Configure registered HTTPS
destinations with **snapshot** events pinned to **2026-06-24.dahlia**, matching
the Go source adapter. The local CLI delivered account-default
`2026-09-30.endive` snapshots; the real sandbox matrix verified compatibility with
those payloads. Do not configure thin events for this handler. The configurator's
exported `WEBHOOK_EVENTS` is the event allowlist:
Checkout completion/expiry/async success; subscription creation, changes, deletion,
pause/resume and pending-update changes; invoice paid/payment success, failure,
additional authentication and finalization failure.

Verify signatures against the original request bytes. Failed processing must
return non-2xx so Stripe retries; committed event IDs and invoice/Checkout grant
identifiers make replay safe. Distinct events can share a second, and events can
arrive out of order: the reconciler reads current Stripe subscription state before
changing access. Monitor callback 4xx/5xx, signature failures, provider errors,
reconciliation failures and delayed Checkout confirmation. Alert on sustained
failure, not on a single expected test decline. Do not log request bodies, card
data, signing secrets, authorization headers or full provider errors.

After an outage:

1. Restore connectivity/configuration and check the endpoint's Workbench deliveries.
2. Use the authenticated user's **Refresh billing status** action or
   `POST /api/stripe/reconcile` with `{}` and their normal session. It is scoped to
   that user and repairs current subscriptions, recoverable Checkout claims and
   missed successful regular-cycle credit grants. A supplied user/customer ID
   cannot select another account.
3. Resend failed events in Workbench, or run
   `stripe events resend <event_id> --webhook-endpoint=<endpoint_id>` with securely
   authenticated CLI access to the same environment. Keep the original event ID;
   do not edit payloads or synthesize production invoices.
4. Verify the displayed plan, status, balance, period end and exact-once grant.
   Escalate ambiguous ownership or duplicate subscriptions for human review.

Stripe retries live deliveries for up to three days; sandbox retries are shorter.
Workbench resends cover 15 days and CLI resends 30 days. Manual success does not
cancel scheduled automatic retries; deduplication remains necessary. See
[Stripe delivery behavior](https://docs.stripe.com/webhooks#event-delivery-behaviors).
Reconciliation complements replay; it does not issue refunds or undo charges.

## Isolated verification

Run mocked operational regression checks without Stripe credentials:

```sh
node --test scripts/tests/stripe-sandbox.test.mjs scripts/tests/stripe-webhook-listen.test.mjs scripts/tests/stripe-sandbox-replay.test.mjs
```

Use only the dedicated loopback `sneepcut_integration_test` PostgreSQL database.
`node scripts/stripe-integration-schema.mjs` writes a current migration-chain
fixture to `.cache/tmp/stripe-billing/schema.sql`. Set
`SNEEPCUT_TEST_DATABASE_URL` to that dedicated database and
`SNEEPCUT_TEST_SCHEMA_SQL` to the absolute fixture path. Rebuild the fixture after
any migration changes. From `backend`, run:

```sh
go test ./internal/billing ./internal/migrate ./migrations -count=1 -v
```

Set `GOCACHE` to the shared repository `.cache/go-build`. Each test uses an isolated
schema and synthetic accounts, cleaning up afterwards. A skipped database test is
not a pass. A safe disposable local Postgres container can use
`--rm --tmpfs /var/lib/postgresql/data` with an explicit synthetic DB/password and
a loopback-only port. Never point these checks at persistent development data.
Follow [database/browser verification](frontend-backend-verification.md) for the
app fixture; synthetic browser mutations must use an isolated database.

### Executed verification — 21 October 2026

The final command `node scripts/test-stripe-sandbox.mjs --browser --verify-delivery`
passed with exit 0 in **172.166 seconds**. An earlier complete real-provider run
passed in **878.968 seconds**. Both used the confirmed sandbox, synthetic users
and the isolated `sneepcut_integration_test` database. Synthetic browser accounts
start with 100 fixture credits, separately from the product's 1,000-credit signup
policy. The final run used the repaired cancellation/coverage implementation.

| Case | Executed surface and result |
| --- | --- |
| Successful payment | Real hosted Checkout with `4242…4242`; real Go backend and PostgreSQL reached Creator / 1,600 credits. PASS. |
| Abandoned Checkout | Real hosted session left unpaid; backend stayed Free / 100 credits. PASS. |
| Declined payment | Hosted `4000000000000002`; Free / 100 credits, no paid grant. PASS. |
| Additional authentication | Hosted `4000000000003220`: failed SCA stayed Free / 100; completed SCA reached Creator / 1,600. PASS. |
| Renewal | Real Stripe test-clock advancement; one Creator allocation per successful regular invoice. PASS. |
| Failed renewal and recovery | Real attached failure fixture removed paid access without erasing earned credits; settling the real open invoice restored access and granted once. PASS. |
| Plan change | Real hosted Portal Creator → Pro with no immediate payment/proration; balance stayed 1,600. Separate real-API lifecycle change also passed. |
| Cancellation and expiry | Final hosted Portal cancellation returned `cancelAtPeriodEnd:true`, coverage `2026-11-21T13:36:52Z`, Creator / 1,600 retained. Real test-clock expiry then free access passed in the lifecycle fixture. |
| Genuine webhook interruption | CLI delivered `evt_1USzg4IBapm0ztYVNRikp5U6` to the deliberately paused isolated handler and received HTTP 503. The retrieved genuine event was locally signed and replayed twice; recovery returned 200 and the second response was `duplicate:true`. PASS. |
| Exact-ID duplication and stale event | A genuine retrieved event was locally replayed twice with 200/duplicate responses; PostgreSQL concurrency and source-state checks also passed, including a locally signed stale snapshot after real failed renewal. This does not claim provider-controlled out-of-order delivery. |
| Unauthorized account access | Authenticated Go HTTP/PostgreSQL regressions used two synthetic users and mocked provider responses; foreign Checkout/reconciliation ownership was rejected and the other account stayed unchanged. PASS. |
| App interface | 13 billing unit tests plus the React browser suite with mocked API responses, typecheck and lint passed. Browser checks covered return confirmation/recovery, submission guards, state-preserving Fast Refresh and shared dashboard DOM identity. |

The backend PostgreSQL/regression suite passed **74 tests**, including the focused
race-instrumented rerun. Operational configurator/listener/replay tests passed
**15/15**. The real hosted Portal exposed Stripe's explicit `cancel_at` shape;
the backend was fixed, covered with PostgreSQL/race regressions, and then verified
again through the real Portal on the final source.

Retained evidence under `frontend/test-results/`:

- [Browser scenario results](../frontend/test-results/stripe-browser-results.json).
- [Genuine CLI event/status records](../frontend/test-results/stripe-deliveries.jsonl)
  and [local replay records](../frontend/test-results/stripe-replays.jsonl).
- [Confirmed Checkout](../frontend/test-results/stripe-checkout-confirmed.png),
  [decline](../frontend/test-results/stripe-checkout-declined.png),
  [Portal cancellation](../frontend/test-results/stripe-portal-cancellation.png)
  and [synchronized cancellation](../frontend/test-results/stripe-cancellation-synchronized.png).

The final hosted evidence references Checkout
`cs_test_a1QqKCnKAbNsoZ7BLcbIt3ojEj1KY8v7CzbtYCLrA63VmCKcjKPXN2HPyz`,
invoice `in_1USzhIIBapm0ztYVZiQKbhHp` and subscription
`sub_1USzhKIBapm0ztYVx00XBCKd`. Task-owned synthetic customers, subscriptions and
test clocks were cleaned up after verification; these IDs are historical evidence.

The real-provider run exercised the Go backend and Stripe-hosted Checkout/Portal
through the isolated harness. The React billing interface was verified separately
with mocked APIs; a full React-interface-to-real-backend browser run was **not**
performed. Genuine CLI delivery and local signed recovery were exercised, while
registered public HTTPS delivery, provider-side resend and unattended automatic
retry were **not**. No live environment, real charge or production deployment was
performed. The production endpoint and live activation remain separately authorized
launch steps.

The disposable PostgreSQL container was stopped and auto-removed. The CLI and its
wrapper were intentionally stopped after the final pass, with both PIDs verified
absent. The final cleanup-generated events after the harness closed produced
expected local forwarding errors; they are retained in the delivery log and do not
represent failed billing assertions.
Task scratch was removed after validating its absolute target, and only the
allowlisted Go build cache was cleaned. The final storage check passed:
checkout **5,911.1 MiB**, `.cache` **1,964.5 MiB**, regenerable outputs
**362.3 MiB**, all below their configured budgets. Evidence and the nonsecret
manifest were retained; the local `.env` remains ignored by Git.

For interactive tests use Stripe's published sandbox cards (success `4242…4242`,
decline `4000…0002`), future expiry and synthetic details. Use published
authentication-required fixtures for SCA and `pm_card_chargeCustomerFail` to test
renewal failure after attaching. Prefer payment-method fixtures in API code.
See [Stripe testing](https://docs.stripe.com/testing) and
[subscription simulations](https://docs.stripe.com/billing/testing/test-clocks).
Mocked tests, compilation and simulated signed JSON do not prove hosted Stripe
behavior, actual delivery or account configuration. Record inaccessible scenarios
as blocked/unexecuted, with the missing prerequisite.

Stop disposable containers and remove each task's resolved `.cache/tmp/` directory
after all consumers finish. Preserve manifests and valuable evidence outside it.
Run `node scripts/storage.mjs --check` after generated local artifacts.

## Production activation and rollback

Live deployment, live Stripe changes and real financial operations require
explicit user authorization. Before asking for it, finish local implementation,
isolated checks and the sandbox matrix, and present the resource manifest and
remaining limitations. Then:

1. Confirm live account identity, commercial/tax treatment and exact policy with
   the owner/accountant. The sandbox configurator intentionally cannot write live
   resources. Prepare a separately reviewed live resource inventory and creation
   procedure; test IDs and keys cannot be reused in live mode.
2. Arrange a database backup and review/apply the embedded migration chain through
   the normal deployment process. Provision independent live secrets and explicit
   live account/mode, approved price IDs and Portal configuration.
3. Register the public HTTPS snapshot webhook with the same API version/event
   allowlist. Inject its signing secret. Check proxy routing, signature handling,
   observability and recovery access before enabling paid actions.
4. After authorized deployment, check health and billing availability, then perform
   only the real transaction checks explicitly authorized by the owner. Monitor
   failed deliveries and subscription/account divergence throughout rollout.

A code rollback does **not** cancel Stripe subscriptions, refund payments, revert
Portal/product configuration or delete emitted events. Never roll database schema
back over processed financial state. Disable new purchases when necessary, retain
the event/grant ledger and keep a compatible receiver/reconciliation path while
investigating. Resolve refunds/cancellations individually under separate explicit
authorization; do not bulk-delete customers or recreate subscriptions to recover.
