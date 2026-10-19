package publishing

import (
	"context"
	"net/http"
	"net/http/httptest"
	"regexp"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/julienschmidt/httprouter"
)

func TestUnsupportedProvidersNeverReachRemoteAPIs(t *testing.T) {
	client := mockProvider(t, func(w http.ResponseWriter, r *http.Request) {
		t.Errorf("unsupported provider reached remote API: %s", r.URL.Path)
		w.WriteHeader(http.StatusInternalServerError)
	})
	ctx := context.Background()
	credentials := Credentials{AccessToken: "synthetic-token", RefreshToken: "synthetic-refresh"}
	for _, provider := range []string{"linkedin", "twitter", "x", "unknown", ""} {
		t.Run(provider, func(t *testing.T) {
			if SupportedProvider(provider) || client.Configured(provider) {
				t.Fatal("unsupported destination was enabled")
			}
			if _, err := client.Authorize(provider, "state", "verifier"); err == nil {
				t.Fatal("unsupported authorization accepted")
			}
			if _, err := client.Exchange(ctx, provider, "code", "verifier"); err == nil {
				t.Fatal("unsupported token exchange accepted")
			}
			if _, _, err := client.Publish(ctx, provider, "42", credentials, "https://media.example/video.mp4", "caption", TikTokOptions{}); err == nil {
				t.Fatal("unsupported publication accepted")
			}
			if _, _, err := client.Poll(ctx, provider, "42:123", credentials); err == nil {
				t.Fatal("unsupported polling accepted")
			}
			if _, _, err := client.Finalize(ctx, provider, "42:123", credentials); err == nil {
				t.Fatal("unsupported finalization accepted")
			}
			if err := client.DeletePost(ctx, provider, "123", credentials); err == nil {
				t.Fatal("unsupported remote deletion accepted")
			}
			if _, err := client.Refresh(ctx, provider, credentials); err == nil {
				t.Fatal("unsupported refresh accepted")
			}
			if err := client.Revoke(ctx, provider, credentials); err == nil {
				t.Fatal("unsupported revocation accepted")
			}
			if err := ValidateMediaTypes(provider, []string{"video"}); err == nil {
				t.Fatal("unsupported scheduling media accepted")
			}
		})
	}
	for _, provider := range []string{"instagram", "facebook", "tiktok", "youtube"} {
		if !SupportedProvider(provider) || !client.Configured(provider) {
			t.Fatalf("supported destination %q was disabled", provider)
		}
	}
}

func TestUnsupportedOAuthRoutesAreRejectedBeforeDatabaseAccess(t *testing.T) {
	h := &Handler{cfg: Config{ProviderConfig: ProviderConfig{AppURL: "https://app.example"}}}
	for _, provider := range []string{"linkedin", "twitter", "x"} {
		t.Run(provider, func(t *testing.T) {
			params := httprouter.Params{{Key: "provider", Value: provider}}
			request := httptest.NewRequest(http.MethodPost, "/api/publishing/connect/"+provider, nil)
			request = request.WithContext(context.WithValue(request.Context(), httprouter.ParamsKey, params))
			response := httptest.NewRecorder()
			h.connect(response, request)
			if response.Code != http.StatusNotFound {
				t.Fatalf("connect status=%d", response.Code)
			}
			response = httptest.NewRecorder()
			h.callback(response, request)
			if response.Code != http.StatusSeeOther || response.Header().Get("Location") != "https://app.example/dashboard/publish?connectionError=unavailable" {
				t.Fatalf("callback response=%d %s", response.Code, response.Header().Get("Location"))
			}
		})
	}
}

