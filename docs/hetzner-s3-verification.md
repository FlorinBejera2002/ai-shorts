# Hetzner S3 verification

Verified on 2026-11-09 and repeated on 2026-11-13 against the existing private `sneepcut-test` bucket at
`https://hel1.your-objectstorage.com`, region `hel1`. No bucket was provisioned,
no bucket settings changed, and no application was switched to remote storage.
Development continues to use SeaweedFS. Credentials and signed URLs are excluded
from this report and Git.

## Result

The APIs used by the Go media adapter and Bun Studio state store work with this
bucket after the ETag fix described below. Four full repetitions on November 9
failed with provider errors. On November 13, all three ordinary-workload runs
and both full server runs passed, including 15 video transfers, with no traced
5xx responses or SDK retries. Some bulk requests still had long response times;
the earlier failures' cause and SaaS capacity remain unresolved. CORS is unset; configure actual app
origins if direct browser fetch/canvas access is used. Server requests and plain
video-element playback do not require bucket CORS.

The table below records the original November 9 functional checks. The dated
repeats later in this report record subsequent results and their limits.

| Check | Observed result |
| --- | --- |
| Bucket access, location, private ACL, versioning | Accessible in `hel1`, no public ACL grants, versioning never enabled |
| Go SDK upload, metadata, signed GET, byte ranges, Unicode/space keys | Passed; unsigned object reads denied |
| Concurrent conditional creates | Passed: exactly one of four writers accepted |
| Migration retry and original preservation | Passed |
| 1003-object listing/deletion and neighboring prefix preservation | Passed once; other runs failed during upload, so repeated full verification did not pass |
| Native Chrome private MP4 playback | Passed, decoded 160 × 90 H.264 fixture; no browser CORS attribute used |
| Worker container FFprobe read of private HTTPS URL | Passed; H.264, 160 × 90 |
| Studio conditional update and stale-write rejection | Passed after ETag normalization |
| Go-signed media import through actual Studio importer | Passed; API bearer credentials were not forwarded to storage |
| Sandboxed Chromium thumbnail and FFmpeg MP4 render | Passed against remote state storage |
| Recovery after removing the entire synthetic working cache | Passed; project HTML, source media and export matched original hashes; recovered project rendered a thumbnail |
| Saves from independent Studio store instances | Passed: one accepted, competing stale save rejected |
| Cleanup | Completed, including the delayed first-run fixture; known test prefixes checked empty |

## Compatibility fix

Hetzner returned quoted ETags but rejected those quotes in `If-Match` on PUT:
the current revision incorrectly returned HTTP 412. Sending the same opaque
value without the enclosing quotes succeeded, while an obsolete value still
returned 412. `S3StateObjects.put` now normalizes only those enclosing quotes;
revision comparison and conflict checks remain in place.

The regression test exercises a strict S3 endpoint with quoted response ETags.
The existing local SeaweedFS integration suite also passed (three tests,
35 assertions), covering persistence, composition publication, migration,
ownership fences and recovery. Affected Studio unit tests passed (12 tests),
as did Studio type checking, changed-file lint/format checks, Go media tests
and `go vet ./...`. The same full Go media contract, including 1003-object
pagination and deletion, also passed against local SeaweedFS.

## Reliability observations

The first bulk run exceeded its 90-second operation deadline. A synthetic
38-byte object appeared after that timeout. Repeated GET/DELETE requests for
that object timed out, and a null-version DELETE returned HTTP 504. Deletion
eventually completed; subsequent listing confirmed the prefix was empty.

With a four-minute operation deadline, another run completed the bulk case in
about 71 seconds. A subsequent repeat failed after about 177 seconds with
`PreconditionFailed` on a previously unused random-prefix key. A request may
have committed before an SDK retry; that cause has not been established.
Do not treat this failure as proof of data corruption or a confirmed key
collision. It does demonstrate ambiguous outcomes and variable latency that
need investigation before production cutover.

Focused media/Studio runs passed with the bulk case explicitly skipped. The
final run, including worker-container FFprobe access, passed in about 31 seconds.
It does not replace a successful full repeat.
Hetzner's [general FAQ](https://docs.hetzner.com/storage/object-storage/faq/general/)
describes shared-cluster timeout risks. These tests establish functional API
behavior, not sustained throughput, multi-user capacity or provider availability.

Provider diagnostic references from the earlier runs (those objects were removed):

- Unexpected conditional-create 412 request ID:
  `tx00000a2e4861c06b1cc5e-006af1c0a9-2697cbec-hel1-prod1-ceph4`.
- First-run batch-delete response whose body exceeded the cleanup deadline:
  `tx00000cbb77dc5c869cd09-006af1be94-268f481a-hel1-prod1-ceph4`.

### Instrumented repeat, 2026-11-09

