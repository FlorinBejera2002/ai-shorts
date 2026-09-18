// Package migrate applies the embedded schema in one atomic transaction.
package migrate

import (
	"context"
	"database/sql"
	"fmt"

	"sneepcut/backend-go/migrations"
)

// Up preserves alembic_version as the canonical revision marker. The advisory
// transaction lock serializes Go migrators, including on an empty database.
// Do not run the retired Alembic migrator concurrently during cutover.
func Up(ctx context.Context, db *sql.DB) (string, error) {
	chain, err := migrations.All()
	if err != nil { return "", err }
	return apply(ctx, db, chain)
}

func apply(ctx context.Context, db *sql.DB, chain []migrations.Migration) (string, error) {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil { return "", err }
	defer tx.Rollback()
	if _, err = tx.ExecContext(ctx, "SELECT pg_advisory_xact_lock(7364338762401)"); err != nil { return "", fmt.Errorf("lock migrations: %w", err) }
	if _, err = tx.ExecContext(ctx, "CREATE TABLE IF NOT EXISTS alembic_version (version_num VARCHAR(32) NOT NULL PRIMARY KEY)"); err != nil { return "", err }
	rows, err := tx.QueryContext(ctx, "SELECT version_num FROM alembic_version FOR UPDATE")
	if err != nil { return "", err }
	var versions []string
	for rows.Next() {
		var version string
		if err = rows.Scan(&version); err != nil { rows.Close(); return "", err }
		versions = append(versions, version)
	}
	err = rows.Err()
	rows.Close()
	if err != nil { return "", err }
	if len(versions) > 1 { return "", fmt.Errorf("multiple database revisions are unsupported") }
	start := 0
	if len(versions) == 1 {
		start = -1
		for i, migration := range chain { if migration.Revision == versions[0] { start = i+1; break } }
		if start < 0 { return "", fmt.Errorf("unknown database revision %q; refusing migration", versions[0]) }
	}
	for _, migration := range chain[start:] {
		if _, err = tx.ExecContext(ctx, migration.SQL); err != nil { return "", fmt.Errorf("migration %s: %w", migration.Revision, err) }
		if _, err = tx.ExecContext(ctx, "DELETE FROM alembic_version"); err != nil { return "", err }
		if _, err = tx.ExecContext(ctx, "INSERT INTO alembic_version (version_num) VALUES ($1)", migration.Revision); err != nil { return "", err }
	}
	if err = tx.Commit(); err != nil { return "", err }
	return chain[len(chain)-1].Revision, nil
}
