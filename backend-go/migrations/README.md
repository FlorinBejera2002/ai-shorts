# Database migrations

This directory is reserved for Sneepcut's Go-era migrations once schema ownership
is agreed. It intentionally contains no executable SQL.

The example's integer-ID users/activation-token schema is not the current
Sneepcut UUID schema. Do not copy or apply it to the existing database.
For now, [Alembic](../../backend/alembic/versions/) owns schema changes.
See [migration Step 1](../../docs/go-migration/backend-go-migration.md).
