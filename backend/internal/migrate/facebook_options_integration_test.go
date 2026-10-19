package migrate

import (
	"context"
	"testing"

	"sneepcut/backend-go/migrations"
)

func TestPostgresFacebookOptionsMigrationPreservesExistingPosts(t *testing.T) {
	db := migrationDB(t)
	ctx := context.Background()
	chain, err := migrations.All()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := apply(ctx, db, chain[:len(chain)-1]); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO users(id,email,provider,credits,plan) VALUES('00000000-0000-0000-0000-000000000001','facebook-migration@example.test','credentials',17,'free');
		INSERT INTO scheduled_posts(id,user_id,title,platforms,scheduled_at,updated_at,media,instagram_options)
		VALUES('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','Existing photo',ARRAY['facebook'],now(),now(),'[{"type":"image","reference":"publishing/photo.jpg","altText":"Bicycle"}]','{"locationId":"123"}')`); err != nil {
		t.Fatal(err)
	}
	if _, err := Up(ctx, db); err != nil {
		t.Fatal(err)
	}
	var title, alt, location, facebook string
	if err := db.QueryRow(`SELECT title,media->0->>'altText',instagram_options->>'locationId',facebook_options::text FROM scheduled_posts`).Scan(&title, &alt, &location, &facebook); err != nil {
		t.Fatal(err)
	}
	if title != "Existing photo" || alt != "Bicycle" || location != "123" || facebook != "{}" {
		t.Fatalf("existing post changed: %q %q %q %q", title, alt, location, facebook)
	}
	if _, err := db.Exec(`UPDATE scheduled_posts SET facebook_options=NULL`); err == nil {
		t.Fatal("facebook_options unexpectedly accepted null")
	}
}
