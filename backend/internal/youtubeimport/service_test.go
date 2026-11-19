package youtubeimport

import (
	"context"
	"io"
	"net/http"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
)

func cleanupWork() importWork {
	return importWork{ID: "import", UserID: "owner", Lease: "lease", Status: "importing", AccessType: "ACCESS_TYPE_ONE_TIME", CleanupPending: true, CompletionStatus: "ready", CreatedAt: time.Now()}
}

func expectCleanupLease(mock sqlmock.Sqlmock) {
	mock.ExpectExec("UPDATE youtube_imports i SET lease_until").WithArgs("import", "lease").WillReturnResult(sqlmock.NewResult(0, 1))
}

func expectCleanupFinished(mock sqlmock.Sqlmock) {
	mock.ExpectExec("UPDATE youtube_imports SET status=\\$3,error=\\$4,credentials=''").WithArgs("import", "lease", "ready", "").WillReturnResult(sqlmock.NewResult(0, 1))
}

func expectRemoteCleanupLock(mock sqlmock.Sqlmock) {
	mock.ExpectBegin()
	expectActiveUser(mock)
	mock.ExpectQuery("SELECT lease_token=\\$2 AND lease_until>now\\(\\) AND cleanup_pending").WithArgs("import", "lease", "owner").WillReturnRows(sqlmock.NewRows([]string{"active"}).AddRow(true))
	mock.ExpectCommit()
}

