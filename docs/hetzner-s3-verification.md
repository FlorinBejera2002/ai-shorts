# Hetzner S3 verification

Verified on 2026-11-09 against the existing private `sneepcut-test` bucket at
`https://hel1.your-objectstorage.com`, region `hel1`. No bucket was provisioned,
no bucket settings changed, and no application was switched to remote storage.
Development continues to use SeaweedFS. Credentials and signed URLs are excluded
from this report and Git.

## Result

The APIs used by the Go media adapter and Bun Studio state store work with this
bucket after the ETag fix described below. This is **not production reliability
approval**: the bulk workload was inconsistent across repeated runs. CORS is
also unset and must be configured for actual app origins before browser
fetch/canvas access is enabled.

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

Provider diagnostic references (all test objects have since been removed):

- Unexpected conditional-create 412 request ID:
  `tx00000a2e4861c06b1cc5e-006af1c0a9-2697cbec-hel1-prod1-ceph4`.
- First-run batch-delete response whose body exceeded the cleanup deadline:
  `tx00000cbb77dc5c869cd09-006af1be94-268f481a-hel1-prod1-ceph4`.

Before production, resolve the observed failures with the provider or test an
alternative location/provider, then repeat the full check and a representative
workload. Define CORS, retention/orphan cleanup, independent backups and
multi-replica Studio job routing/cancellation before cutover. Timeouts must be
handled as potentially committed writes; do not remove conditional checks or
silently overwrite a competing revision to hide them.

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
`sneepcut-contract/` and `sneepcut-verification/` subdirectories. Cleanup runs
on exit and logs the contract prefix for manual recovery if requests fail.
Local scratch files live under `.cache/tmp/` and are removed in `finally`.
The ordinary local S3 test runners retain their loopback-only guards.

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
