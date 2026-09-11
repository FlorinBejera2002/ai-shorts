# Signup credits and existing-account bonus

Requested policy: new accounts start with **1,000 credits**. Accounts existing at
the recorded cutoff receive a one-time **1,000-credit additive bonus**. Existing
balances and paid subscription allocations are preserved.

## Signup behavior

`DEFAULT_FREE_CREDITS` defaults to `1000`. Both email registration and Google
account creation use this setting. Explicit configuration overrides, including
zero, remain supported. Repeat registration or Google sign-in never restores a
spent balance. The legacy Python/ORM and Prisma defaults and the English and
Romanian signup/pricing copy use the same initial allocation.

Production has an explicit environment override, so its value must also be
updated when changing this policy. A code-only fallback change would leave the
previous live allocation in place.

## Existing-account grant

Migration `20260911_0006` adds a batch and recipient audit. The administrative
script previews by default. Applying it locks the batch, adds to each eligible
user's current balance, records before/after balances, and commits all changes
together. Reusing the same batch key cannot award the bonus twice; changing its
amount or cutoff is rejected. Accounts created after the cutoff are excluded.

Run from `backend` with the intended database configured:

```sh
python scripts/grant_existing_user_credits.py \
  --batch-key existing-users-20260911-3d8c7071a1988106 \
  --amount 1000 \
  --cutoff 2026-09-11T16:15:41.130482+00:00
```

The same command with `--apply` performs the grant. Always reuse this batch key
for retries. Do not substitute a new key to retry an uncertain result.

Initial live preview: **5 accounts, 360 credits total**. Expected addition:
**5,000 credits**, yielding **5,360 total** if there is no intervening spending.
Backup: `/opt/sneepcut-backups/signup-credits-20260911/before-grant.dump` on the
production host, with its restore catalog verified before deployment.

Applied audit data intentionally prevents downgrading the grant migration;
application rollback can keep these additive tables without altering balances.

## Verification

- Go configuration tests cover default 1,000, explicit zero/custom allocations,
  and invalid values.
- Real PostgreSQL identity tests cover email and Google creation, duplicate
  registration, and repeat Google login with a spent balance.
- Go config and identity packages and `go vet ./...` passed against disposable
  infrastructure using `sneepcut_integration_test`.
- Python settings and actual SQLAlchemy inserts verified default 1,000 and
  explicit zero.
- Frontend auth client tests: 9 passed; production deployment tests: 6 passed.
- Credit-grant PostgreSQL tests: 17 passed, including concurrent retries,
  concurrent spending, inclusive cutoff, full rollback after failure, batch
  parameter mismatch, empty cohorts, and migration round trips. All used
  disposable `sneepcut_integration_test` infrastructure, which was removed.

## Production result

Backend release `804bfc06efa92f08` activated the explicit 1,000-credit setting and
migrated the audit tables. All deployment checks passed. The grant applied to
all 5 eligible accounts: exactly 1,000 each, 5,000 in total, taking the aggregate
balance from 360 to 5,360. Retrying the same command returned `already_applied`
and left balances unchanged. The authenticated dashboard showed 1,010 credits
for the account that previously had 10.

Browser verification found a separate `INITIAL_FREE_CREDITS` constant used by
the pricing cards and dashboard billing view. It was also updated to 1,000;
the six existing billing validation tests passed. This keeps those calculated
labels consistent with the translated signup text and actual account balances.

Production rollout and grant execution are recorded in the Notion task
`3d8c7071-a198-8106-91a6-e1e5c280e438`; server-side preview, applied result and
aggregate verification are retained alongside the database backup.
