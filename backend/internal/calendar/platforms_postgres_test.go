package calendar

import (
	"context"
	"errors"
	"slices"
	"testing"

	"github.com/lib/pq"
	"sneepcut/backend-go/internal/testdb"
)

func TestPostgresCalendarPreservesRetiredDataAndFiltersDestinations(t *testing.T) {
	db := testdb.Open(t)
	ctx := context.Background()
	user, _, clip := seedCalendarClip(t, db)
	repository := NewRepository(db, calendarMedia{})
	accounts := []string{fixtureID(t), fixtureID(t), fixtureID(t)}
	providers := []string{"instagram", "linkedin", "twitter"}
	for i, provider := range providers {
		if _, err := db.Exec(`INSERT INTO social_accounts(id,user_id,provider,remote_id,name,credentials) VALUES($1,$2,$3,$4,'Historical fixture','sealed')`, accounts[i], user, provider, accounts[i]); err != nil {
			t.Fatal(err)
		}
	}
	input := validInput()
	input["status"], input["clipId"] = "draft", clip
	input["platforms"], input["accountIds"] = []any{"instagram"}, []any{accounts[0]}
	post, err := repository.Mutate(ctx, user, "", input, true)
	if err != nil {
		t.Fatal(err)
	}
	// Seed historical data directly: active APIs must never accept these targets.
	if _, err = db.Exec(`UPDATE scheduled_posts SET platforms=$2,account_ids=$3 WHERE id=$1`, post.ID, pq.Array(providers), pq.Array(accounts)); err != nil {
		t.Fatal(err)
	}
	for i, provider := range providers {
		publicationID := fixtureID(t)
		if _, err = db.Exec(`INSERT INTO social_posts(id,user_id,account_id,clip_id,provider,caption,options,idempotency_key,request_hash,media_reference,scheduled_post_id,status)
			VALUES($1,$2,$3,$4,$5,'{}','{}',$6,'history','clips/fixture/video.mp4',$7,'failed')`, publicationID, user, accounts[i], clip, provider, publicationID, post.ID); err != nil {
			t.Fatal(err)
		}
	}
	loaded, err := repository.Get(ctx, user, post.ID)
	if err != nil || !slices.Equal(loaded.Platforms, []string{"instagram"}) || !slices.Equal(loaded.AccountIDs, accounts[:1]) || len(loaded.PublishingDestinations) != 1 || loaded.PublishingDestinations[0].Provider != "instagram" {
		t.Fatalf("retired destinations leaked: %+v %v", loaded, err)
	}
	listed, err := repository.AgentList(ctx, user, "2026-09-04T00:00:00Z", "2026-09-05T00:00:00Z")
	if err != nil || len(listed) != 1 || !slices.Equal(listed[0].Platforms, []string{"instagram"}) || !slices.Equal(listed[0].AccountIDs, accounts[:1]) {
		t.Fatalf("agent exposed retired destinations: %+v %v", listed, err)
	}
	for _, update := range []map[string]any{{"title": "Changed"}, {"status": "publish"}, {"platforms": []any{"instagram"}}} {
		_, err = repository.Mutate(ctx, user, post.ID, update, false)
		var validation *ValidationError
		if !errors.As(err, &validation) {
			t.Fatalf("update retained unsupported targets: %+v %v", update, err)
		}
	}
	var persistedProviders, persistedAccounts pq.StringArray
	if err = db.QueryRow(`SELECT platforms,account_ids FROM scheduled_posts WHERE id=$1`, post.ID).Scan(&persistedProviders, &persistedAccounts); err != nil || !slices.Equal([]string(persistedProviders), providers) || !slices.Equal([]string(persistedAccounts), accounts) {
		t.Fatalf("retired data was rewritten: %v %v %v", persistedProviders, persistedAccounts, err)
	}
	if _, err = db.Exec(`UPDATE scheduled_posts SET platforms=ARRAY['linkedin']::varchar[],account_ids=$2 WHERE id=$1`, post.ID, pq.Array(accounts[1:2])); err != nil {
		t.Fatal(err)
	}
	loaded, err = repository.Get(ctx, user, post.ID)
	if err != nil || len(loaded.Platforms) != 0 || len(loaded.AccountIDs) != 0 || loaded.Clip == nil || loaded.Clip.ID != clip || loaded.Title != post.Title {
		t.Fatalf("historical post content was lost or reassigned: %+v %v", loaded, err)
	}
	// A user can explicitly choose a supported destination for an existing draft.
	if _, err = repository.Mutate(ctx, user, post.ID, map[string]any{"platforms": []any{"instagram"}, "accountIds": []any{accounts[0]}}, false); err != nil {
		t.Fatalf("explicit supported replacement failed: %v", err)
	}
	input["accountIds"] = []any{accounts[1]}
	if _, err = repository.Mutate(ctx, user, "", input, true); err == nil {
		t.Fatal("draft accepted a retired account behind a supported platform")
	}
}
