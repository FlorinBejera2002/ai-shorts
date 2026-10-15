package media

import (
	"bytes"
	"context"
	"errors"
	"net/http"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"sneepcut/backend-go/internal/testdb"
)

func TestUploadAllowanceUsesCurrentAccountRole(t *testing.T) {
	for _, tc := range []struct {
		name, role, status   string
		activation, deleting bool
		want                 int
	}{
		{"admin", "admin", "active", false, false, 0},
		{"member", "member", "active", false, false, 429},
		{"viewer", "viewer", "active", false, false, 403},
		{"suspended admin", "admin", "suspended", false, false, 403},
		{"unverified admin", "admin", "active", true, false, 403},
		{"deleting admin", "admin", "active", false, true, 409},
	} {
		t.Run(tc.name, func(t *testing.T) {
			s, mock, _, nonce := uploadService(t)
			nonce.limited = true
			mock.ExpectQuery("SELECT access_role, account_status, email_activation_required, EXISTS").WithArgs(testUserID).
				WillReturnRows(sqlmock.NewRows([]string{"role", "status", "activation", "deleting"}).AddRow(tc.role, tc.status, tc.activation, tc.deleting))
			err := s.allow(context.Background(), testUserID, "upload", 1)
			var httpErr *HTTPError
			if tc.want == 0 && err != nil || tc.want != 0 && (!errors.As(err, &httpErr) || httpErr.Status != tc.want) {
				t.Fatalf("got %v, want status %d", err, tc.want)
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestAdminUploadBypassesAllowanceAndPreservesNonce(t *testing.T) {
	s, mock, storage, nonce := uploadService(t)
	nonce.limited = true
	for range 3 {
		activeAccount(mock, "admin", false)
	}
	w := directRequest(s, pythonUploadToken, bytes.NewReader(videoBytes), 16)
	if w.Code != http.StatusCreated || len(storage.saved) != 1 {
		t.Fatalf("admin upload: %d %s", w.Code, w.Body.String())
	}
	activeAccount(mock, "admin", false)
	w = directRequest(s, pythonUploadToken, forbiddenReader{t}, 16)
	if w.Code != http.StatusUnauthorized || len(storage.saved) != 1 {
		t.Fatalf("replay accepted: %d %s", w.Code, w.Body.String())
	}
	// Demotion must apply even to a previously issued upload authorization.
	activeAccount(mock, "member", false)
	w = directRequest(s, pythonUploadToken, forbiddenReader{t}, 16)
	if w.Code != http.StatusTooManyRequests {
		t.Fatalf("demoted account bypassed allowance: %d", w.Code)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestPostgresAdminCanSaveBrandLogo(t *testing.T) {
	db := testdb.Open(t)
	if _, err := db.Exec(`INSERT INTO users(id,email,provider,access_role,credits,plan) VALUES($1,'admin-logo@example.invalid','credentials','admin',0,'free')`, testUserID); err != nil {
		t.Fatal(err)
	}
	s := NewService(Config{}, db, nil, nil, nil)
	key := "brand/" + testUserID + "/logo.png"
	if err := s.setBrandLogo(context.Background(), testUserID, &key); err != nil {
		t.Fatal(err)
	}
	var saved string
	if err := db.QueryRow(`SELECT logo_path FROM brand_kits WHERE user_id=$1`, testUserID).Scan(&saved); err != nil || saved != key {
		t.Fatalf("saved logo: %q %v", saved, err)
	}
	if _, err := db.Exec(`UPDATE users SET account_status='suspended' WHERE id=$1`, testUserID); err != nil {
		t.Fatal(err)
	}
	var denied *HTTPError
	if err := s.setBrandLogo(context.Background(), testUserID, nil); !errors.As(err, &denied) || denied.Status != http.StatusForbidden {
		t.Fatalf("suspended administrator changed logo: %v", err)
	}
}
