package media

import (
	"bytes"
	"context"
	"os"
	"strings"
	"testing"
)

func TestMusicUploadScansAndAuthorizesOwnedReference(t *testing.T) {
	s, mock, storage, _ := uploadService(t)
	activeAccount(mock, "member", false)
	activeAccount(mock, "member", false)
	audio := []byte("fLaCxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx")
	scanned := false
	s.scanner = scannerFunc(func(_ context.Context, file string) error {
		if len(storage.saved) != 0 {
			t.Fatal("stored before scan")
		}
		data, err := os.ReadFile(file)
		if err != nil || !bytes.Equal(data, audio) {
			t.Fatal("scan received different audio", err)
		}
		scanned = true
		return nil
	})
	result, err := s.StoreMusic(context.Background(), testUserID, "song.flac", bytes.NewReader(audio))
	if err != nil || !scanned || result.ContentType != "audio/flac" || !strings.HasPrefix(result.FilePath, "uploads/"+testUserID+"/") {
		t.Fatal(result, err)
	}
	if key, err := s.ValidateMusicUploadSource(context.Background(), testUserID, result.FilePath); err != nil || key != result.FilePath {
		t.Fatal(key, err)
	}
	for _, reference := range []string{strings.Replace(result.FilePath, testUserID, "11111111-1111-4111-8111-111111111111", 1), "uploads/" + testUserID + "/../song.flac", "https://untrusted.invalid/song.mp3"} {
		if _, err := s.ValidateMusicUploadSource(context.Background(), testUserID, reference); err == nil {
			t.Fatal("accepted foreign or unsafe source", reference)
		}
	}
	assertEmptyStage(t, s)
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestMusicUploadFailureLeavesNoPublishedFile(t *testing.T) {
	for _, tc := range []struct {
		name    string
		data    []byte
		scanErr error
	}{
		{"invalid", []byte("this is not FLAC music"), nil},
		{"unsafe", []byte("fLaCxxxxxxxxxxxxxxxxxxxx"), ErrUnsafeUpload},
	} {
		t.Run(tc.name, func(t *testing.T) {
			s, mock, storage, _ := uploadService(t)
			activeAccount(mock, "member", false)
			s.scanner = scannerFunc(func(context.Context, string) error { return tc.scanErr })
			if _, err := s.StoreMusic(context.Background(), testUserID, "song.flac", bytes.NewReader(tc.data)); err == nil || len(storage.saved) > 0 {
				t.Fatal("invalid file stored", err)
			}
			assertEmptyStage(t, s)
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestMusicUploadAccountDeletionCleansStoredAudio(t *testing.T) {
	s, mock, storage, _ := uploadService(t)
	activeAccount(mock, "member", false)
	activeAccount(mock, "member", true)
	_, err := s.StoreMusic(context.Background(), testUserID, "song.wav", strings.NewReader("RIFFxxxxWAVEfmt audio"))
	if err == nil || len(storage.saved) != 1 || len(storage.deleted) != 1 || storage.saved[0] != storage.deleted[0] {
		t.Fatal("account deletion left uploaded music", err)
	}
	assertEmptyStage(t, s)
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}