Four full repetitions ran from approximately 14:00–14:18 UTC: two on the local
machine and two as isolated Go test executables over the existing `sc` SSH
connection. No deployed application or database was started or modified.

Each run retained the original 1003-object, eight-writer pagination contract
(38-byte fixtures). It also transferred a real 17,853,374-byte H.264 MP4 once
sequentially and twice concurrently, checking full SHA-256 and exact byte ranges.
These workloads answer different questions: the tiny objects expose request-rate
and pagination behavior; three videos do not establish SaaS capacity.

| Run | Full contract | Verified video transfers | Traced HTTP 503 / 504 responses |
| --- | --- | --- | --- |
| Local 1 | Failed during deletion; cleanup also failed | 0/3; GET/upload 503s | 20 / 0 |
| Local 2 | Failed during migration, metadata, conditional writes and bulk upload | 1/3; other transfers hit 503s | 804 / 0 |
| Server 1 | Failed during signed read/bulk upload; cleanup body timed out | 3/3 | 339 / 2 |
| Server 2 | Failed during bulk upload; cleanup listing returned 504 | 3/3 | 0 / 10 |

The first three runs performed the contract before the video test. Server 2
waited 60 seconds without test-bucket requests, then ran the videos **before**
the bulk contract. Its three video checks passed in 37.44 seconds; server 1's
passed in 27.78 seconds. Across those six verified transfers, individual uploads
took 10.2–15.2 seconds and full downloads took 0.49–4.79 seconds. The full contract
still failed on both server runs in approximately five minutes, including the
one-minute cleanup deadline. The same bulk contract passed against local
SeaweedFS in 1.57 seconds for the entire suite.

The counts above are traced HTTP attempts, including SDK retries, not failed
operations or an application error rate. Three additional attempts ended without
HTTP headers; one HTTP 200 cleanup response timed out while reading its body.
The contract's standalone signed-read client is not traced; its reported 503
is visible in `run.log`. Expected 412 responses from losing conditional writers
are retained separately from 5xx failures.