func TestCompletedOneTimeImportResetsCanonicalAccessType(t *testing.T) {
	resets := 0
	client := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/authorization:reset" {
			t.Errorf("unexpected cleanup request %s", r.URL.Path)
		}
		if r.Header.Get("Authorization") != "Bearer access" {
			t.Error("missing cleanup authorization")
		}
		resets++
		_, _ = io.WriteString(w, `{}`)
	})
	h, mock := mockHandler(t, client)
	expectCleanupLease(mock)
	expectRemoteCleanupLock(mock)
	expectCleanupFinished(mock)
	if err := h.cleanupAuthorization(context.Background(), cleanupWork(), Token{AccessToken: "access", ExpiresAt: time.Now().Add(time.Hour)}); err != nil {
		t.Fatal(err)
	}
	if resets != 1 {
		t.Fatal("one-time consent was not reset")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestLongImportRefreshesBeforeResetAndNeverDownloadsAgain(t *testing.T) {
	var calls []string
	client := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		calls = append(calls, r.URL.Path)
		switch r.URL.Path {
		case "/token":
			_, _ = io.WriteString(w, `{"access_token":"fresh","expires_in":3600,"scope":"`+scopePrefix+PublicVideos+`","token_type":"Bearer"}`)
		case "/v1/authorization:reset":
			if r.Header.Get("Authorization") != "Bearer fresh" {
				t.Error("used an expired token after the download")
			}
			_, _ = io.WriteString(w, `{}`)
		default:
			t.Errorf("cleanup re-entered export or archive import: %s", r.URL.Path)
		}
	})
	h, mock := mockHandler(t, client)
	expectCleanupLease(mock)
	mock.ExpectExec("UPDATE youtube_imports SET credentials=\\$3").WithArgs("import", "lease", sqlmock.AnyArg()).WillReturnResult(sqlmock.NewResult(0, 1))
	expectRemoteCleanupLock(mock)
	expectCleanupFinished(mock)
	if err := h.cleanupAuthorization(context.Background(), cleanupWork(), Token{AccessToken: "expired", RefreshToken: "refresh", Scope: scopePrefix + PublicVideos, ExpiresAt: time.Now().Add(-time.Hour)}); err != nil {
		t.Fatal(err)
	}
	if len(calls) != 2 || calls[0] != "/token" || calls[1] != "/v1/authorization:reset" {
		t.Fatalf("unexpected cleanup sequence: %v", calls)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestResetOutageRetainsGrantAndResumesCleanupOnly(t *testing.T) {
	resets := 0
	client := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/authorization:reset" {
			t.Errorf("cleanup contacted %s", r.URL.Path)
		}
		resets++
		if resets == 1 {
			w.WriteHeader(http.StatusServiceUnavailable)
			_, _ = io.WriteString(w, `{"error":{"code":503,"status":"UNAVAILABLE"}}`)
			return
		}
		_, _ = io.WriteString(w, `{}`)
	})
	h, mock := mockHandler(t, client)
	expectCleanupLease(mock)
	expectRemoteCleanupLock(mock)
	mock.ExpectExec("UPDATE youtube_imports SET lease_token=NULL").WithArgs("import", "lease", float64(60), 1).WillReturnResult(sqlmock.NewResult(0, 1))
	work, token := cleanupWork(), Token{AccessToken: "access", RefreshToken: "refresh", ExpiresAt: time.Now().Add(time.Hour)}
	if err := h.cleanupAuthorization(context.Background(), work, token); err != nil {
		t.Fatal(err)
	}
	work.Attempts = 1
	expectCleanupLease(mock)
	expectRemoteCleanupLock(mock)
	expectCleanupFinished(mock)
	if err := h.cleanupAuthorization(context.Background(), work, token); err != nil {
		t.Fatal(err)
	}
	if resets != 2 {
		t.Fatal("cleanup did not retry after the outage")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestResetUnauthorizedRetainsGrantAndRefreshesNextAttempt(t *testing.T) {
	resets, refreshes := 0, 0
	client := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/token":
			refreshes++
			_, _ = io.WriteString(w, `{"access_token":"fresh","expires_in":3600,"scope":"`+scopePrefix+PublicVideos+`"}`)
		case "/v1/authorization:reset":
			resets++
			if resets == 1 {
				w.WriteHeader(http.StatusUnauthorized)
				_, _ = io.WriteString(w, `{"error":{"code":401,"status":"UNAUTHENTICATED"}}`)
				return
			}
			_, _ = io.WriteString(w, `{}`)
		default:
			t.Errorf("cleanup contacted %s", r.URL.Path)
		}
	})
	h, mock := mockHandler(t, client)
	work := cleanupWork()
	token := Token{AccessToken: "access", RefreshToken: "refresh", Scope: scopePrefix + PublicVideos, ExpiresAt: time.Now().Add(time.Hour)}
	expectCleanupLease(mock)
	expectRemoteCleanupLock(mock)
	mock.ExpectExec("UPDATE youtube_imports SET credentials=\\$3").WithArgs("import", "lease", sqlmock.AnyArg()).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec("UPDATE youtube_imports SET lease_token=NULL").WithArgs("import", "lease", float64(60), 1).WillReturnResult(sqlmock.NewResult(0, 1))
	if err := h.cleanupAuthorization(context.Background(), work, token); err != nil {
		t.Fatal(err)
	}
	token.ExpiresAt = time.Unix(1, 0)
	work.Attempts = 1
	expectCleanupLease(mock)
	mock.ExpectExec("UPDATE youtube_imports SET credentials=\\$3").WithArgs("import", "lease", sqlmock.AnyArg()).WillReturnResult(sqlmock.NewResult(0, 1))
	expectRemoteCleanupLock(mock)
	expectCleanupFinished(mock)
	if err := h.cleanupAuthorization(context.Background(), work, token); err != nil {
		t.Fatal(err)
	}
	if resets != 2 || refreshes != 1 {
		t.Fatalf("unexpected cleanup recovery reset=%d refresh=%d", resets, refreshes)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestRevokedTokenCleanupReleasesNewConsentGuard(t *testing.T) {
	client := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/revoke" {
			t.Errorf("unexpected cleanup %s", r.URL.Path)
		}
		w.WriteHeader(http.StatusBadRequest)
		_, _ = io.WriteString(w, `{"error":"invalid_token"}`)
	})
	h, mock := mockHandler(t, client)
	work := cleanupWork()
	work.AccessType = ""
	expectCleanupLease(mock)
	expectRemoteCleanupLock(mock)
	expectCleanupFinished(mock)
	if err := h.cleanupAuthorization(context.Background(), work, Token{AccessToken: "revoked", ExpiresAt: time.Now().Add(time.Hour)}); err != nil {
		t.Fatal(err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}
