package migrate

import (
	"context"
	"strings"
	"testing"

	"sneepcut/backend-go/migrations"
)

func TestPostgresAdoptsExistingTikTokAssetColumn(t *testing.T) {
	chain, err := migrations.All()
	if err != nil {
		t.Fatal(err)
	}
	var target migrations.Migration
	for _, migration := range chain {
		if migration.Revision == "20260917_clip_tiktok_asset" {
			target = migration
		}
	}
	if target.SQL == "" {
		t.Fatal("TikTok asset migration not found")
	}
	for _, definition := range []string{"VARCHAR(2048)", "TEXT", "VARCHAR(2048) NOT NULL", "VARCHAR(2048) DEFAULT 'unexpected'"} {
		t.Run(definition, func(t *testing.T) {
			db := migrationDB(t)
			ctx := context.Background()
			_, err := db.Exec(`CREATE TABLE clips (id INTEGER PRIMARY KEY, tiktok_file_storage_key ` + definition + `);
				INSERT INTO clips VALUES (1, 'clips/existing-tiktok.mp4');
				CREATE TABLE alembic_version (version_num VARCHAR(32) PRIMARY KEY);
				INSERT INTO alembic_version VALUES ('20260916_tiktok_options');`)
			if err != nil {
				t.Fatal(err)
			}
			_, err = apply(ctx, db, []migrations.Migration{{Revision: "20260916_tiktok_options"}, target})
			compatible := definition == "VARCHAR(2048)"
			if compatible && err != nil {
				t.Fatal(err)
			}
			if !compatible && (err == nil || !strings.Contains(err.Error(), "must be nullable VARCHAR(2048)")) {
				t.Fatalf("incompatible column was not rejected: %v", err)
			}
			var reference, revision string
			if err := db.QueryRow(`SELECT tiktok_file_storage_key FROM clips WHERE id=1`).Scan(&reference); err != nil || reference != "clips/existing-tiktok.mp4" {
				t.Fatalf("asset reference changed: %q %v", reference, err)
			}
			wantRevision := "20260916_tiktok_options"
			if compatible {
				wantRevision = target.Revision
			}
			if err := db.QueryRow(`SELECT version_num FROM alembic_version`).Scan(&revision); err != nil || revision != wantRevision {
				t.Fatalf("revision=%q want=%q err=%v", revision, wantRevision, err)
			}
		})
	}
}
