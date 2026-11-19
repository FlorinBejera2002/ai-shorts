package youtubeimport

import (
	"context"
	"database/sql"
	"encoding/base64"
	"errors"
	"net/http"
	"testing"
	"time"

	"github.com/lib/pq"
	"sneepcut/backend-go/internal/data"
	"sneepcut/backend-go/internal/testdb"
)

func importStoreFixture(t *testing.T) (*Handler, string, string) {
	t.Helper()
	db := testdb.Open(t)
	client := testClient(t, func(http.ResponseWriter, *http.Request) { t.Error("store tests must not contact Google") })
	h, err := New(db, nil, &handlerTestMedia{}, client, Config{Enabled: true, AppURL: "http://localhost:5173", EncryptionKey: base64.StdEncoding.EncodeToString(make([]byte, 32))})
	if err != nil {
		t.Fatal(err)
	}
	owner, _ := data.NewUUID()
	other, _ := data.NewUUID()
	for _, user := range []string{owner, other} {
		if _, err := db.Exec(`INSERT INTO users(id,email,provider,credits,plan,access_role,account_status,email_activation_required) VALUES($1,$2,'credentials',100,'free','member','active',false)`, user, user+"@example.invalid"); err != nil {
			t.Fatal(err)
		}
	}
	return h, owner, other
}

func TestPostgresAuthorizationIsBrowserBoundSingleUseAndSessionBound(t *testing.T) {
	h, owner, _ := importStoreFixture(t)
	ctx := context.Background()
	var version int
	if err := h.db.QueryRow(`SELECT session_version FROM users WHERE id=$1`, owner).Scan(&version); err != nil {
		t.Fatal(err)
	}
	if err := h.createAuthorization(ctx, owner, version, []string{PublicVideos, PrivateVideos}, "state", "browser", testVerifier, "ro"); err != nil {
		t.Fatal(err)
	}
	if err := h.createAuthorization(ctx, owner, version, []string{PublicVideos}, "second", "browser", testVerifier, "en"); !errors.Is(err, errActiveImport) {
		t.Fatalf("duplicate active import was not rejected: %v", err)
	}
	if _, err := h.consumeAuthorization(ctx, "state", "different-browser"); !errors.Is(err, sql.ErrNoRows) {
		t.Fatal("different browser consumed OAuth state")
	}
	a, err := h.consumeAuthorization(ctx, "state", "browser")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := h.consumeAuthorization(ctx, "state", "browser"); !errors.Is(err, sql.ErrNoRows) {
		t.Fatal("OAuth state was reusable")
	}
	if _, err := h.db.Exec(`UPDATE users SET session_version=session_version+1 WHERE id=$1`, owner); err != nil {
		t.Fatal(err)
	}
	if err := h.saveAuthorization(ctx, a, "encrypted", []string{PublicVideos}); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("old session saved OAuth credentials: %v", err)
	}
}

func TestPostgresLibraryOwnershipTombstonesAndCancellation(t *testing.T) {
	h, owner, other := importStoreFixture(t)
	ctx := context.Background()
	id, _ := data.NewUUID()
	_, err := h.db.Exec(`INSERT INTO youtube_imports(id,user_id,status,resources,credentials,session_version,lease_token,lease_until) VALUES($1,$2,'importing',$3,'encrypted',0,'lease',now()+interval '5 minutes')`, id, owner, pq.Array([]string{PublicVideos}))
	if err != nil {
		t.Fatal(err)
	}
	work := importWork{ID: id, UserID: owner, Lease: "lease"}
	video := ImportedVideo{RelativePath: "YouTube/videos/sermon.mp4", FileName: "sermon.mp4", Title: "A message", Size: 1234}
	key := "uploads/" + owner + "/sermon.mp4"
	if err := h.recordVideo(ctx, work, video, key); err != nil {
		t.Fatal(err)
	}
	ownLibrary, err := h.loadOverview(ctx, owner)
	if err != nil || len(ownLibrary.Videos) != 1 || ownLibrary.Videos[0].Title != "A message" {
		t.Fatalf("owned library did not contain imported video: %v", err)
	}
	otherLibrary, err := h.loadOverview(ctx, other)
	if err != nil || len(otherLibrary.Imports) != 0 || len(otherLibrary.Videos) != 0 {
		t.Fatal("another user could read imported metadata")
	}
	if _, err := h.tombstoneVideo(ctx, other, ownLibrary.Videos[0].ID); !errors.Is(err, sql.ErrNoRows) {
		t.Fatal("another user could delete imported video")
	}
	if _, err := h.cancelImport(ctx, other, id); !errors.Is(err, sql.ErrNoRows) {
		t.Fatal("another user could cancel import")
	}
	if _, err := h.cancelImport(ctx, owner, id); err != nil {
		t.Fatal(err)
	}
	if err := h.renewLease(ctx, work); !errors.Is(err, errLeaseLost) {
		t.Fatal("cancelled worker renewed its lease")
	}
	if err := h.recordVideo(ctx, work, ImportedVideo{RelativePath: "another.mp4", FileName: "another.mp4", Size: 10}, "uploads/"+owner+"/another.mp4"); !errors.Is(err, errLeaseLost) {
		t.Fatal("cancelled worker inserted a video")
	}
	if _, err := h.tombstoneVideo(ctx, owner, ownLibrary.Videos[0].ID); err != nil {
		t.Fatal(err)
	}
	if exists, err := h.videoExists(ctx, work, video.RelativePath); err != nil || !exists {
		t.Fatal("deleted video lost its deduplication tombstone")
	}
	ownLibrary, err = h.loadOverview(ctx, owner)
	if err != nil || len(ownLibrary.Videos) != 0 {
		t.Fatal("deleted video remained visible")
	}
	var credentials string
	var lease sql.NullString
	var cleanup bool
	if err := h.db.QueryRow(`SELECT credentials,lease_token,cleanup_pending FROM youtube_imports WHERE id=$1`, id).Scan(&credentials, &lease, &cleanup); err != nil || credentials != "encrypted" || lease.Valid || !cleanup {
		t.Fatal("cancellation did not fence processing and queue durable grant cleanup")
	}
	if err := h.createAuthorization(ctx, owner, 0, []string{PublicVideos}, "new-state", "browser", testVerifier, "en"); !errors.Is(err, errActiveImport) {
		t.Fatal("new consent started before the old grant was revoked")
	}
}

