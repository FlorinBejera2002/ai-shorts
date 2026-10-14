# Unapplied upload allowance alternative — not selected

The user explicitly chose **Keep current hourly allowance** on 14 October 2026 after reviewing this proposal. Do not apply it as part of this task. The project cap remains 200.

Historical proposal, unapplied: this superseded the earlier proposal to remove hourly counters. The user's clarified product rule is 200 clips per project, implemented separately with legacy compatibility.

Automatic approval review rejected this revised patch because 400 hourly requests for all accounts exceeds the precise project-scoped 200-clip authorization. The subsequent user decision retains the current policy. Live transfers and asset registrations remain 60/hour, authorization 120/hour.

The proposed finite allowance is 400 requests/hour for upload authorization, transfer, and source registration (200 clips plus one retry per file). Redis rate protection, fail-closed availability, authentication, ownership, scanner, signed token nonces, size/storage/duration protections all remain. Transfer work adds process-local 8 global / 2 account active limits; source inspection stays 2/process with recoverable backpressure. Other rates are unchanged. On multiple replicas, active limits apply per replica; Redis hourly counters are shared.

The live queue honors accurate Retry-After, retries temporary backpressure without a retry-count cutoff, and supports cancellation. This avoids losing completed uploads but does not make a rapid 200-clip API run pass the live hourly policy. Proposed tests are included in the patch, have not run against an applied patch, and are not acceptance evidence. Existing worklimit unit tests have passed.
