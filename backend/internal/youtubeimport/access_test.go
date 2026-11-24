package youtubeimport

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/julienschmidt/httprouter"
	"github.com/lib/pq"
	"golang.org/x/crypto/bcrypt"
	"sneepcut/backend-go/internal/identity"
)

const accessTestUserID = "20000000-0000-4000-8000-000000000001"

type accessTestRepository struct {
	user     identity.User
	sessions map[string]time.Time
}

func (r *accessTestRepository) FindByEmail(context.Context, string) (identity.User, error) {
	return r.user, nil
}

func (r *accessTestRepository) CreateSession(_ context.Context, id string, _ identity.User, expires time.Time) error {
	r.sessions[id] = expires
	return nil
}

func (r *accessTestRepository) FindSession(_ context.Context, id string) (identity.Session, error) {
	expires, ok := r.sessions[id]
	if !ok {
		return identity.Session{}, identity.ErrUnauthenticated
	}
	return identity.Session{User: r.user, Expires: expires}, nil
}

func (r *accessTestRepository) DeleteSession(_ context.Context, id string) error {
	delete(r.sessions, id)
	return nil
}

func authenticatedImportRoutes(t *testing.T, h *Handler, role string) (http.Handler, string, *accessTestRepository) {
	t.Helper()
	hash, err := bcrypt.GenerateFromPassword([]byte("synthetic-password"), bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	repository := &accessTestRepository{user: identity.User{
		ID: accessTestUserID, Email: "import-test@example.invalid", AccessRole: role,
		AccountStatus: "active", PasswordHash: string(hash),
	}, sessions: make(map[string]time.Time)}
	tokens, err := identity.NewTokens(identity.TokenConfig{
		Secret: strings.Repeat("synthetic-secret", 3), Issuer: "import-test", Audience: "import-test",
		AccessLifetime: time.Minute, RefreshLifetime: time.Hour,
	})
	if err != nil {
		t.Fatal(err)
	}
	service := identity.NewService(repository, tokens)
	principal, _, _, err := service.Login(context.Background(), repository.user.Email, "synthetic-password")
	if err != nil {
		t.Fatal(err)
	}
	h.auth = identity.NewHandler(service, identity.HTTPConfig{}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	router := httprouter.New()
	h.Register(router)
	return router, principal.AccessToken, repository
}

func importAccessRequest(routes http.Handler, token, method, path, body string) *httptest.ResponseRecorder {
	request := httptest.NewRequest(method, path, strings.NewReader(body))
	request.Header.Set("Authorization", "Bearer "+token)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	routes.ServeHTTP(response, request)
	return response
}

func TestImportOverviewGatesNewConnectionsButRetainsOwnedLibrary(t *testing.T) {
	for _, test := range []struct {
		name                   string
		role                   string
		testMode, disabled     bool
		missingClient, noVault bool
		wantEnabled            bool
	}{
		{name: "testing admin", role: "admin", testMode: true, wantEnabled: true},
		{name: "testing member", role: "member", testMode: true},
		{name: "testing viewer", role: "viewer", testMode: true},
		{name: "production member", role: "member", wantEnabled: true},
		{name: "disabled admin", role: "admin", testMode: true, disabled: true},
		{name: "missing client", role: "admin", testMode: true, missingClient: true},
		{name: "missing vault", role: "admin", testMode: true, noVault: true},
	} {
		t.Run(test.name, func(t *testing.T) {
			client := testClient(t, func(http.ResponseWriter, *http.Request) { t.Error("overview contacted Google") })
			h, mock := mockHandler(t, client)
			h.cfg.TestMode, h.cfg.Enabled = test.testMode, !test.disabled
			if test.missingClient {
				h.client = nil
			}
			if test.noVault {
				h.vault = nil
			}
			now := time.Now()
			mock.ExpectQuery("SELECT i.id,i.status,i.resources").WithArgs(accessTestUserID).WillReturnRows(sqlmock.NewRows([]string{"id", "status", "resources", "created_at", "updated_at", "error", "video_count"}).AddRow("owned-import", "ready", pq.Array([]string{PublicVideos}), now, now, "", 1))
			mock.ExpectQuery("SELECT s.import_id,s.video_id").WithArgs(accessTestUserID).WillReturnRows(sqlmock.NewRows([]string{"import_id", "video_id", "title", "thumbnail_url", "status", "job_id", "error"}))
			mock.ExpectQuery("SELECT id,import_id,title,file_name,file_size,source_storage_key,COALESCE\\(thumbnail_storage_key,''\\),created_at").WithArgs(accessTestUserID).WillReturnRows(sqlmock.NewRows([]string{"id", "import_id", "title", "file_name", "file_size", "source_storage_key", "thumbnail", "created_at"}).AddRow("owned-video", "owned-import", "My video", "my-video.mp4", 20, "uploads/owner/my-video.mp4", "", now))
			routes, token, _ := authenticatedImportRoutes(t, h, test.role)
			response := importAccessRequest(routes, token, http.MethodGet, "/api/youtube/imports", "")
			var overview Overview
			if response.Code != http.StatusOK || json.Unmarshal(response.Body.Bytes(), &overview) != nil {
				t.Fatalf("overview failed: %d %s", response.Code, response.Body.String())
			}
			if overview.Enabled != test.wantEnabled || len(overview.Imports) != 1 || len(overview.Videos) != 1 || overview.Videos[0].ID != "owned-video" {
				t.Fatalf("connection access or existing library changed: %+v", overview)
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestImportConnectChecksCurrentRoleBeforeCreatingOAuthState(t *testing.T) {
	for _, test := range []struct {
		name               string
		role               string
		testMode, disabled bool
		wantStatus         int
	}{
		{name: "testing admin", role: "admin", testMode: true, wantStatus: http.StatusOK},
		{name: "testing member", role: "member", testMode: true, wantStatus: http.StatusForbidden},
		{name: "production member", role: "member", wantStatus: http.StatusOK},
		{name: "disabled admin", role: "admin", testMode: true, disabled: true, wantStatus: http.StatusServiceUnavailable},
		{name: "demoted admin", role: "admin", testMode: true, wantStatus: http.StatusForbidden},
	} {
		t.Run(test.name, func(t *testing.T) {
			client := testClient(t, func(http.ResponseWriter, *http.Request) { t.Error("connect contacted Google before consent") })
			h, mock := mockHandler(t, client)
			h.cfg.TestMode, h.cfg.Enabled = test.testMode, !test.disabled
			routes, token, repository := authenticatedImportRoutes(t, h, test.role)
			if test.name == "demoted admin" {
				repository.user.AccessRole = "member"
			}
			if test.wantStatus == http.StatusOK {
				mock.ExpectBegin()
				expectActiveUser(mock)
				mock.ExpectQuery("SELECT session_version FROM users").WithArgs(accessTestUserID).WillReturnRows(sqlmock.NewRows([]string{"session_version"}).AddRow(0))
				mock.ExpectExec("UPDATE youtube_imports SET status='cancelled'").WithArgs(accessTestUserID).WillReturnResult(sqlmock.NewResult(0, 0))
				mock.ExpectQuery("SELECT EXISTS\\(SELECT 1 FROM youtube_imports").WithArgs(accessTestUserID).WillReturnRows(sqlmock.NewRows([]string{"active"}).AddRow(false))
				mock.ExpectQuery("SELECT \\(SELECT count\\(\\*\\) FROM youtube_imports").WithArgs(accessTestUserID).WillReturnRows(sqlmock.NewRows([]string{"recent", "videos"}).AddRow(0, 0))
				mock.ExpectExec("INSERT INTO youtube_imports").WithArgs(sqlmock.AnyArg(), accessTestUserID, pq.Array([]string{PublicVideos}), 0, nil).WillReturnResult(sqlmock.NewResult(0, 1))
				mock.ExpectExec("INSERT INTO youtube_import_oauth_states").WithArgs(sqlmock.AnyArg(), sqlmock.AnyArg(), accessTestUserID, sqlmock.AnyArg(), sqlmock.AnyArg(), "en", 0).WillReturnResult(sqlmock.NewResult(0, 1))
				mock.ExpectCommit()
			}
			response := importAccessRequest(routes, token, http.MethodPost, "/api/youtube/imports/connect", `{"visibilities":["public"],"consent":true}`)
			if response.Code != test.wantStatus {
				t.Fatalf("connect returned %d: %s", response.Code, response.Body.String())
			}
			if test.wantStatus == http.StatusOK {
				var result struct {
					URL string `json:"url"`
				}
				if json.Unmarshal(response.Body.Bytes(), &result) != nil {
					t.Fatal("missing authorization response")
				}
				target, err := url.Parse(result.URL)
				if err != nil || target.Query().Get("scope") != scopePrefix+PublicVideos || target.Query().Get("state") == "" || len(response.Result().Cookies()) != 1 {
					t.Fatal("allowed connection did not create the browser-bound Google authorization")
				}
			} else if len(response.Result().Cookies()) != 0 || strings.Contains(response.Body.String(), `"url"`) {
				t.Fatal("blocked connection created an authorization URL or cookie")
			}
			if test.wantStatus == http.StatusForbidden && !strings.Contains(response.Body.String(), "administrators during testing") {
				t.Fatal("testing restriction was not explained")
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestImportTestingModeStillAllowsMemberToDeleteOwnedVideo(t *testing.T) {
	client := testClient(t, func(http.ResponseWriter, *http.Request) { t.Error("delete contacted Google") })
	h, mock := mockHandler(t, client)
	h.cfg.TestMode = true
	routes, token, _ := authenticatedImportRoutes(t, h, "member")
	videoID := "30000000-0000-4000-8000-000000000001"
	mock.ExpectBegin()
	expectActiveUser(mock)
	mock.ExpectQuery("UPDATE youtube_import_videos SET deleted_at").WithArgs(videoID, accessTestUserID).WillReturnRows(sqlmock.NewRows([]string{"source_storage_key", "thumbnail"}).AddRow("uploads/owner/my-video.mp4", ""))
	mock.ExpectCommit()
	response := importAccessRequest(routes, token, http.MethodDelete, "/api/youtube/import-videos/"+videoID, "")
	if response.Code != http.StatusOK || h.media.(*handlerTestMedia).removed != 1 {
		t.Fatalf("member could not remove their existing video: %d %s", response.Code, response.Body.String())
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}
