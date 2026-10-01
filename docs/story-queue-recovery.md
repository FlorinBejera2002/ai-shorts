# Story queue recovery

On 2026-09-30 the local API, database and frontend were running, but no worker
container existed. The pending Story had zero executions and zero AI calls;
the processing UI correctly displayed Queued.

The current worker image was built and a one-shot worker was started with
`--story-id` for the selected project. The project changed from pending to
analyzing with one execution. The older ordinary video job remained pending
with its original timestamp. The one-shot worker exits after the selected Story;
it does not provide continuous processing for future requests.

## Verification

- Worker image build passed `go test -race ./...` and `go vet ./...`.
- Dedicated PostgreSQL integration tests verified exact Story selection,
  unchanged unrelated queues, no fallback for unavailable targets, exclusive
  claims under concurrency, failure finalization, and default worker behavior.
- CLI tests reject invalid, empty and ambiguous selectors before database access.
- Health-check Bash recipes passed 13 mocked scenarios; native Make was not
  installed on the Windows host.
- Live verification confirmed the selected Story entered analysis and its local
  Whisper process was running. This verifies queue recovery, not the quality or
  completion of the resulting video.

See the README for normal worker startup and scoped one-shot commands. Starting
the normal worker processes all eligible queued jobs; use the scoped command
when only one Story is authorized.