func TestWorkerFailsUnsupportedJobsWithoutCredentialsOrRemoteRequests(t *testing.T) {
	for _, provider := range []string{"linkedin", "twitter", "x"} {
		for _, status := range []string{"queued", "processing"} {
			t.Run(provider+"/"+status, func(t *testing.T) {
				db, mock, err := sqlmock.New()
				if err != nil {
					t.Fatal(err)
				}
				defer db.Close()
				mock.ExpectExec("UPDATE social_posts SET status='unknown'").WillReturnResult(sqlmock.NewResult(0, 0))
				mock.ExpectExec("DELETE FROM social_oauth_states WHERE expires_at<now").WillReturnResult(sqlmock.NewResult(0, 0))
				mock.ExpectBegin()
				mock.ExpectQuery("SELECT id,user_id,account_id,provider,status,remote_id,caption,options,finalized,created_at,media_reference FROM social_posts").WillReturnRows(
					sqlmock.NewRows([]string{"id", "user_id", "account_id", "provider", "status", "remote_id", "caption", "options", "finalized", "created_at", "media_reference"}).
						AddRow("post", "user", "account", provider, status, "legacy-remote", "saved caption", `[]`, false, time.Now(), "saved-media"))
				mock.ExpectExec(regexp.QuoteMeta("UPDATE social_posts SET status='failed',error='Publishing to this platform is no longer available.',updated_at=now() WHERE id=$1")).WithArgs("post").WillReturnResult(sqlmock.NewResult(0, 1))
				mock.ExpectCommit()
				// No provider client or vault: failing the saved job must not use either.
				h := &Handler{db: db}
				if err = h.runOne(context.Background()); err != nil {
					t.Fatal(err)
				}
				if err = mock.ExpectationsWereMet(); err != nil {
					t.Fatal(err)
				}
			})
		}
	}
}

func TestPublishingReadModelsExcludeUnsupportedStoredProviders(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	allowed := regexp.QuoteMeta("provider IN ('instagram','facebook','tiktok','youtube')")
	mock.ExpectQuery("SELECT .* FROM social_accounts WHERE user_id=\\$1 AND " + allowed).
		WithArgs("user").WillReturnRows(sqlmock.NewRows([]string{"id", "provider", "name", "username", "avatar_url", "status", "scopes", "token_expires_at", "token_expired"}))
	mock.ExpectQuery("SELECT .* FROM clips WHERE user_id=\\$1").WithArgs("user").WillReturnRows(sqlmock.NewRows([]string{"id", "title", "duration", "thumbnail", "file", "caption", "tiktok_eligible"}))
	mock.ExpectQuery("SELECT .* FROM social_posts WHERE user_id=\\$1 AND " + allowed).
		WithArgs("user").WillReturnRows(sqlmock.NewRows([]string{"id", "clip_id", "account_id", "provider", "status", "error", "created_at", "url"}))
	h := &Handler{db: db}
	if _, _, _, err = h.list(context.Background(), "user"); err != nil {
		t.Fatal(err)
	}
	mock.ExpectQuery("SELECT .* FROM social_accounts WHERE user_id=\\$1 AND " + allowed).
		WithArgs("user").WillReturnRows(sqlmock.NewRows([]string{"id", "provider", "name", "username", "status", "binding"}))
	if _, err = h.AgentAccounts(context.Background(), "user"); err != nil {
		t.Fatal(err)
	}
	if err = mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestCalendarWorkerRejectsUnsupportedStoredPlatforms(t *testing.T) {
	for _, provider := range []string{"linkedin", "twitter", "x"} {
		t.Run(provider, func(t *testing.T) {
			db, mock, err := sqlmock.New()
			if err != nil {
				t.Fatal(err)
			}
			defer db.Close()
			mock.ExpectQuery("SELECT id,user_id,account_ids FROM scheduled_posts").WillReturnRows(
				sqlmock.NewRows([]string{"id", "user_id", "account_ids"}).AddRow("post", "user", "{}"))
			mock.ExpectBegin()
			mock.ExpectQuery("SELECT NOT EXISTS.*FROM users").WithArgs("user").WillReturnRows(sqlmock.NewRows([]string{"active"}).AddRow(true))
			mock.ExpectQuery("SELECT s.id,s.user_id,s.clip_id").WithArgs("post").WillReturnRows(
				sqlmock.NewRows([]string{"id", "user_id", "clip_id", "caption", "account_ids", "platforms", "reference", "tiktok_reference", "media", "tiktok", "instagram", "youtube", "facebook"}).
					AddRow("post", "user", nil, "saved caption", "{}", "{instagram,"+provider+"}", "", "", `[]`, `{}`, `{}`, `{}`, `{}`))
			mock.ExpectExec(regexp.QuoteMeta("UPDATE scheduled_posts SET status='failed',publishing_error=$2,updated_at=now() WHERE id=$1")).
				WithArgs("post", "A saved platform is no longer supported. Review the destinations before scheduling again.").WillReturnResult(sqlmock.NewResult(0, 1))
			mock.ExpectCommit()
			h := &Handler{db: db}
			if err = h.dispatchCalendar(context.Background()); err != nil {
				t.Fatal(err)
			}
			if err = mock.ExpectationsWereMet(); err != nil {
				t.Fatal(err)
			}
		})
	}
}
