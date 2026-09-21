package clips

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"sync"
	"testing"

	"sneepcut/backend-go/internal/testdb"
)

func seedClip(t *testing.T, db *sql.DB) (string, string, string) {
	t.Helper()
	user, job, clip := newID(), newID(), newID()
	for _, q := range []struct {
		sql  string
		args []any
	}{{`INSERT INTO users(id,email,provider,credits,plan) VALUES($1,$2,'credentials',100,'free')`, []any{user, user + "@example.invalid"}}, {`INSERT INTO jobs(id,user_id,source_type,status,source_storage_key,progress,num_clips_requested,aspect_ratio,subtitle_style,include_brand,credits_charged) VALUES($1,$2,'upload','completed',$3,100,5,'9:16','default',false,50)`, []any{job, user, "sources/" + job + "/source.mp4"}}, {`INSERT INTO clips(id,user_id,job_id,title,start_time,end_time,duration,file_path,file_storage_key,resolution,caption_tiktok,viral_score,file_size,aspect_ratio,has_subtitles) VALUES($1,$2,$3,'Fixture',0,10,10,$4,$4,'1080x1920','Fixture caption',8,1024,'9:16',false)`, []any{clip, user, job, "clips/" + job + "/video.mp4"}}} {
		if _, err := db.Exec(q.sql, q.args...); err != nil {
			t.Fatal(err)
		}
	}
	return user, job, clip
}
func TestPostgresEditReservationOutboxConcurrencyAndDeleteConflict(t *testing.T) {
	db := testdb.Open(t)
	user, job, clip := seedClip(t, db)
	media := &fakeMedia{}
	h := New(db, fakeAuth{true}, media, Config{})
	ctx := context.Background()
	var wg sync.WaitGroup
	results := make(chan error, 12)
	for i := 0; i < 12; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := h.beginEdit(ctx, user, clip, "trim", map[string]any{"start_time": 0, "end_time": 5, "burn_subtitles": false})
			results <- err
		}()
	}
	wg.Wait()
	close(results)
	accepted, busy := 0, 0
	for err := range results {
		if err == nil {
			accepted++
		} else if errors.Is(err, errBusy) {
			busy++
		} else {
			t.Fatal(err)
		}
	}
	if accepted != 1 || busy != 11 {
		t.Fatal(accepted, busy)
	}
	var count, active int
	var reservation, token string
	var raw []byte
	if err := db.QueryRow(`SELECT count(*) FROM edit_deliveries`).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRow(`SELECT active_edit_tasks,active_edit_token FROM jobs WHERE id=$1`, job).Scan(&active, &token); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRow(`SELECT reservation_token,payload FROM edit_deliveries WHERE job_id=$1`, job).Scan(&reservation, &raw); err != nil {
		t.Fatal(err)
	}
	var payload map[string]any
	_ = json.Unmarshal(raw, &payload)
	if count != 1 || active != 1 || token != reservation || payload["edit_token"] != token || payload["burn_subtitles"] != false {
		t.Fatal(count, active, token, payload)
	}
	if err := h.deleteClip(ctx, user, clip); !errors.Is(err, errBusy) {
		t.Fatalf("deleted active edit: %v", err)
	}
	if len(media.keys) != 0 {
		t.Fatal("media touched for active edit")
	}
	read, err := h.readOne(ctx, user, clip)
	if err != nil {
		t.Fatal(err)
	}
	if read["edit_status"] != "pending" || read["caption_tiktok"] != "Fixture caption" {
		t.Fatal(read)
	}
	if _, err = h.readOne(ctx, newID(), clip); !errors.Is(err, sql.ErrNoRows) {
		t.Fatal("cross-account read", err)
	}
}
func TestPostgresMetadataLibraryAndRetryableCleanup(t *testing.T) {
	db := testdb.Open(t)
	user, job, clip := seedClip(t, db)
	media := &fakeMedia{fail: true}
	h := New(db, fakeAuth{true}, media, Config{})
	ctx := context.Background()
	if err := h.updateMetadata(ctx, user, clip, MetadataInput{Title: "Updated"}); err != nil {
		t.Fatal(err)
	}
	result, err := h.readLibrary(ctx, user, ParseLibraryQuery(nil))
	if err != nil {
		t.Fatal(err)
	}
	if result["total"] != 1 || result["currentPage"] != 1 {
		t.Fatal(result)
	}
	items := result["clips"].([]map[string]any)
	if items[0]["title"] != "Updated" || items[0]["fileUrl"] == nil || items[0]["hookText"] != nil {
		t.Fatal(items)
	}
	if err = h.deleteClip(ctx, user, clip); err == nil {
		t.Fatal("expected media outage")
	}
	if _, err = h.readOne(ctx, user, clip); err != nil {
		t.Fatal("failed cleanup lost database row", err)
	}
	media.fail = false
	if err = h.deleteClip(ctx, user, clip); err != nil {
		t.Fatal(err)
	}
	if len(media.keys) != 1 || len(media.prefixes) != 2 {
		t.Fatal(media)
	}
	var count int
	if err = db.QueryRow(`SELECT count(*) FROM jobs WHERE id=$1`, job).Scan(&count); err != nil || count != 1 {
		t.Fatal("clip deletion removed source job", err)
	}
}
func TestPostgresFailedEditOutboxInsertRollsBackReservation(t *testing.T) {
	db := testdb.Open(t)
	user, job, clip := seedClip(t, db)
	h := New(db, fakeAuth{true}, &fakeMedia{}, Config{})
	if _, err := h.beginEdit(context.Background(), user, clip, "unsupported", map[string]any{}); err == nil {
		t.Fatal("expected constraint failure")
	}
	var active int
	var token sql.NullString
	if err := db.QueryRow(`SELECT active_edit_tasks,active_edit_token FROM jobs WHERE id=$1`, job).Scan(&active, &token); err != nil {
		t.Fatal(err)
	}
	if active != 0 || token.Valid {
		t.Fatal("reservation leaked on outbox insert failure")
	}
}
