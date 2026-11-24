package media

import (
	"bytes"
	"context"
	"strings"
	"testing"
)

func TestImportPreviewIsStoredInOwnedUploadPrefix(t *testing.T) {
	s, mock, storage, _ := uploadService(t)
	activeAccount(mock, "member", false)
	jpeg := []byte{0xff, 0xd8, 0xff, 0xe0, 'p', 'r', 'e', 'v'}
	key, err := s.StoreImportPreview(context.Background(), testUserID, jpeg)
	if err != nil || !strings.HasPrefix(key, "uploads/"+testUserID+"/") || !strings.HasSuffix(key, "-preview.jpg") || !bytes.Equal(storage.data[key], jpeg) {
		t.Fatalf("invalid preview storage: %q %v", key, err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestImportPreviewRejectsNonJPEGFrames(t *testing.T) {
	s, _, storage, _ := uploadService(t)
	if _, err := s.StoreImportPreview(context.Background(), testUserID, []byte("<html>")); err == nil {
		t.Fatal("accepted a non-JPEG preview")
	}
	if len(storage.saved) != 0 {
		t.Fatal("rejected preview was stored")
	}
}
