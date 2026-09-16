package publishing

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"testing"

	"sneepcut/backend-go/internal/data"
)

func TestPostgresCarouselWorkerPersistsStagesAndNeverRetriesUnconfirmedParent(t *testing.T) {
	for _, parentFailure := range []bool{false, true} {
		t.Run(fmt.Sprintf("parentFailure=%v", parentFailure), func(t *testing.T) {
			h, user, _, account := fixture(t)
			ctx := context.Background()
			id, _ := data.NewUUID()
			media, _ := json.Marshal([]map[string]string{
				{"type": "video", "reference": "publishing/" + user + "/cover.mp4", "name": "cover.mp4"},
				{"type": "image", "reference": "publishing/" + user + "/second.jpg", "name": "second.jpg"},
			})
			if _, err := h.db.Exec(`INSERT INTO scheduled_posts(id,user_id,title,platforms,account_ids,status,scheduled_at,media,created_at,updated_at) VALUES($1,$2,'Carousel',ARRAY['instagram'],ARRAY[$3]::uuid[],'scheduled',now(),$4,now(),now())`, id, user, account, media); err != nil {
				t.Fatal(err)
			}
			if err := h.dispatchCalendar(ctx); err != nil {
				t.Fatal(err)
			}
			children, parents, publications := 0, 0, 0
			ready := false
			h.client = mockProvider(t, func(w http.ResponseWriter, r *http.Request) {
				_ = r.ParseForm()
				switch {
				case r.URL.Path == "/v23.0/42/media" && r.Form.Get("is_carousel_item") == "true":
					children++
					fmt.Fprintf(w, `{"id":"child-%d"}`, children)
				case r.URL.Path == "/v23.0/42/media":
					parents++
					var status, remote string
					if err := h.db.QueryRow(`SELECT status,remote_id FROM social_posts WHERE scheduled_post_id=$1`, id).Scan(&status, &remote); err != nil {
						t.Error(err)
					}
					if status != "submitting" || !strings.Contains(remote, ":carousel:") || !ready || r.Form.Get("children") != "child-1,child-2" {
						t.Errorf("parent mutation not durably guarded or ordered: %s %s %v", status, remote, r.Form)
					}
					if parentFailure {
						w.WriteHeader(500)
						return
					}
					io.WriteString(w, `{"id":"parent"}`)
				case r.URL.Path == "/v23.0/42/media_publish":
					publications++
					var status string
					_ = h.db.QueryRow(`SELECT status FROM social_posts WHERE scheduled_post_id=$1`, id).Scan(&status)
					if status != "finalizing" || r.Form.Get("creation_id") != "parent" {
						t.Errorf("publication not guarded: %s %v", status, r.Form)
					}
					io.WriteString(w, `{"id":"published"}`)
				case r.URL.Path == "/v23.0/published":
					io.WriteString(w, `{"permalink":"https://instagram.example/p/carousel"}`)
				default:
					status := "FINISHED"
					if !ready {
						status = "IN_PROGRESS"
					}
					fmt.Fprintf(w, `{"status_code":%q}`, status)
				}
			})
			run := func() string {
				t.Helper()
				if _, err := h.db.Exec(`UPDATE social_posts SET next_attempt_at=now() WHERE scheduled_post_id=$1`, id); err != nil {
					t.Fatal(err)
				}
				if err := h.runOne(ctx); err != nil {
					t.Fatal(err)
				}
				var status string
				if err := h.db.QueryRow(`SELECT status FROM social_posts WHERE scheduled_post_id=$1`, id).Scan(&status); err != nil {
					t.Fatal(err)
				}
				return status
			}
			if status := run(); status != "processing" || children != 2 || parents != 0 {
				t.Fatalf("children stage: %s %d %d", status, children, parents)
			}
			if status := run(); status != "processing" || parents != 0 {
				t.Fatalf("waiting stage: %s %d", status, parents)
			}
			ready = true
			status := run()
			if parentFailure {
				if status != "unknown" || run() != "unknown" || parents != 1 || publications != 0 {
					t.Fatal("unconfirmed parent mutation was retried")
				}
				return
			}
			if status != "processing" || parents != 1 {
				t.Fatalf("parent stage: %s %d", status, parents)
			}
			if status := run(); status != "published" || publications != 1 || children != 2 || parents != 1 {
				t.Fatalf("publication stage: %s %d", status, publications)
			}
			if err := h.reconcileCalendar(ctx); err != nil {
				t.Fatal(err)
			}
			if err := h.db.QueryRow(`SELECT status FROM scheduled_posts WHERE id=$1`, id).Scan(&status); err != nil || status != "published" {
				t.Fatalf("calendar status: %s %v", status, err)
			}
		})
	}
}

func TestPostgresUnsupportedCarouselDestinationQueuesNothing(t *testing.T) {
	h, user, _, instagram := fixture(t)
	h.client.config.MetaAppID, h.client.config.MetaAppSecret = "fixture", "fixture"
	facebook, _ := data.NewUUID()
	if _, err := h.db.Exec(`INSERT INTO social_accounts(id,user_id,provider,remote_id,name,credentials) VALUES($1,$2,'facebook','43','Facebook fixture','sealed')`, facebook, user); err != nil {
		t.Fatal(err)
	}
	id, _ := data.NewUUID()
	media, _ := json.Marshal([]map[string]string{
		{"type": "video", "reference": "publishing/" + user + "/first.mp4", "name": "first.mp4"},
		{"type": "image", "reference": "publishing/" + user + "/second.jpg", "name": "second.jpg"},
	})
	if _, err := h.db.Exec(`INSERT INTO scheduled_posts(id,user_id,title,platforms,account_ids,status,scheduled_at,media,created_at,updated_at) VALUES($1,$2,'Carousel',ARRAY['instagram','facebook'],ARRAY[$3,$4]::uuid[],'scheduled',now(),$5,now(),now())`, id, user, instagram, facebook, media); err != nil {
		t.Fatal(err)
	}
	if err := h.dispatchCalendar(context.Background()); err != nil {
		t.Fatal(err)
	}
	var status, message string
	var jobs int
	if err := h.db.QueryRow(`SELECT status,publishing_error,(SELECT count(*) FROM social_posts WHERE scheduled_post_id=$1) FROM scheduled_posts WHERE id=$1`, id).Scan(&status, &message, &jobs); err != nil {
		t.Fatal(err)
	}
	if status != "failed" || jobs != 0 || !strings.Contains(message, "Facebook") {
		t.Fatalf("unsupported destination partially queued: %s %d %s", status, jobs, message)
	}
}
