package jobs

import (
	"context"
	"errors"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
)

func TestRemovedImportCannotBeQueuedAfterUploadValidation(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	user, key := "user", "uploads/user/import.mp4"
	mock.ExpectBegin()
	mock.ExpectQuery("SELECT credits,access_role,account_status,email_activation_required FROM users").WithArgs(user).
		WillReturnRows(sqlmock.NewRows([]string{"credits", "role", "status", "activation"}).AddRow(100, "member", "active", false))
	mock.ExpectQuery("SELECT EXISTS\\(SELECT 1 FROM account_deletion_requests").WithArgs(user).
		WillReturnRows(sqlmock.NewRows([]string{"deleting"}).AddRow(false))
	mock.ExpectExec("UPDATE users SET credits=credits-\\$2").WithArgs(user, 10).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectQuery("SELECT EXISTS\\(SELECT 1 FROM youtube_import_videos").WithArgs(user, key).
		WillReturnRows(sqlmock.NewRows([]string{"removed"}).AddRow(true))
	mock.ExpectRollback()
	_, err = NewRepository(db).Create(context.Background(), user, []Prepared{{Input: CreateInput{
		SourceType: "upload", SourceStorageKey: &key, Options: Options{NumClips: 1},
	}}})
	if !errors.Is(err, ErrRemovedSource) {
		t.Fatal("removed source queued", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
	w := httptest.NewRecorder()
	failure(w, ErrRemovedSource)
	if w.Code != 400 || !strings.Contains(w.Body.String(), "removed") {
		t.Fatalf("missing useful error: %d %s", w.Code, w.Body.String())
	}
}