func TestPostgresClaimIsExclusiveAndRecoversExpiredLease(t *testing.T) {
	h, owner, _ := importStoreFixture(t)
	id, _ := data.NewUUID()
	if _, err := h.db.Exec(`INSERT INTO youtube_imports(id,user_id,status,resources,credentials,session_version,archive_id) VALUES($1,$2,'exporting',$3,'encrypted',0,'confirmed-job')`, id, owner, pq.Array([]string{PublicVideos})); err != nil {
		t.Fatal(err)
	}
	first, err := h.claim(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if _, err := h.claim(context.Background()); !errors.Is(err, sql.ErrNoRows) {
		t.Fatal("a live lease was claimed twice")
	}
	if _, err := h.db.Exec(`UPDATE youtube_imports SET lease_until=$2 WHERE id=$1`, id, time.Now().Add(-time.Minute)); err != nil {
		t.Fatal(err)
	}
	second, err := h.claim(context.Background())
	if err != nil || second.ID != first.ID || second.Lease == first.Lease || second.ArchiveID != "confirmed-job" {
		t.Fatalf("expired import did not recover its confirmed archive: %v", err)
	}
	if err := h.renewLease(context.Background(), first); !errors.Is(err, errLeaseLost) {
		t.Fatal("old worker reclaimed its replaced lease")
	}
}

func TestPostgresConsentStartedNearExpiryKeepsInflightGuard(t *testing.T) {
	h, owner, _ := importStoreFixture(t)
	ctx := context.Background()
	if err := h.createAuthorization(ctx, owner, 0, []string{PublicVideos}, "state", "browser", testVerifier, "en"); err != nil {
		t.Fatal(err)
	}
	if _, err := h.db.Exec(`UPDATE youtube_imports SET created_at=now()-interval '9 minutes 59 seconds' WHERE user_id=$1`, owner); err != nil {
		t.Fatal(err)
	}
	a, err := h.consumeAuthorization(ctx, "state", "browser")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := h.db.Exec(`UPDATE youtube_imports SET created_at=now()-interval '11 minutes' WHERE id=$1`, a.ID); err != nil {
		t.Fatal(err)
	}
	if err := h.sweepAuthorizations(ctx); err != nil {
		t.Fatal(err)
	}
	if err := h.createAuthorization(ctx, owner, 0, []string{PublicVideos}, "other-state", "browser", testVerifier, "en"); !errors.Is(err, errActiveImport) {
		t.Fatalf("inflight consent lost its guard near the original deadline: %v", err)
	}
	if _, err := h.cancelImport(ctx, owner, a.ID); err != nil {
		t.Fatal(err)
	}
	if err := h.sweepAuthorizations(ctx); err != nil {
		t.Fatal(err)
	}
	if err := h.createAuthorization(ctx, owner, 0, []string{PublicVideos}, "third-state", "browser", testVerifier, "en"); !errors.Is(err, errActiveImport) {
		t.Fatalf("cancellation released an in-flight callback too early: %v", err)
	}
}

func TestPostgresCallbackAndCancellationShareLockOrder(t *testing.T) {
	h, owner, _ := importStoreFixture(t)
	if err := h.createAuthorization(context.Background(), owner, 0, []string{PublicVideos}, "state", "browser", testVerifier, "en"); err != nil {
		t.Fatal(err)
	}
	var id string
	if err := h.db.QueryRow(`SELECT id FROM youtube_imports WHERE user_id=$1`, owner).Scan(&id); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	consumed, stopped := make(chan error, 1), make(chan error, 1)
	go func() { _, err := h.consumeAuthorization(ctx, "state", "browser"); consumed <- err }()
	go func() { _, err := h.cancelImport(ctx, owner, id); stopped <- err }()
	if err := <-consumed; err != nil && !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("callback deadlocked cancellation: %v", err)
	}
	if err := <-stopped; err != nil {
		t.Fatalf("cancellation deadlocked callback: %v", err)
	}
}
