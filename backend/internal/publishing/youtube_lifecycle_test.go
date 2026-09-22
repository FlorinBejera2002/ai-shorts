package publishing

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"reflect"
	"testing"
	"time"

	"github.com/lib/pq"
	"sneepcut/backend-go/internal/data"
)

func TestPostgresYouTubeOptionsSurviveEnqueueAndCalendarThroughPublication(t *testing.T) {
	for _, calendar := range []bool{false, true} {
		t.Run(map[bool]string{false: "direct", true: "calendar"}[calendar], func(t *testing.T) {
			h, user, clip, account := youtubeLifecycleFixture(t)
			ctx := context.Background()
			options := youtubeTestOptions()
			options.Title = "Explicit YouTube title"
			options.Description = "Description separate from caption"
			options.NotifySubscribers = true
			yes := true
			options.ContainsSyntheticMedia = &yes
			sessions, uploads := 0, 0
			h.client = mockProvider(t, func(w http.ResponseWriter, r *http.Request) {
				switch {
				case r.URL.Path == "/clips/video.mp4":
					w.Header().Set("Content-Type", "video/mp4")
					io.WriteString(w, "video")
				case r.Method == http.MethodPost && r.URL.Path == "/upload/youtube/v3/videos":
					sessions++
					var body struct {
						Snippet struct{ Title, Description string }
						Status  struct {
							PrivacyStatus                                   string
							SelfDeclaredMadeForKids, ContainsSyntheticMedia bool
						}
					}
					if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
						t.Error(err)
					}
					if body.Snippet.Title != options.Title || body.Snippet.Description != options.Description || body.Status.PrivacyStatus != "private" || body.Status.SelfDeclaredMadeForKids || !body.Status.ContainsSyntheticMedia || r.URL.Query().Get("notifySubscribers") != "true" {
						t.Errorf("lost options in upload: %+v", body)
					}
					var status string
					if err := h.db.QueryRow(`SELECT status FROM social_posts WHERE account_id=$1`, account).Scan(&status); err != nil {
						t.Error(err)
					}
					if status != "submitting" {
						t.Errorf("upload not durably guarded: %s", status)
					}
					w.Header().Set("Location", "https://www.googleapis.com/upload/youtube/v3/videos?upload_id=integration-session")
				case r.Method == http.MethodPut:
					uploads++
					io.WriteString(w, `{"id":"integration-video"}`)
				case r.URL.Path == "/youtube/v3/videos":
					io.WriteString(w, `{"items":[{"id":"integration-video","status":{"uploadStatus":"processed"}}]}`)
				default:
					t.Errorf("unexpected request: %s %s", r.Method, r.URL.Path)
					w.WriteHeader(404)
				}
			})
			h.client.config.YouTubeMediaURLPrefix = "https://media.example.invalid/"
			key, _ := data.NewUUID()
			var postID string
			if calendar {
				encoded, _ := json.Marshal(options)
				if _, err := h.db.Exec(`INSERT INTO scheduled_posts(id,user_id,clip_id,title,caption,platforms,account_ids,status,scheduled_at,media,youtube_options,created_at,updated_at) VALUES($1,$2,$3,'Calendar authored title','Generic caption',ARRAY['youtube'],ARRAY[$4]::uuid[],'scheduled',now(),'[]',$5,now(),now())`, key, user, clip, account, encoded); err != nil {
					t.Fatal(err)
				}
				if err := h.dispatchCalendar(ctx); err != nil {
					t.Fatal(err)
				}
				if err := h.dispatchCalendar(ctx); err != nil {
					t.Fatal(err)
				}
				if err := h.db.QueryRow(`SELECT id FROM social_posts WHERE scheduled_post_id=$1`, key).Scan(&postID); err != nil {
					t.Fatal(err)
				}
			} else {
				input := postInput{ClipID: clip, AccountIDs: []string{account}, Caption: "Generic caption", IdempotencyKey: key, Confirmed: true, YouTube: options}
				posts, err := h.enqueue(ctx, user, input)
				if err != nil || len(posts) != 1 {
					t.Fatalf("enqueue: %v, posts=%d", err, len(posts))
				}
				postID = posts[0].ID
				again, err := h.enqueue(ctx, user, input)
				if err != nil || len(again) != 1 || again[0].ID != postID {
					t.Fatalf("idempotent enqueue: %v", err)
				}
			}
			var encoded []byte
			var persistedKey string
			if err := h.db.QueryRow(`SELECT options,idempotency_key FROM social_posts WHERE id=$1`, postID).Scan(&encoded, &persistedKey); err != nil {
				t.Fatal(err)
			}
			var saved YouTubeOptions
			if err := json.Unmarshal(encoded, &saved); err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(saved, options) || persistedKey != key {
				t.Fatalf("options/key lost: %+v %s", saved, persistedKey)
			}
			for _, expected := range []string{"processing", "published"} {
				if _, err := h.db.Exec(`UPDATE social_posts SET next_attempt_at=now() WHERE id=$1`, postID); err != nil {
					t.Fatal(err)
				}
				if err := h.runOne(ctx); err != nil {
					t.Fatal(err)
				}
				var status string
				if err := h.db.QueryRow(`SELECT status FROM social_posts WHERE id=$1`, postID).Scan(&status); err != nil {
					t.Fatal(err)
				}
				if status != expected {
					t.Fatalf("want %s got %s", expected, status)
				}
			}
			if err := h.runOne(ctx); err != nil {
				t.Fatal(err)
			}
			if sessions != 1 || uploads != 1 {
				t.Fatalf("duplicate uploads: sessions=%d uploads=%d", sessions, uploads)
			}
			if calendar {
				if err := h.reconcileCalendar(ctx); err != nil {
					t.Fatal(err)
				}
				var status string
				if err := h.db.QueryRow(`SELECT status FROM scheduled_posts WHERE id=$1`, key).Scan(&status); err != nil {
					t.Fatal(err)
				}
				if status != "published" {
					t.Fatalf("calendar status %s", status)
				}
			}
		})
	}
}

