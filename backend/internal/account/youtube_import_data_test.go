package account

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"sneepcut/backend-go/internal/testdb"
)

func TestPostgresYouTubeImportExportAndDeletionFreeze(t *testing.T) {
	db := testdb.Open(t)
	user, importID, videoID := seedAccount(t, db), fixtureID(), fixtureID()
	if _, err := db.Exec(`INSERT INTO youtube_imports(id,user_id,status,resources,session_version,credentials,archive_id,lease_token,lease_until,cleanup_pending,authorization_in_progress)
		VALUES($1,$2,'importing',ARRAY['youtube.public_videos'],1,'never-export-import-token','never-export-signed-archive','never-export-worker-lease',now()+interval '5 minutes',true,true)`, importID, user); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO youtube_import_oauth_states(state_hash,import_id,user_id,browser_hash,verifier,locale,session_version,expires_at)
		VALUES('never-export-state',$1,$2,'never-export-browser','never-export-verifier','en',1,now()+interval '5 minutes')`, importID, user); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO youtube_import_videos(id,import_id,user_id,relative_path,title,file_name,file_size,source_storage_key)
		VALUES($1,$2,$3,'videos/original.mp4','My imported video','original.mp4',1024,$4)`, videoID, importID, user, "uploads/"+user+"/original.mp4"); err != nil {
		t.Fatal(err)
	}
	h := New(db, passAuth{}, nil, nil, Config{})
	exported, err := h.exportData(context.Background(), user)
	if err != nil {
		t.Fatal(err)
	}
	raw, _ := json.Marshal(exported)
	if !strings.Contains(string(raw), "My imported video") || !strings.Contains(string(raw), "youtubeImports") || strings.Contains(string(raw), "never-export") {
		t.Fatalf("incorrect or sensitive import data in export: %s", raw)
	}
	snapshot, err := h.deletionAccount(context.Background(), user)
	if err != nil {
		t.Fatal(err)
	}
	if err := h.freeze(context.Background(), user, snapshot); err != nil {
		t.Fatal(err)
	}
	var credentials, status string
	var pending, authorizing bool
	if err := db.QueryRow(`SELECT credentials,status,cleanup_pending,authorization_in_progress FROM youtube_imports WHERE id=$1`, importID).Scan(&credentials, &status, &pending, &authorizing); err != nil || credentials != "" || status != "cancelled" || pending || authorizing {
		t.Fatal("import retained credentials or work after account freeze", err)
	}
	var states int
	if err := db.QueryRow(`SELECT count(*) FROM youtube_import_oauth_states WHERE user_id=$1`, user).Scan(&states); err != nil || states != 0 {
		t.Fatal("OAuth state retained after account freeze", err)
	}
}
