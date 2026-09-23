package workspaceagent

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"sneepcut/backend-go/internal/calendar"
	"sneepcut/backend-go/internal/data"
	"sneepcut/backend-go/internal/publishing"
	"sneepcut/backend-go/internal/story"
	"strings"
	"testing"
	"time"
)

func TestPublishingAdapterApprovalAndExactDestinationOutcome(t *testing.T) {
	f := newAgentFixture(t)
	ctx := context.Background()
	job, _ := data.NewUUID()
	clip, _ := data.NewUUID()
	account, _ := data.NewUUID()
	statements := []struct {
		sql  string
		args []any
	}{
		{`INSERT INTO jobs(id,user_id,source_type,status,progress,num_clips_requested,aspect_ratio,subtitle_style,include_brand,credits_charged) VALUES($1,$2,'upload','completed',100,1,'9:16','default',false,0)`, []any{job, f.user}},
		{`INSERT INTO clips(id,user_id,job_id,title,start_time,end_time,duration,file_path,file_storage_key,viral_score,file_size,resolution,aspect_ratio,has_subtitles) VALUES($1,$2,$3,'Exact synthetic clip',0,10,10,'clips/private.mp4','clips/private.mp4',8,1024,'1080x1920','9:16',false)`, []any{clip, f.user, job}},
		{`INSERT INTO social_accounts(id,user_id,provider,remote_id,name,credentials) VALUES($1,$2,'instagram','exact-destination','Reviewed destination','private-token')`, []any{account, f.user}},
	}
	for _, q := range statements {
		if _, err := f.db.Exec(q.sql, q.args...); err != nil {
			t.Fatal(err)
		}
	}
	pub, err := publishing.New(f.db, nil, nil, publishing.Config{Enabled: true, EncryptionKey: base64.StdEncoding.EncodeToString(make([]byte, 32)), ProviderConfig: publishing.ProviderConfig{AppURL: "https://example.invalid", InstagramAppID: "fixture", InstagramAppSecret: "fixture"}})
	if err != nil {
		t.Fatal(err)
	}
	cal := calendar.New(f.db, nil, nil)
	e := NewExecutor(f.db, nil, story.DefaultLimits())
	e.SetPublishing(cal, pub)
	request, _ := data.NewUUID()
	draftResult, err := e.Execute(ctx, f.user, request, Action{Name: "calendar.create_draft", Input: actionJSON(map[string]any{"fields": map[string]any{"title": "Reviewed draft", "caption": "Exact approved caption", "clipId": clip, "platforms": []string{"instagram"}, "accountIds": []string{account}, "scheduledAt": time.Now().Add(time.Hour).UTC().Format(time.RFC3339)}})})
	if err != nil {
		t.Fatal(err)
	}
	var receipt publishingReceipt
	if err = json.Unmarshal(draftResult.Data, &receipt); err != nil {
		t.Fatal(err)
	}
	action := Action{Name: "publishing.publish", Input: actionJSON(calendarAction{ID: receipt.Post.ID, ExpectedState: receipt.Post.ExpectedState, Fields: map[string]any{}})}
	preview, err := e.publishingApproval(ctx, f.user, action)
	if err != nil {
		t.Fatal(err)
	}
	for _, expected := range []string{"Exact approved caption", "Reviewed destination", "Exact synthetic clip", account} {
		if !strings.Contains(string(preview), expected) {
			t.Fatalf("approval omitted %s: %s", expected, preview)
		}
	}
	if strings.Contains(string(preview), "clips/private.mp4") || strings.Contains(string(preview), "private-token") {
		t.Fatalf("unsafe approval preview: %s", preview)
	}
	publishID, _ := data.NewUUID()
	pending, err := e.Execute(ctx, f.user, publishID, action)
	if err != nil || !pending.Pending {
		t.Fatalf("queue: %+v %v", pending, err)
	}
	postID := receipt.Post.ID
	socialID, _ := data.NewUUID()
	if _, err = f.db.Exec(`INSERT INTO social_posts(id,user_id,account_id,clip_id,provider,caption,options,idempotency_key,request_hash,media_reference,scheduled_post_id,status) VALUES($1,$2,$3,$4,'instagram','Exact approved caption','{}',$5::text,'fixture','clips/private.mp4',$5::uuid,'unknown')`, socialID, f.user, account, clip, postID); err != nil {
		t.Fatal(err)
	}
	if _, err = f.db.Exec(`UPDATE scheduled_posts SET status='failed' WHERE id=$1`, postID); err != nil {
		t.Fatal(err)
	}
	partial, err := e.publishingPoll(ctx, f.user, action, pending)
	if err == nil || !strings.Contains(string(partial.Data), `"status":"unknown"`) {
		t.Fatalf("unknown outcome lost or reported success: %+v %v", partial, err)
	}
	if _, err = f.db.Exec(`UPDATE social_posts SET status='published' WHERE id=$1`, socialID); err != nil {
		t.Fatal(err)
	}
	if _, err = f.db.Exec(`UPDATE scheduled_posts SET status='published' WHERE id=$1`, postID); err != nil {
		t.Fatal(err)
	}
	completed, err := e.publishingPoll(ctx, f.user, action, pending)
	if err != nil || completed.Pending {
		t.Fatalf("verified provider result: %+v %v", completed, err)
	}
	if _, err = f.db.Exec(`UPDATE scheduled_posts SET agent_binding='{}' WHERE id=$1`, postID); err != nil {
		t.Fatal(err)
	}
	if _, err = e.publishingPoll(ctx, f.user, action, pending); err == nil {
		t.Fatal("superseded publishing receipt reported success")
	}
}