func youtubeLifecycleFixture(t *testing.T) (*Handler, string, string, string) {
	t.Helper()
	h, user, clip, account := fixture(t)
	h.cfg.YouTubeClientID = "yt"
	h.cfg.YouTubeClientSecret = "secret"
	h.client = NewProviderClient(h.cfg.ProviderConfig)
	encrypted, err := seal(h.vault, Credentials{AccessToken: "synthetic-youtube", RefreshToken: "synthetic-refresh", ExpiresAt: time.Now().Add(time.Hour)}, user+":youtube:channel")
	if err != nil {
		t.Fatal(err)
	}
	_, err = h.db.Exec(`UPDATE social_accounts SET provider='youtube',remote_id='channel',credentials=$2,scopes=ARRAY['video_publish'],youtube_consent_at=now(),youtube_verified_at=now(),youtube_check_after=now()-interval '1 minute' WHERE id=$1`, account, encrypted)
	if err != nil {
		t.Fatal(err)
	}
	return h, user, clip, account
}

func TestPostgresYouTubeScheduleRequiresFreshPublishingConsent(t *testing.T) {
	for _, mutation := range []string{
		`scopes=ARRAY['channel_read']`,
		`youtube_consent_at=NULL`,
		`youtube_verified_at=now()-interval '7 days'`,
		`status='disconnected'`,
		`youtube_verified_at=now()`,
	} {
		t.Run(mutation, func(t *testing.T) {
			h, user, _, account := youtubeLifecycleFixture(t)
			if _, err := h.db.Exec(`UPDATE social_accounts SET `+mutation+` WHERE id=$1`, account); err != nil {
				t.Fatal(err)
			}
			tx, err := h.db.BeginTx(context.Background(), nil)
			if err != nil {
				t.Fatal(err)
			}
			defer tx.Rollback()
			field, err := h.ValidateYouTubeSchedule(context.Background(), tx, user, account, youtubeTestOptions())
			valid := mutation == `youtube_verified_at=now()`
			if (err == nil) != valid || (!valid && field != "accountIds") {
				t.Fatalf("field=%s err=%v", field, err)
			}
		})
	}
}

func seedYouTubeLifecycleRecords(t *testing.T, h *Handler, user, clip, account string) string {
	t.Helper()
	scheduled, _ := data.NewUUID()
	post, _ := data.NewUUID()
	if _, err := h.db.Exec(`INSERT INTO scheduled_posts(id,user_id,title,platforms,account_ids,status,scheduled_at,media,created_at,updated_at) VALUES($1,$2,'Keep my authored title',ARRAY['youtube'],ARRAY[$3]::uuid[],'scheduled',now(),'[]',now(),now())`, scheduled, user, account); err != nil {
		t.Fatal(err)
	}
	if _, err := h.db.Exec(`INSERT INTO social_posts(id,user_id,account_id,clip_id,provider,caption,options,media_reference,idempotency_key,request_hash,status,remote_id,url,scheduled_post_id) VALUES($1,$2,$3,$4,'youtube','Authored caption','{}','clips/test.mp4','synthetic-idempotency','hash','published','private-id','https://youtube.com/watch?v=private-id',$5)`, post, user, account, clip, scheduled); err != nil {
		t.Fatal(err)
	}
	if _, err := h.db.Exec(`INSERT INTO social_oauth_states(state_hash,user_id,provider,browser_hash,verifier,locale,session_version,expires_at) VALUES($1,$2,'youtube','browser','verifier','en',1,now()+interval '1 hour')`, post, user); err != nil {
		t.Fatal(err)
	}
	return scheduled
}

