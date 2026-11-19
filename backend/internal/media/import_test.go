package media

import (
	"bytes"
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
)

func TestImportedVideoUsesScannedOwnedUpload(t *testing.T) {
	s, mock, storage, _ := uploadService(t)
	for range 3 {
		activeAccount(mock, "member", false)
	}
	scanned := false
	s.scanner = scannerFunc(func(context.Context, string) error {
		if len(storage.saved) != 0 {
			t.Fatal("import published before malware scanning")
		}
		scanned = true
		return nil
	})
	result, err := s.StoreImportedVideo(context.Background(), testUserID, UploadIntent{
		FileName: "My sermon.mp4", FileSize: int64(len(videoBytes)), ContentType: "video/mp4",
	}, bytes.NewReader(videoBytes))
	if err != nil || !scanned || !strings.HasPrefix(result.FilePath, "uploads/"+testUserID+"/") || !bytes.Equal(storage.data[result.FilePath], videoBytes) {
		t.Fatalf("invalid owned import: %#v %v", result, err)
	}
	assertEmptyStage(t, s)
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestImportedVideoRejectsUntrustedAndIncompleteFiles(t *testing.T) {
	for _, test := range []struct {
		name string
		body []byte
		size int64
	}{
		{"bad signature", []byte("not really a movie"), 18},
		{"truncated file", videoBytes, int64(len(videoBytes) + 1)},
	} {
		t.Run(test.name, func(t *testing.T) {
			s, mock, storage, _ := uploadService(t)
			activeAccount(mock, "member", false)
			_, err := s.StoreImportedVideo(context.Background(), testUserID, UploadIntent{FileName: "video.mp4", FileSize: test.size, ContentType: "video/mp4"}, bytes.NewReader(test.body))
			if err == nil || len(storage.saved) != 0 {
				t.Fatal("untrusted import was stored", err)
			}
			assertEmptyStage(t, s)
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestImportedVideoRemovalKeepsReferencedSources(t *testing.T) {
	for _, used := range []bool{true, false} {
		t.Run(map[bool]string{true: "project still uses source", false: "unreferenced source"}[used], func(t *testing.T) {
			s, mock, storage, _ := uploadService(t)
			key := "uploads/" + testUserID + "/original.mp4"
			mock.ExpectBegin()
			mock.ExpectQuery("SELECT id FROM users").WithArgs(testUserID).WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(testUserID))
			mock.ExpectQuery("SELECT EXISTS\\(SELECT 1 FROM jobs").WithArgs(testUserID, key).WillReturnRows(sqlmock.NewRows([]string{"used"}).AddRow(used))
			mock.ExpectCommit()
			if err := s.RemoveImportedVideo(context.Background(), testUserID, key); err != nil {
				t.Fatal(err)
			}
			if used && len(storage.deleted) != 0 || !used && (len(storage.deleted) != 1 || storage.deleted[0] != key) {
				t.Fatalf("unsafe source removal: %#v", storage.deleted)
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatal(err)
			}
		})
	}
	s, _, _, _ := uploadService(t)
	if err := s.RemoveImportedVideo(context.Background(), testUserID, "uploads/00000000-0000-0000-0000-000000000999/other.mp4"); !errors.Is(err, ErrInvalidKey) {
		t.Fatal("foreign import source accepted", err)
	}
}
