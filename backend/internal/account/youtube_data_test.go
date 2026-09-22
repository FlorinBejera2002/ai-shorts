package account

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"sneepcut/backend-go/internal/testdb"
)

func TestPostgresYouTubeExportAndDeletionFreeze(t *testing.T) {
	db := testdb.Open(t)
	user := seedAccount(t, db)
	_, clip := seedWork(t, db, user, "completed", false)
	account, post, schedule := fixtureID(), fixtureID(), fixtureID()
	if _, err := db.Exec(`INSERT INTO social_accounts(id,user_id,provider,remote_id,name,credentials,scopes,youtube_consent_at) VALUES($1,$2,'youtube','remote','My channel','never-export-token',ARRAY['video_publish'],now())`, account, user); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO social_posts(id,user_id,account_id,clip_id,provider,caption,options,media_reference,idempotency_key,request_hash,status,remote_id) VALUES($1,$2,$3,$4,'youtube','caption','{}','clips/test.mp4','unique','hash','published','video')`, post, user, account, clip); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO scheduled_posts(id,user_id,title,platforms,status,scheduled_at,youtube_options,updated_at) VALUES($1,$2,'Draft',ARRAY['youtube'],'draft',now(),'{"title":"My YouTube title","termsAccepted":true}',now())`, schedule, user); err != nil {
		t.Fatal(err)
	}
	h := New(db, passAuth{}, nil, nil, Config{})
	exported, err := h.exportData(context.Background(), user)
	if err != nil {
		t.Fatal(err)
	}
	raw, _ := json.Marshal(exported)
	for _, expected := range []string{"youtubeConsentAt", "youtubeOptions", "My YouTube title", "video_publish"} {
		if !strings.Contains(string(raw), expected) {
			t.Fatalf("missing portable data %s", expected)
		}
	}
	if strings.Contains(string(raw), "never-export-token") {
		t.Fatal("credentials exported")
	}
	snapshot, err := h.deletionAccount(context.Background(), user)
	if err != nil {
		t.Fatal(err)
	}
	if err = h.freeze(context.Background(), user, snapshot); err != nil {
		t.Fatal(err)
	}
	var count int
	if err = db.QueryRow(`SELECT (SELECT count(*) FROM social_accounts WHERE user_id=$1)+(SELECT count(*) FROM social_posts WHERE user_id=$1)`, user).Scan(&count); err != nil || count != 0 {
		t.Fatalf("YouTube data retained during deletion: %d %v", count, err)
	}
	// Account deletion is still pending: media/billing cleanup did not have to run
	// before the provider data was erased.
	if err = db.QueryRow(`SELECT count(*) FROM account_deletion_requests WHERE user_id=$1`, user).Scan(&count); err != nil || count != 1 {
		t.Fatal("expected pending account deletion", err)
	}
}