func assertYouTubePurged(t *testing.T, h *Handler, user, clip, account, scheduled string) {
	t.Helper()
	var count int
	for _, query := range []string{`SELECT count(*) FROM social_accounts WHERE id=$1`, `SELECT count(*) FROM social_posts WHERE account_id=$1`} {
		if err := h.db.QueryRow(query, account).Scan(&count); err != nil {
			t.Fatal(err)
		}
		if count != 0 {
			t.Fatalf("retained data: %s", query)
		}
	}
	if err := h.db.QueryRow(`SELECT count(*) FROM social_oauth_states WHERE user_id=$1 AND provider='youtube'`, user).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Fatal("retained OAuth state")
	}
	var status, title string
	var accounts []string
	if err := h.db.QueryRow(`SELECT status,title,account_ids FROM scheduled_posts WHERE id=$1`, scheduled).Scan(&status, &title, pq.Array(&accounts)); err != nil {
		t.Fatal(err)
	}
	if status != "failed" || title != "Keep my authored title" || len(accounts) != 0 {
		t.Fatalf("calendar %s %s %v", status, title, accounts)
	}
	if err := h.db.QueryRow(`SELECT count(*) FROM clips WHERE id=$1`, clip).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatal("deleted original clip")
	}
}

func TestPostgresYouTubePurgeRemovesAPIDataAndPendingDestinations(t *testing.T) {
	h, user, clip, account := youtubeLifecycleFixture(t)
	scheduled := seedYouTubeLifecycleRecords(t, h, user, clip, account)
	tx, err := h.db.BeginTx(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()
	if err = purgeYouTubeAccount(context.Background(), tx, user, account); err != nil {
		t.Fatal(err)
	}
	if err = tx.Commit(); err != nil {
		t.Fatal(err)
	}
	assertYouTubePurged(t, h, user, clip, account, scheduled)
}

func TestPostgresYouTubeMaintenancePurgesRevokedAndStaleConnections(t *testing.T) {
	for _, stale := range []bool{false, true} {
		t.Run(map[bool]string{false: "revoked", true: "stale"}[stale], func(t *testing.T) {
			h, user, clip, account := youtubeLifecycleFixture(t)
			scheduled := seedYouTubeLifecycleRecords(t, h, user, clip, account)
			calls := 0
			h.client = mockProvider(t, func(w http.ResponseWriter, r *http.Request) {
				calls++
				w.WriteHeader(401)
				io.WriteString(w, `{"error":{"code":401}}`)
			})
			if stale {
				if _, err := h.db.Exec(`UPDATE social_accounts SET youtube_verified_at=now()-interval '6 days 1 minute' WHERE id=$1`, account); err != nil {
					t.Fatal(err)
				}
			}
			if err := h.maintainYouTubeData(context.Background()); err != nil {
				t.Fatal(err)
			}
			assertYouTubePurged(t, h, user, clip, account, scheduled)
			if stale && calls != 0 {
				t.Fatal("stale data triggered provider call")
			}
			if !stale && calls != 1 {
				t.Fatalf("expected one revocation check, got %d", calls)
			}
		})
	}
}

func TestPostgresYouTubeMaintenanceRefreshesProfileAndBacksOffTransientErrors(t *testing.T) {
	for _, transient := range []bool{false, true} {
		t.Run(map[bool]string{false: "success", true: "transient"}[transient], func(t *testing.T) {
			h, _, _, account := youtubeLifecycleFixture(t)
			if _, err := h.db.Exec(`UPDATE social_accounts SET youtube_verified_at=now()-interval '2 days' WHERE id=$1`, account); err != nil {
				t.Fatal(err)
			}
			calls := 0
			h.client = mockProvider(t, func(w http.ResponseWriter, r *http.Request) {
				calls++
				if transient {
					w.WriteHeader(503)
					io.WriteString(w, `{"error":{"code":503}}`)
					return
				}
				io.WriteString(w, `{"items":[{"id":"channel","snippet":{"title":"Fresh title","customUrl":"@fresh","thumbnails":{"default":{"url":"https://example.invalid/avatar"}}}}]}`)
			})
			if err := h.maintainYouTubeData(context.Background()); err != nil {
				t.Fatal(err)
			}
			var name string
			var verified, next time.Time
			if err := h.db.QueryRow(`SELECT name,youtube_verified_at,youtube_check_after FROM social_accounts WHERE id=$1`, account).Scan(&name, &verified, &next); err != nil {
				t.Fatal(err)
			}
			if transient {
				if time.Since(verified) < 47*time.Hour || time.Until(next) < 59*time.Minute {
					t.Fatal("transient failure falsely refreshed verification or lacks backoff")
				}
			} else if name != "Fresh title" || time.Since(verified) > time.Minute || time.Until(next) < 23*time.Hour {
				t.Fatal("profile or daily check was not refreshed")
			}
			if err := h.maintainYouTubeData(context.Background()); err != nil {
				t.Fatal(err)
			}
			if calls != 1 {
				t.Fatal("maintenance ignored backoff")
			}
		})
	}
}
