package youtubeimport

import (
	"context"
	"database/sql"
	"encoding/base64"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/julienschmidt/httprouter"
	"github.com/lib/pq"
	"sneepcut/backend-go/internal/identity"
)

type handlerTestMedia struct {
	removed int
}

func (*handlerTestMedia) ImportSource(context.Context, string, ImportedVideo) (string, error) {
	return "uploads/owner/import.mp4", nil
}
func (m *handlerTestMedia) RemoveImportSource(context.Context, string, string) error {
	m.removed++
	return nil
}

func mockHandler(t *testing.T, client *Client) (*Handler, sqlmock.Sqlmock) {
	t.Helper()
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	h, err := New(db, nil, &handlerTestMedia{}, client, Config{Enabled: true, AppURL: "http://localhost:5173", EncryptionKey: base64.StdEncoding.EncodeToString(make([]byte, 32)), TempRoot: t.TempDir()})
	if err != nil {
		t.Fatal(err)
	}
	return h, mock
}

func TestRegistrationKeepsStaticAndParameterRoutesDistinct(t *testing.T) {
	auth := identity.NewHandler(nil, identity.HTTPConfig{}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	h := &Handler{auth: auth}
	router := httprouter.New()
	h.Register(router)
}

func TestInvalidImportConsentDoesNotStartAuthorization(t *testing.T) {
	h := &Handler{cfg: Config{Enabled: true}}
	for _, body := range []string{
		`{"visibilities":["public"],"consent":false}`,
		`{"visibilities":["all"],"consent":true}`,
		`{"visibilities":["public"],"consent":true,"user_id":"other"}`,
		`{"visibilities":["public"],"consent":true} {}`,
	} {
		response := httptest.NewRecorder()
		h.connect(response, httptest.NewRequest(http.MethodPost, "/api/youtube/imports/connect", strings.NewReader(body)))
		if response.Code != http.StatusBadRequest {
			t.Fatalf("invalid consent returned %d", response.Code)
		}
	}
}

func TestCallbackRequiresBrowserBoundSingleUseState(t *testing.T) {
	client := testClient(t, func(http.ResponseWriter, *http.Request) { t.Error("invalid callback must not contact Google") })
	h, mock := mockHandler(t, client)
	request := httptest.NewRequest(http.MethodGet, callbackPath+"?state="+strings.Repeat("s", 43)+"&code=synthetic", nil)
	response := httptest.NewRecorder()
	h.callback(response, request)
	if response.Code != http.StatusSeeOther || !strings.HasSuffix(response.Header().Get("Location"), "youtubeImport=error&youtubeImportError=invalid_state") {
		t.Fatal("callback accepted a missing browser cookie")
	}
	request.AddCookie(&http.Cookie{Name: browserCookie, Value: strings.Repeat("b", 43)})
	mock.ExpectBegin()
	mock.ExpectQuery("SELECT user_id FROM youtube_import_oauth_states").WithArgs(secretDigest(strings.Repeat("s", 43)), secretDigest(strings.Repeat("b", 43))).WillReturnError(sql.ErrNoRows)
	mock.ExpectRollback()
	response = httptest.NewRecorder()
	h.callback(response, request)
	if !strings.HasSuffix(response.Header().Get("Location"), "youtubeImport=error&youtubeImportError=invalid_state") {
		t.Fatal("callback accepted a consumed or different-browser state")
	}
	if response.Header().Get("Cache-Control") != "private, no-store" || response.Header().Get("Referrer-Policy") != "no-referrer" {
		t.Fatal("callback may leak its authorization URL")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestCallbackPersistsOnlyGrantedVideoCategories(t *testing.T) {
	client := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/token" {
			t.Errorf("unexpected provider request %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"access_token":"private-token","refresh_token":"private-refresh","expires_in":3600,"scope":"`+scopePrefix+PublicVideos+`","token_type":"Bearer"}`)
	})
	h, mock := mockHandler(t, client)
	mock.ExpectBegin()
	mock.ExpectQuery("SELECT user_id FROM youtube_import_oauth_states").WillReturnRows(sqlmock.NewRows([]string{"user"}).AddRow("user-one"))
	expectActiveUser(mock)
	mock.ExpectQuery("DELETE FROM youtube_import_oauth_states").WillReturnRows(sqlmock.NewRows([]string{"id", "user", "verifier", "locale", "version"}).AddRow("import-one", "user-one", testVerifier, "ro", 3))
	mock.ExpectQuery("UPDATE youtube_imports SET authorization_in_progress=true").WillReturnRows(sqlmock.NewRows([]string{"resources"}).AddRow(pq.Array([]string{PublicVideos, PrivateVideos})))
	mock.ExpectCommit()
	mock.ExpectQuery("SELECT u.session_version").WillReturnRows(sqlmock.NewRows([]string{"active"}).AddRow(true))
	mock.ExpectBegin()
	expectActiveUser(mock)
	mock.ExpectExec("UPDATE youtube_imports SET status='queued'").WithArgs("import-one", "user-one", sqlmock.AnyArg(), pq.Array([]string{PublicVideos})).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()
	request := httptest.NewRequest(http.MethodGet, callbackPath+"?state="+strings.Repeat("s", 43)+"&code=synthetic", nil)
	request.AddCookie(&http.Cookie{Name: browserCookie, Value: strings.Repeat("b", 43)})
	response := httptest.NewRecorder()
	h.callback(response, request)
	if response.Code != http.StatusSeeOther || response.Header().Get("Location") != "http://localhost:5173/ro/dashboard/create?mode=youtube&youtubeImport=success" {
		t.Fatalf("unexpected callback response %d %s", response.Code, response.Header().Get("Location"))
	}
	if strings.Contains(response.Body.String(), "private-token") || strings.Contains(response.Body.String(), "private-refresh") {
		t.Fatal("callback exposed a credential")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func expectActiveUser(mock sqlmock.Sqlmock) {
	mock.ExpectQuery("SELECT access_role,account_status,email_activation_required FROM users").WillReturnRows(sqlmock.NewRows([]string{"role", "status", "activation"}).AddRow("member", "active", false))
	mock.ExpectQuery("SELECT EXISTS\\(SELECT 1 FROM account_deletion_requests").WillReturnRows(sqlmock.NewRows([]string{"deleting"}).AddRow(false))
}

func TestDeletionMarkerReadAfterUserLockFencesAuthorization(t *testing.T) {
	client := testClient(t, func(http.ResponseWriter, *http.Request) {})
	h, mock := mockHandler(t, client)
	mock.ExpectBegin()
	mock.ExpectQuery("SELECT access_role,account_status,email_activation_required FROM users").WillReturnRows(sqlmock.NewRows([]string{"role", "status", "activation"}).AddRow("member", "active", false))
	mock.ExpectQuery("SELECT EXISTS\\(SELECT 1 FROM account_deletion_requests").WillReturnRows(sqlmock.NewRows([]string{"deleting"}).AddRow(true))
	mock.ExpectRollback()
	err := h.saveAuthorization(context.Background(), authorization{ID: "import", UserID: "owner"}, "ciphertext", []string{PublicVideos})
	if !errors.Is(err, sql.ErrNoRows) {
		t.Fatal("authorization survived a pending account deletion")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestRecordVideoFencesCancelledLease(t *testing.T) {
	client := testClient(t, func(http.ResponseWriter, *http.Request) {})
	h, mock := mockHandler(t, client)
	mock.ExpectBegin()
	expectActiveUser(mock)
	mock.ExpectQuery(regexp.QuoteMeta("SELECT lease_token=$2 AND lease_until>now() AND status='importing'")).WillReturnRows(sqlmock.NewRows([]string{"active"}).AddRow(false))
	mock.ExpectRollback()
	err := h.recordVideo(context.Background(), importWork{ID: "import", UserID: "owner", Lease: "old-lease"}, ImportedVideo{RelativePath: "video.mp4", FileName: "video.mp4", Size: 20}, "uploads/owner/video.mp4")
	if !errors.Is(err, errLeaseLost) {
		t.Fatal("cancelled lease saved a new video")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestReadRetriesAreBoundedAndCredentialsAreErased(t *testing.T) {
	client := testClient(t, func(http.ResponseWriter, *http.Request) {})
	h, mock := mockHandler(t, client)
	work := importWork{ID: "import", Lease: "lease", Attempts: 11, CreatedAt: time.Now()}
	mock.ExpectExec("UPDATE youtube_imports SET status=\\$3,error=\\$4,credentials=''").WithArgs("import", "lease", "failed", "reconnect").WillReturnResult(sqlmock.NewResult(0, 1))
	if err := h.retryRead(context.Background(), work, "reconnect"); err != nil {
		t.Fatal(err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestRestartDoesNotRepeatUnconfirmedExportMutation(t *testing.T) {
	client := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/authorization:reset" {
			t.Errorf("unconfirmed initiation must not be repeated: %s", r.URL.Path)
		}
		_, _ = io.WriteString(w, `{}`)
	})
	h, mock := mockHandler(t, client)
	work := importWork{ID: "import", UserID: "owner", Lease: "lease", Status: "exporting", CreatedAt: time.Now(), Resources: []string{PublicVideos}}
	work.Encrypted, _ = encryptToken(h.vault, Token{AccessToken: "synthetic", Scope: scopePrefix + PublicVideos, ExpiresAt: time.Now().Add(time.Hour)}, "owner:import")
	mock.ExpectExec("UPDATE youtube_imports SET cleanup_pending=true").WithArgs("import", "lease", "failed", "The export request could not be confirmed after a restart. Connect again.").WillReturnResult(sqlmock.NewResult(0, 1))
	expectCleanupLease(mock)
	expectRemoteCleanupLock(mock)
	mock.ExpectExec("UPDATE youtube_imports SET status=\\$3,error=\\$4,credentials=''").WithArgs("import", "lease", "failed", "The export request could not be confirmed after a restart. Connect again.").WillReturnResult(sqlmock.NewResult(0, 1))
	if err := h.process(context.Background(), work); err != nil {
		t.Fatal(err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}
