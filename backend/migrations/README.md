# Database migrations

The Go migrator embeds the ordered PostgreSQL SQL history in this directory. `migrations.go` reads and validates the revision chain; `backend/internal/migrate` applies it transactionally under a migration lock. Revision identifiers preserve the previous schema history.

The executable is `backend/cmd/migrate`. Compose runs it through the `migrate` service before starting the application. `make migrate` applies pending SQL to the configured database; `DIRECT_URL` takes precedence over `DATABASE_URL`.

Preserve the UUID schema and existing revision chain. Never apply example schemas to persistent databases. Verify changes with the dedicated `sneepcut_integration_test` database and isolated schemas; see [database verification](../../docs/frontend-backend-verification.md#database-fixtures). Back up user data before an authorized deployment or migration.