Peak traced request starts in any sliding one-second window were 57, 62, 47 and
37 respectively. These runners were below the
[published 750 requests/second limits](https://docs.hetzner.com/storage/object-storage/overview/)
per source IP and bucket. This measurement excludes unrelated clients and does
not measure shared backend load or establish the cause of throttling.

One server conditional PUT also illustrates an ambiguous retry outcome:
`.../objects/bulk/0317.mp4` received a 504 on SDK attempt 2 and a 412 on attempt 3
under invocation `fccbf26a-1636-414c-b4de-d0cb15ee8aa4`. That is consistent with an
earlier request committing before its acknowledgement, but does not prove which
attempt committed. It remains a failure; the test does not convert it into
success or overwrite the object. The later 412 request ID is
`tx00000c46e871357151e77-006af1d3e3-26ad6f94-hel1-prod1-ceph4`.

Additional provider references:

- 14:01:29 UTC, local listing, HTTP 503:
  `tx00000e92e8ac038781cd1-006af1d239-26ad6f94-hel1-prod1-ceph4`.
- 14:06:07 UTC, server bulk PUT, HTTP 503:
  `tx000009ea2f972c0c46281-006af1d34f-2697cbec-hel1-prod1-ceph4`.
- 14:13:38 UTC, server PUT to
  `sneepcut-contract/9642ad979bd63e518b3b989ad24986cf/objects/bulk/0622.mp4`,
  HTTP 504 after 60.037 seconds; the gateway supplied no request ID.

The first two local test logs used the old generic checksum failure text when a
signed GET returned 503. Their wire traces show error responses, not successful
video responses with corrupted bytes. The test now checks status before hashing
and reports HTTP errors separately. Every completed successful hash check matched.

Native browser, worker and Studio checks were **not reached in these four runs**:
the full contract failed before publishing their fixture. Their earlier passes
in the result table remain historical evidence, not new passes. No contract
assertion, concurrency limit or individual operation deadline was relaxed. The
overall Go suite timeout increased to accommodate the additional video cases.

At verification time, Hetzner's [status page](https://status.hetzner.com/) listed
no new incident for November 9. Its [FSN1 storage incident](https://status.hetzner.com/incident/c3426c77-cb55-4eb0-ac85-315fc53efe1b)
was resolved on November 6 and concerns a different region. Ongoing
[core-router maintenance](https://status.hetzner.com/incident/cd31dd45-f431-4639-8f9a-d4bfb5353f30)
warns of possible latency, but does not establish the cause of these HEL1 errors.
The observed `SlowDown` responses confirm service-side throttling responses;
whether they reflect a bucket limit, shared backend load or an incident needs
provider investigation. This is not evidence that Hetzner is universally
unsuitable for video storage, and it is not production reliability approval.

Sanitized wire traces, retry summaries and full logs are retained locally in
`artifacts/hetzner-retest-20261109T135951Z/{local-1,local-2,server-1,server-2}/`.
This ignored report directory contains no credentials or signed URLs. The first
server's IP-discovery response was HTML; it is not a valid source IP and must not
be supplied to support as one. The second run validates that metadata field.

Recovery cleanup completed at 14:32:42 UTC. It removed 1,961 residual synthetic
objects using paced 25-key batches under only the eight exact roots created by
these repetitions. All eight roots were confirmed empty, followed by a delayed
listing check confirming zero objects in all three synthetic namespaces. That
recovery does not turn the original cleanup/test failures into passes. The audit
and request timings are in `cleanup-recovery.json` in the report directory.
Temporary test bundles and credential files were removed on both machines.

Before production, resolve the observed failures with the provider or test an
alternative location/provider, then repeat the full check and a representative
workload. Define CORS, retention/orphan cleanup, independent backups and
multi-replica Studio job routing/cancellation before cutover. Timeouts must be
handled as potentially committed writes; do not remove conditional checks or
silently overwrite a competing revision to hide them.

### Ordinary-first repeat, 2026-11-13

Tests ran approximately 10:54–11:08 UTC against the same existing bucket. All
three ordinary runs completed before any bulk traffic was introduced. The two
local runs exercised Go storage, native Chrome playback, worker FFprobe, Studio
conditional writes, import, rendering, cache-loss recovery and competing saves.
The server's ordinary mode exercised the Go cases and representative transfers.

| Run | Ordinary workflow | Verified 17,853,374-byte videos | Original bulk contract |
| --- | --- | --- | --- |
| Local ordinary 1 | Passed, including Studio/browser/worker | 3/3 | Explicitly skipped |
| Server ordinary 1 | Passed | 3/3 | Explicitly skipped |
| Local ordinary 2 | Passed, including Studio/browser/worker | 3/3 | Explicitly skipped |
| Server full 1 | Passed | 3/3 | Passed in 107.87 seconds |
| Server full 2 | Passed | 3/3 | Passed in 105.65 seconds |

Across 2,183 traced HTTP attempts there were zero 5xx responses, SDK retries,
transport errors or body-read errors. Expected 404 and conditional-write 412
responses remained part of the tests. The full contract retained eight writers,
1003 tiny objects, all pagination/neighbor assertions and its original deadlines.
No application retry or timeout behavior was changed to obtain these passes.

There are still latency concerns worth asking the provider to inspect:

- At 11:02:18.689 UTC, a 38-byte PUT to
  `sneepcut-contract/a084a717a7f47f56a03cc819e4eb3ba5/objects/bulk/0442.mp4`
  returned HTTP 200 after 27.918 seconds. Request ID:
  `tx00000d2021678c61dd1e1-006af6ee3a-273c335e-hel1-prod1-ceph4`.
- At 11:06:32.709 UTC, a batch-delete request returned HTTP 200 headers after
  117 ms, but its complete response body took 50.539 seconds. Request ID:
  `tx00000cc6f94073103c135-006af6ef38-27436e29-hel1-prod1-ceph4`.

These are client-observed times, not measurements of provider execution time.
Today's passes do not identify why November 9 failed or establish sustained
multi-user capacity. They support continuing with the existing bucket for
staging while provider health and application failure recovery are addressed.

The immediate account-side action is to submit the
[prepared support request](https://app.notion.com/p/417c7071a1988190827ad07482b13b39)
through Hetzner Console, adding the bucket ID from the bucket page URL. Ask
Hetzner to check the older 503/504 IDs, the two fresh slow requests above,
bucket/cluster health and applicable limits. Their
[support instructions](https://docs.hetzner.com/storage/object-storage/faq/general/)
specify the bucket ID rather than its name. The draft includes current server
IPv4 and UTC timestamps. No additional bucket or settings change is needed for
that investigation. Return the reply before deciding on a different provider.

Before production cutover, the next engineering work is bounded transient-error
recovery with safe reconciliation of writes whose response was lost, plus a
representative concurrent Studio/media workload check. Genuine revision conflicts
must still be rejected. This work is separate from the successful smoke tests.

Reports are retained in `artifacts/hetzner-recheck-20261113T105437Z/`, including
`combined-summary.json`, per-run wire traces/logs, validated public-IP metadata
and cleanup audits. All 14 exact test roots were already empty after their
normal cleanup; final and delayed audits confirmed all three namespaces empty.

### Application recovery, 2026-11-13

The request-level recovery work listed above is now implemented; see
[S3 automatic recovery](s3-automatic-recovery.md) for the plan, retry budgets,
write reconciliation, regression coverage and limitations. Fault-injection and
private local SeaweedFS checks passed. This does not constitute a new Hetzner
load test or resolve the provider latency and production-capacity questions.
No recovery deletions were needed. Temporary files/credentials were removed on
both machines, and the retained reports were checked for credential/signed-URL
leaks. The support request has not been sent.

## Repeat safely

Prerequisites: Go, FFmpeg, Docker Compose and the built local Studio/worker images
(`docker compose -f docker-compose.yml -f docker-compose.dev.yml build studio worker`).
The normal app and database do not need to be running. The runner starts a
disposable Studio container with synthetic projects and uses the actual Go and
Bun clients.

Supply a private JSON file through stdin, outside version control:

```json
{
  "endpoint": "https://hel1.your-objectstorage.com",
  "region": "hel1",
  "bucket": "your-private-bucket",
  "confirm_bucket": "your-private-bucket",
  "access_key": "YOUR_ACCESS_KEY",
  "secret_key": "YOUR_SECRET_KEY"
}
```

```sh
node scripts/test-hetzner-s3.mjs < /path/to/private-credentials.json
```

Set `PLAYWRIGHT_MODULE` to an installed Playwright entry point to include native
Chrome playback; otherwise that check is explicitly skipped. Chrome must also
be installed. `--skip-bulk` is an explicit troubleshooting option for focused
media/Studio checks and is always reported as a skip.

The supplied bucket must already exist, be private and never have enabled
versioning. The runner confirms its endpoint, bucket opt-in and versioning,
but does not change ACL, CORS or any other bucket setting. Verify bucket privacy
before running it. All object mutations stay under new random
`sneepcut-contract/`, `sneepcut-verification/` and `sneepcut-video-check/`
subdirectories. Cleanup runs
on exit and logs the contract prefix for manual recovery if requests fail.
Local scratch files live under `.cache/tmp/` and are removed in `finally`.
The ordinary local S3 test runners retain their loopback-only guards.

### Representative transfers and diagnostics

The runner also generates a real 640 × 360 H.264 MP4 of approximately 17 MiB.
It uploads/downloads it once sequentially and then twice concurrently. Each
transfer checks metadata size, the complete SHA-256 digest and a byte range
inside the file. The original tiny-object concurrency/pagination assertions
remain unchanged; successful video transfers do not mask a failing bulk case.

Request diagnostics record SDK attempt counters, invocation IDs, provider
request IDs, status, timing and response-body errors. They exclude authorization
headers, query strings, signed URLs and payload contents. An eventual successful
retry retains the failed attempt in the trace. Sanitized reports are saved under
`artifacts/hetzner-retest/` by default; `SNEEPCUT_HETZNER_REPORT_DIR` selects a
different report directory. These are diagnostic artifacts, not credentials.

For a focused video-transfer test, use `--transfers-only`; it deliberately does
not claim a full media/Studio pass. To run the Go media contract and representative
transfers from an explicitly authorized SSH server:

```sh
node scripts/test-hetzner-s3-server.mjs sc < /path/to/private-credentials.json
```

To measure ordinary operations before any bulk traffic, pass `--skip-bulk`
to either runner. The server reports `mode: ordinary-only`; this still checks
the three video transfers, migration, private reads and conditional creates,
but excludes the 1003-object pagination case. The local runner also checks
Studio save/render/recovery and worker access, plus Chrome when enabled:

```sh
node scripts/test-hetzner-s3.mjs --skip-bulk < /path/to/private-credentials.json
node scripts/test-hetzner-s3-server.mjs sc --skip-bulk < /path/to/private-credentials.json
```

Use fresh report directories for each repetition. Complete these ordinary
checks before running the full contract so earlier bulk traffic cannot be
mistaken for an ordinary-workload baseline. Both the Go fixture and Studio
runner log their exact synthetic prefixes for cleanup diagnostics.

This compiles an isolated Linux test executable and streams it with the
synthetic video and temporary credentials over SSH. The server runs no app or
database processes. Its temporary directory is private and removed by a trap;
application configuration and deployed binaries are untouched. The SSH target
must already have a trusted host key and Python 3. The local runner additionally
checks native browser playback, the worker and Studio rendering/recovery.

## Versioning

Versioning helps recover overwritten or deleted objects, but Hetzner's
[supported actions](https://docs.hetzner.com/storage/object-storage/supported-actions/)
exclude conditional PUT/DELETE on versioned buckets. Keep the active bucket
unversioned with the current concurrency protocol. Application revision keys
already preserve project history; they are not an independent backup against
account deletion or accidental prefix removal.

Versioning on a separate backup destination can provide another recovery layer.
Enabling it on the active bucket requires changing how concurrent writes are
coordinated or selecting a provider that supports both features. No versioning
or backup configuration was changed by this verification.
