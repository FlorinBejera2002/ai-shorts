# Sneepcut operational identifier migration

Public product copy, source defaults, and new infrastructure identifiers use
**Sneepcut**. Existing deployments may still have historical database,
object-storage, or queue resources under a previous name. Those live values
must not be renamed in place without a controlled migration.

## Existing installations

Keep the current PostgreSQL database/user, bucket names, and Celery task names
while an installation is live. Renaming them only in application configuration
can disconnect the application from stored data or leave queued tasks unable to
resolve their registered worker function.

Before changing an identifier:

1. Back up the database and object storage and record the deployed environment.
2. Drain workers and queues; do not rename a Celery task while old messages are
   pending.
3. Create the new database role/database or storage bucket alongside the old
   resource and copy data with a verified item/row count.
4. Update secrets and configuration in a maintenance window, run migrations,
   and verify read/write access plus signed media delivery.
5. Deploy workers and web/API processes together, perform a smoke test, then
   retain the old resource for the agreed rollback window.
6. Remove the old resource only after backups and rollback criteria have been
   verified.

## New installations

Use `sneepcut`-prefixed database roles, databases, buckets, queues, and task
names when provisioning a new environment. Set every value explicitly in the
environment rather than relying on source-code defaults. The deployment guide
is the canonical inventory of required runtime values.

The repository defaults now use `sneepcut` for the PostgreSQL database and
role, and `sneepcut-media` / `sneepcut-public` for object-storage buckets.
Existing installations must keep their historical values explicitly in the
deployment environment until the controlled migration above is complete.

This staged approach keeps the rebrand complete in the user experience without
risking data loss or breaking in-flight work.
