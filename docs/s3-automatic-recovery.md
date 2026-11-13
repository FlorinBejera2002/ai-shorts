# S3 automatic recovery

## Plan and invariants

1. Retry temporary network failures, timeouts, HTTP 408/429 and HTTP
   500/502/503/504 in Studio. Limit attempts, use exponential jitter and respect
   a single operation deadline. Do not retry authorization errors or malformed
   data. Return a clear service-unavailable error when recovery is exhausted.
2. Keep every conditional PUT's original precondition. After an uncertain
   response, read back the object and accept success only when its complete
   payload matches the attempted write. Studio project heads already contain a
   fresh, unique revision ID, and manifests have unique keys; immutable blobs
   are addressed by their content hash. A different revision remains a conflict.
3. Recover interrupted streamed reads only against the original ETag, checking
   the resumed range so bytes from different revisions cannot be combined.
4. Preserve the Go SDK's bounded retries. Give each media upload a random
   operation ID in object metadata. After an uncertain failure or an SDK retry's
   412, acknowledge it only if HEAD confirms that exact operation ID and size.
   A pre-existing object, even with identical bytes, remains a conflict.
5. Exercise temporary failures, lost acknowledgements, response-body failures,
   competing writers, permanent failures and exhausted deadlines with local
   fault injection. Repeat the existing private SeaweedFS contracts.

No retry obtains a newer ETag and uses it to overwrite another writer. No retry
changes bucket settings, weakens conditional-write enforcement, or requires a
database migration. Recovery handles temporary failures within its budget;
provider outages and sustained multi-user capacity require separate verification.

## Implemented behavior

Studio allows up to three attempts and 120 seconds for an object operation,
including backoff, response bodies and reconciliation. Small requests have a
30-second attempt timeout; file uploads and streamed downloads retain the full
remaining transfer allowance. Backoff uses jitter starting at 250 ms, capped at
2 seconds. A provider's longer `Retry-After` is respected; if it exceeds the
remaining budget, recovery stops immediately. A paginated listing shares one
deadline and gives each page its own attempt limit. Bun's native listing cannot
be cancelled: its caller stops waiting at the deadline and ignores late results.

Metadata reads restart after an interrupted body. File reads resume from the
last delivered offset with `Range` and `If-Match`; the ETag and complete
`Content-Range` must match the original object. Existing project restoration
still verifies each complete file's SHA-256 against its immutable manifest.
Cancelling a consumer aborts its network read without starting recovery.

Conditional Studio writes retain their original `If-Match` or `If-None-Match`
on every attempt. After a temporary failure or missing acknowledgement ETag,
reconciliation hashes the complete stored payload and compares it with the
attempted payload. A direct 409/412 remains a conflict. A 409/412 after an
uncertain attempt is accepted only if that payload matches, including the unique
project revision. A different revision is never overwritten automatically.

Go uploads use the existing SDK retry policy (three attempts) within a ten-minute
operation deadline or the caller's earlier deadline. Each invocation stores a
random `sneepcut-write-id` as object metadata. Reconciliation uses HEAD to verify
that identity and the full expected size. Matching an existing object's bytes
alone does not acknowledge a different upload. Denied and cancelled operations
do not start reconciliation. No additional SDK retry layer was added.

If recovery cannot establish success before its budget expires, the operation
still fails. Studio reports service unavailable; genuine conflicts remain 409.
This is request-level recovery, without a durable background upload queue or
automatic replay of old edits after a process restart. Bucket configuration,
storage layout and database schema are unchanged.

## Verification

- Studio fault-injection tests: transient HTTP failures, lost write responses,
  uncommitted retries, competing revisions, exhausted attempts, provider delay,
  metadata interruption, safe range resume, cancellation and native pagination.
- A complete project save with a lost head acknowledgement restores correctly
  on an independent store instance.
- Go tests use the real SDK to reproduce a committed upload returning 503,
  followed by a retry returning 412. Wrong identities, sizes, denied operations
  and unrecoverable errors fail closed.
- `make test-s3` includes a real private SeaweedFS upload with an intentionally
  hidden acknowledgement, verifies its metadata-based recovery, and confirms
  that another upload of identical bytes still conflicts. The existing media
  contract retains its 1003-object pagination and concurrent-create assertions.
- `make test-studio-s3` checks migration, saves, rendering, independent servers,
  ownership fences and recovery after removal of the working cache.

The fault tests are synthetic. They do not establish Hetzner availability or
multi-user capacity, and no new remote-provider load test is part of this change.

Verified on 2026-11-13: 26 affected Studio unit tests, three Studio SeaweedFS
integration tests, the Go media unit suite, the Go SDK recovery race test,
`go vet ./...`, Studio type checking, changed TypeScript lint/format checks,
and both Go SeaweedFS tests (including acknowledgement-loss injection) passed.
Local Studio was restarted with the final code and returned HTTP 200 from
`/health`.

Protocol references: [S3 conditional writes](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html),
[Go SDK retries](https://docs.aws.amazon.com/sdk-for-go/v2/developer-guide/configure-retries-timeouts.html),
[Bun S3 API](https://bun.sh/docs/runtime/s3).
