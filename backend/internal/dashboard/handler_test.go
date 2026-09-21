package dashboard

import (
	"context"
	"encoding/json"
	"github.com/julienschmidt/httprouter"
	"io"
	"log/slog"
	"net/http/httptest"
	"sneepcut/backend-go/internal/data"
	"sneepcut/backend-go/internal/identity"
	"sneepcut/backend-go/internal/testdb"
	"strings"
	"testing"
	"time"
)

type recentReader struct{ user string }

func (c *recentReader) Recent(ctx context.Context, user string, limit int) ([]map[string]any, error) {
	c.user = user
	return []map[string]any{{"id": "fixture", "fileUrl": "/media/fixture?sig=fresh"}}, nil
}
func TestDashboardPostgresHTTP(t *testing.T) {
	db := testdb.Open(t)
	id, _ := data.NewUUID()
	other, _ := data.NewUUID()
	for _, user := range []string{id, other} {
		if _, err := db.Exec(`INSERT INTO users(id,email,provider,password_hash,credits,plan) VALUES($1,$2,'credentials',$3,123,'pro')`, user, user+"@example.invalid", "$2b$12$tVLZOBSvFOx2sp4u1B6nT.0lG9HQ0XjxYkW72YPuUc1cQTsKGvCY2"); err != nil {
			t.Fatal(err)
		}
	}
	now := time.Date(2026, 9, 6, 22, 0, 0, 0, time.UTC)
	job, _ := data.NewUUID()
	clip, _ := data.NewUUID()
	otherJob, _ := data.NewUUID()
	for _, p := range []struct{ id, user, status string }{{job, id, "completed"}, {otherJob, other, "failed"}} {
		if _, err := db.Exec(`INSERT INTO jobs(id,user_id,source_type,status,created_at,progress,num_clips_requested,aspect_ratio,subtitle_style,include_brand,credits_charged) VALUES($1,$2,'upload',$3,$4,100,1,'9:16','clean',false,10)`, p.id, p.user, p.status, now); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := db.Exec(`INSERT INTO clips(id,user_id,job_id,title,start_time,end_time,duration,aspect_ratio,created_at,viral_score,file_path,file_size,resolution,has_subtitles) VALUES($1,$2,$3,'Fixture',0,90,90,'9:16',$4,8,'fixture.mp4',100,'1080x1920',false)`, clip, id, job, now); err != nil {
		t.Fatal(err)
	}
	tokens, err := identity.NewTokens(identity.TokenConfig{Secret: strings.Repeat("x", 40), Issuer: "test", Audience: "test", AccessLifetime: time.Minute, RefreshLifetime: time.Hour})
	if err != nil {
		t.Fatal(err)
	}
	service := identity.NewService(identity.NewPostgres(db), tokens)
	login, _, _, err := service.Login(context.Background(), id+"@example.invalid", "dummy-password-not-a-user")
	if err != nil {
		t.Fatal(err)
	}
	auth := identity.NewHandler(service, identity.HTTPConfig{}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	reader := &recentReader{}
	handler := New(db, auth, reader)
	handler.now = func() time.Time { return now }
	router := httprouter.New()
	handler.Register(router)
	call := func(path, token string) *httptest.ResponseRecorder {
		req := httptest.NewRequest("GET", path, nil)
		req.Header.Set("Authorization", "Bearer "+token)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		return w
	}
	w := call("/api/dashboard", login.AccessToken)
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	var body struct {
		Metrics struct {
			Activity                                      []ActivityDay  `json:"activity"`
			Statuses                                      map[string]int `json:"statuses"`
			JobCount, ClipCount, DurationMinutes, Credits int
			Plan                                          string
		}
		RecentClips []map[string]any
	}
	if err = json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	m := body.Metrics
	if len(m.Activity) != 90 || m.Activity[0].Date != "2026-06-09" || m.Activity[89].Clips != 1 || m.Activity[89].Projects != 1 || m.JobCount != 1 || m.ClipCount != 1 || m.DurationMinutes != 2 || m.Credits != 123 || m.Plan != "pro" || m.Statuses["completed"] != 1 || m.Statuses["failed"] != 0 || reader.user != id {
		t.Fatalf("incorrect isolated metrics: %+v", m)
	}
	w = call("/api/dashboard/analytics", login.AccessToken)
	if w.Code != 200 || strings.Contains(w.Body.String(), otherJob) || !strings.Contains(w.Body.String(), `"viralScore":8`) {
		t.Fatal(w.Code, w.Body.String())
	}
	if w = call("/api/dashboard", ""); w.Code != 401 {
		t.Fatal("unauthenticated dashboard exposed")
	}
}
func TestStatuses(t *testing.T) {
	if Status("processing") != "active" || Status("unknown") != "other" || Status("cancelled") != "cancelled" {
		t.Fatal("project groups changed")
	}
}
