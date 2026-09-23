package media

import (
	"bytes"
	"context"
	"errors"
	"os"
	"strings"
	"testing"
)

func TestNarrationUploadScansBeforeStorageAndKeepsVideoContract(t *testing.T) {
	s, mock, storage, _ := uploadService(t)
	activeAccount(mock, "member", false)
	activeAccount(mock, "member", false)
	audio := []byte("RIFFxxxxWAVEfmt test-only-container")
	scanned := false
	s.scanner = scannerFunc(func(_ context.Context, filename string) error {
		if len(storage.saved) != 0 {
			t.Fatal("published before scan")
		}
		data, err := os.ReadFile(filename)
		if err != nil || !bytes.Equal(data, audio) {
			t.Fatal("scanner did not receive original upload", err)
		}
		scanned = true
		return nil
	})
	result, err := s.StoreNarration(context.Background(), testUserID, "My voice.wav", bytes.NewReader(audio))
	if err != nil || !scanned || result.ContentType != "audio/wav" || !bytes.Equal(storage.data[result.FilePath], audio) {
		t.Fatal(result, err)
	}
	if _, err = s.ValidateNarrationUploadSource(context.Background(), testUserID, result.FilePath); err != nil {
		t.Fatal(err)
	}
	if _, err = s.ValidateNarrationUploadSource(context.Background(), testUserID, strings.Replace(result.FilePath, testUserID, "11111111-1111-4111-8111-111111111111", 1)); err == nil {
		t.Fatal("foreign recording accepted")
	}
	if _, err = s.ValidateUploadSource(context.Background(), testUserID, result.FilePath); err == nil {
		t.Fatal("audio accepted in video-only pipeline")
	}
	assertEmptyStage(t, s)
	if err = mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestNarrationRejectsForgedUnsafeAndOversizedBodies(t *testing.T) {
	for _, tc := range []struct {
		name    string
		data    []byte
		scanErr error
		maximum int64
	}{
		{"forged", []byte("this is not a webm audio file"), nil, 1024},
		{"unsafe", append([]byte("\x1a\x45\xdf\xa3"), make([]byte, 32)...), ErrUnsafeUpload, 1024},
		{"oversized", append([]byte("\x1a\x45\xdf\xa3"), make([]byte, 32)...), nil, 16},
	} {
		t.Run(tc.name, func(t *testing.T) {
			s, _, storage, _ := uploadService(t)
			s.scanner = scannerFunc(func(context.Context, string) error { return tc.scanErr })
			_, _, err := s.stageValidated(context.Background(), bytes.NewReader(tc.data), tc.maximum, 0, ".webm", looksLikeNarration, "Invalid audio container")
			if err == nil || len(storage.saved) != 0 {
				t.Fatal("invalid audio escaped quarantine", err)
			}
			if tc.scanErr != nil && !errors.Is(err, tc.scanErr) {
				t.Fatal(err)
			}
			assertEmptyStage(t, s)
		})
	}
}

func TestNarrationUploadDeletionRaceCleansStoredRecording(t *testing.T) {
	s, mock, storage, _ := uploadService(t)
	activeAccount(mock, "member", false)
	activeAccount(mock, "member", true)
	_, err := s.StoreNarration(context.Background(), testUserID, "voice.wav", strings.NewReader("RIFFxxxxWAVEfmt audio"))
	if err == nil || len(storage.saved) != 1 || len(storage.deleted) != 1 || storage.saved[0] != storage.deleted[0] {
		t.Fatal("recording survived account deletion", err)
	}
	assertEmptyStage(t, s)
	if err = mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestNarrationContainerSignatures(t *testing.T) {
	for _, tc := range []struct{ suffix, header string }{
		{".webm", "\x1a\x45\xdf\xa3xxxxxxxxxxxx"}, {".ogg", "OggSxxxxxxxxxxxx"}, {".opus", "OggSxxxxxxxxxxxx"},
		{".m4a", "\x00\x00\x00\x20ftypM4A xxxxx"}, {".mp4", "\x00\x00\x00\x20ftypisomxxxx"},
		{".wav", "RIFFxxxxWAVEfmt "}, {".mp3", "ID3xxxxxxxxxxxxx"}, {".mp3", "\xff\xfbxxxxxxxxxxxxxx"},
	} {
		if !looksLikeNarration([]byte(tc.header), tc.suffix) {
			t.Fatal("supported audio container rejected", tc.suffix)
		}
	}
	if looksLikeNarration([]byte("RIFFxxxxWEBPxxxx"), ".wav") || looksLikeNarration([]byte("OggSxxxxxxxxxxxx"), ".mp3") {
		t.Fatal("mismatched container accepted")
	}
}
