package media

import (
	"context"
	"database/sql"
	"errors"
	"slices"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
)

func cleanupReadyMock(mock sqlmock.Sqlmock, billing, active bool) {
	mock.ExpectQuery("SELECT billing_cancellation_completed FROM account_deletion_requests").WithArgs(testUserID).WillReturnRows(sqlmock.NewRows([]string{"billing"}).AddRow(billing))
	if billing {
		mock.ExpectQuery("SELECT EXISTS\\(SELECT 1 FROM jobs").WithArgs(testUserID).WillReturnRows(sqlmock.NewRows([]string{"active"}).AddRow(active))
	}
}
func cleanupInventory(mock sqlmock.Sqlmock) {
	mock.ExpectQuery("SELECT id,source_file_path,source_video_url,source_storage_key FROM jobs").WithArgs(testUserID).WillReturnRows(sqlmock.NewRows([]string{"id", "file", "url", "key"}).AddRow(testUserID, "/app/media/uploads/"+testUserID+"/video.mp4", "https://evil.invalid/private", "sources/"+testUserID+"/source.mp4"))
	mock.ExpectQuery("SELECT file_path,file_url,file_storage_key,tiktok_file_storage_key,thumbnail_path,thumbnail_url,thumbnail_storage_key FROM clips").WithArgs(testUserID).WillReturnRows(sqlmock.NewRows([]string{"file", "url", "key", "tiktokKey", "thumb", "thumbURL", "thumbKey"}).AddRow("/tmp/work.mp4", "/media/clips/legacy.mp4?sig=x", "clips/stable.mp4", "clips/tiktok/clean.mp4", "/tmp/thumb.jpg", "/media/clips/legacy.jpg?sig=x", "clips/stable.jpg"))
	mock.ExpectQuery("SELECT logo_path,intro_video_path,outro_video_path,watermark_path FROM brand_kits").WithArgs(testUserID).WillReturnRows(sqlmock.NewRows([]string{"logo", "intro", "outro", "watermark"}).AddRow("brand/"+testUserID+"/logo.svg", nil, nil, nil))
}
func TestCleanupRequiresDeletionBillingAndQuiescentWorkers(t *testing.T) {
	for _, scenario := range []string{"missing-marker", "billing", "active"} {
		t.Run(scenario, func(t *testing.T) {
			s, mock, storage, _ := uploadService(t)
			switch scenario {
			case "missing-marker":
				mock.ExpectQuery("SELECT billing_cancellation_completed").WillReturnError(sql.ErrNoRows)
			case "billing":
				cleanupReadyMock(mock, false, false)
			case "active":
				cleanupReadyMock(mock, true, true)
			}
			result, e := s.CleanupAccount(context.Background(), testUserID)
			status, _ := statusFor(e)
			if status != 409 || result.Complete || len(storage.deleted) > 0 || len(storage.prefixes) > 0 {
				t.Fatalf("cleanup proceeded: %+v %v", result, e)
			}
			if e = mock.ExpectationsWereMet(); e != nil {
				t.Fatal(e)
			}
		})
	}
}
func TestCleanupCoversStableLegacyAndUnlinkedNamespaces(t *testing.T) {
	s, mock, storage, _ := uploadService(t)
	s.cfg.LocalRoot = "/app/media"
	cleanupReadyMock(mock, true, false)
	cleanupInventory(mock)
	cleanupReadyMock(mock, true, false)
	result, e := s.CleanupAccount(context.Background(), testUserID)
	if e != nil || !result.Complete {
		t.Fatalf("%+v %v", result, e)
	}
	for _, prefix := range []string{"uploads/" + testUserID + "/", "brand/" + testUserID + "/", "sources/" + testUserID + "/", "clips/" + testUserID + "/", "work/" + testUserID + "/", testUserID + "/clips/"} {
		if !slices.Contains(storage.prefixes, prefix) {
			t.Fatalf("missing prefix %s", prefix)
		}
	}
	for _, key := range []string{"clips/legacy.mp4", "clips/stable.mp4", "clips/tiktok/clean.mp4", "clips/legacy.jpg", "clips/stable.jpg", "brand/" + testUserID + "/logo.svg"} {
		if !slices.Contains(storage.deleted, key) {
			t.Fatalf("missing key %s", key)
		}
	}
	if slices.Contains(storage.deleted, "/tmp/work.mp4") || slices.Contains(storage.deleted, "https://evil.invalid/private") {
		t.Fatal("external reference touched")
	}
	if e = mock.ExpectationsWereMet(); e != nil {
		t.Fatal(e)
	}
}
func TestCleanupDoesNotFinalizeStorageFailureOrReactivatedWork(t *testing.T) {
	for _, scenario := range []string{"storage", "worker"} {
		t.Run(scenario, func(t *testing.T) {
			s, mock, storage, _ := uploadService(t)
			cleanupReadyMock(mock, true, false)
			cleanupInventory(mock)
			expected := 502
			if scenario == "storage" {
				storage.deleteErr = errors.New("store unavailable")
			} else {
				cleanupReadyMock(mock, true, true)
				expected = 409
			}
			result, e := s.CleanupAccount(context.Background(), testUserID)
			status, _ := statusFor(e)
			if result.Complete || status != expected {
				t.Fatalf("cleanup finalized: %+v %v", result, e)
			}
			if e = mock.ExpectationsWereMet(); e != nil {
				t.Fatal(e)
			}
		})
	}
}
