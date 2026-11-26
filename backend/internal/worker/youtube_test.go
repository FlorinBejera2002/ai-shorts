package worker

import (
	"context"
	"encoding/json"
	"testing"

	"sneepcut/backend-go/internal/jobs"
	"sneepcut/backend-go/internal/testdb"
)

func TestYouTubeDeliveryCannotBorrowAnotherSource(t *testing.T) {
	url := "https://www.youtube.com/watch?v=aqz-KE-bpKQ"
	j := &Job{SourceType: "youtube", SourceURL: url}
	if err := validateYouTubeDelivery(j, url, ""); err != nil {
		t.Fatal(err)
	}
	for _, test := range []struct {
		job      Job
		url, key string
	}{
		{*j, "https://www.youtube.com/watch?v=xxxxxxxxxxx", ""},
		{*j, url, "uploads/owner/file.mp4"},
		{Job{SourceType: "upload", SourceURL: url}, url, ""},
		{*j, "https://youtu.be/aqz-KE-bpKQ", ""},
		{*j, "", ""},
	} {
		if validateYouTubeDelivery(&test.job, test.url, test.key) == nil {
			t.Fatalf("accepted %+v", test)
		}
	}
}

func TestPostgresYouTubeQueueClaimFailureRefund(t *testing.T) {
	db := testdb.Open(t)
	ctx := context.Background()
	user := token()
	if _, err := db.Exec(`INSERT INTO users(id,email,provider,credits,plan) VALUES($1,$2,'credentials',100,'free')`, user, user+"@example.invalid"); err != nil {
		t.Fatal(err)
	}
	url := "https://www.youtube.com/watch?v=aqz-KE-bpKQ"
	_, err := jobs.NewRepository(db).Create(ctx, user, []jobs.Prepared{{Input: jobs.CreateInput{Options: jobs.DefaultOptions(), SourceType: "youtube", SourceURL: &url}}})
	if err != nil {
		t.Fatal(err)
	}
	repo := NewRepository(db)
	j, err := repo.Claim(ctx)
	if err != nil || j == nil {
		t.Fatalf("claim %v %v", j, err)
	}
	var payload struct {
		URL string `json:"youtube_url"`
		Key string `json:"source_storage_key"`
	}
	if err = json.Unmarshal(j.Payload, &payload); err != nil || validateYouTubeDelivery(j, payload.URL, payload.Key) != nil {
		t.Fatalf("delivery %s: %v", j.Payload, err)
	}
	if err = repo.Fail(ctx, j, "download unavailable"); err != nil {
		t.Fatal(err)
	}
	var balance int
	if err = db.QueryRow(`SELECT credits FROM users WHERE id=$1`, user).Scan(&balance); err != nil || balance != 100 {
		t.Fatalf("refund %d %v", balance, err)
	}
}
