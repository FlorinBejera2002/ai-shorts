# Edit recovery and deletion safety (CF058)

Trim/recut reservation and its one-hour deadline are persisted with the job's
active-edit counter. The worker atomically exchanges the reservation for a new
execution token, preventing duplicate deliveries from executing the same edit.
Publication locks the job and checks the current token and deadline. Finally
handlers can clear only their own reservation, not a successor's. Each execution
uses an isolated workspace, removed on exit even with object storage configured.

The dispatcher releases expired edit reservations without charging or refunding
credits. An interrupted edit is abandoned, not automatically replayed against a
possibly changed clip. The previous clip remains usable; the user may retry the
edit. This also handles API death between reservation and queue publication.
The maximum blocking interval is one hour plus the dispatcher's polling delay;
the Celery hard execution limit is 35 minutes. The dispatcher must be running.

Database migration: 20260904_0003. Drain old workers before applying the migration
and deploying fenced workers. Legacy reservations have no token/deadline and are
not cleared blindly; reconcile them after confirming their old processes stopped.
Do not roll back to unfenced workers while new edit executions remain active.
Clocks across API/workers/dispatcher must be synchronized.

PostgreSQL tests cover duplicate claims, stale finalizers, stale publication,
expired reservation release, and a worker subprocess exiting abruptly after its
claim. Existing clip/account storage-deletion tests cover retryable cleanup,
ownership and local/object-storage prefix boundaries. Production deployment and
destructive tests against user media were not performed.
