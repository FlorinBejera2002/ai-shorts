package stories

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/julienschmidt/httprouter"
	"sneepcut/backend-go/internal/identity"
	"sneepcut/backend-go/internal/story"
)

func TestFrontendDefaultStoryCreateHTTPContract(t *testing.T) {
	for _, role := range []string{"member", "admin"} {
		t.Run(role, func(t *testing.T) {
			repo, user, _, _ := fixture(t, 0)
			if _, err := repo.db.Exec(`UPDATE users SET access_role=$2,password_hash=$3 WHERE id=$1`, user, role, "$2b$12$tVLZOBSvFOx2sp4u1B6nT.0lG9HQ0XjxYkW72YPuUc1cQTsKGvCY2"); err != nil {
				t.Fatal(err)
			}
			tokens, err := identity.NewTokens(identity.TokenConfig{Secret: strings.Repeat("x", 40), Issuer: "test", Audience: "test", AccessLifetime: time.Minute, RefreshLifetime: time.Hour})
			if err != nil {
				t.Fatal(err)
			}
			service := identity.NewService(identity.NewPostgres(repo.db), tokens)
			login, _, _, err := service.Login(context.Background(), user+"@example.invalid", "dummy-password-not-a-user")
			if err != nil {
				t.Fatal(err)
			}
			auth := identity.NewHandler(service, identity.HTTPConfig{}, slog.New(slog.NewTextHandler(io.Discard, nil)))
			router := httprouter.New()
			New(repo.db, auth, httpMedia{}, httpEngine{}, story.DefaultLimits()).Register(router)

			// Match defaultOptions in frontend/src/components/story/types.ts. Keep
			// this as frontend JSON: Go DefaultOptions omits caption_mode and would
			// miss a decoder rejecting the field sent by the Story Builder.
			id := newID()
			body := fmt.Sprintf(`{"id":%q,"options":{"brief":"","target_seconds":45,"aspect_ratio":"9:16","language":"auto","mode":"smart","preserve_order":true,"captions":false,"caption_mode":"off"}}`, id)
			req := httptest.NewRequest(http.MethodPost, "/api/stories", strings.NewReader(body))
			req.Header.Set("Authorization", "Bearer "+login.AccessToken)
			req.Header.Set("Content-Type", "application/json")
			response := httptest.NewRecorder()
			router.ServeHTTP(response, req)
			if response.Code != http.StatusCreated {
				t.Fatalf("frontend default story creation returned %d: %s", response.Code, response.Body.String())
			}

			project, err := repo.Get(context.Background(), user, id)
			if err != nil {
				t.Fatal(err)
			}
			options := project.Options
			if project.Status != "draft" || options.Brief != "" || options.TargetSeconds != 45 || options.AspectRatio != "9:16" || options.Language != "auto" || options.Mode != "smart" {
				t.Fatalf("frontend draft options were not persisted: status=%s options=%+v", project.Status, options)
			}
			if options.CaptionMode != "off" || options.Captions || !options.PreserveOrder {
				t.Fatalf("frontend caption and order choices were not persisted: %+v", options)
			}
		})
	}
}
