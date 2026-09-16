package media

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestStorageReferencesRejectTraversalAndForeignOrigins(t *testing.T) {
	for _, tc := range []struct{ reference, key string }{
		{"/app/media/clips/job/clip.mp4", "clips/job/clip.mp4"}, {"/media/clips/job/clip.mp4?expires=1&sig=x", "clips/job/clip.mp4"}, {"https://cdn.example/media/clips/job/clip.mp4?signature=x", "clips/job/clip.mp4"}, {"https://app.example/media/clips/job/clip.mp4?expires=1&sig=x", "clips/job/clip.mp4"},
		{"https://cdn.example.evil/media/clip.mp4", ""}, {"https://cdn.example/media2/clip.mp4", ""}, {"https://cdn.example:443/media/clip.mp4", ""}, {"https://evil.example/media/clip.mp4", ""}, {"https://user:pass@cdn.example/media/clip.mp4", ""}, {"/etc/passwd", ""}, {"../secret", ""}, {"/app/media/../secret", ""}, {"clips/../secret", ""}, {"clips/%2e%2e/secret", ""}, {"clips/a\\secret", ""}, {"clips//file.mp4", ""}, {"/app/media", ""}, {"/app/media2/key", ""},
	} {
		key, e := keyFromReference(tc.reference, "/app/media", "https://cdn.example/media", "https://app.example")
		if key != tc.key || (e != nil) != (tc.key == "") {
			t.Errorf("%q => %q %v", tc.reference, key, e)
		}
	}
}
func TestLocalStorageConfinementAndScopedCleanup(t *testing.T) {
	ctx := context.Background()
	root := t.TempDir()
	storage, e := NewLocalStorage(root)
	if e != nil {
		t.Fatal(e)
	}
	defer storage.Close()
	source := filepath.Join(t.TempDir(), "source")
	_ = os.WriteFile(source, []byte("video"), 0600)
	for _, key := range []string{"clips/job-1/clip.mp4", "clips/job-10/clip.mp4"} {
		if e := storage.Save(ctx, source, key, "video/mp4"); e != nil {
			t.Fatal(e)
		}
	}
	if e := storage.Save(ctx, source, "clips/job-1/clip.mp4", "video/mp4"); e == nil {
		t.Fatal("existing object overwritten")
	}
	if count, e := storage.DeletePrefix(ctx, "clips/job-1/"); e != nil || count != 1 {
		t.Fatalf("delete: %d %v", count, e)
	}
	if exists, e := storage.Exists(ctx, "clips/job-10/clip.mp4"); e != nil || !exists {
		t.Fatal("adjacent namespace deleted")
	}
	if size, e := storage.Size(ctx, "clips/job-10/clip.mp4"); e != nil || size != 5 {
		t.Fatalf("incorrect stored size: %d %v", size, e)
	}
	for _, key := range []string{"", ".", "..", "../outside", "clips/../../outside"} {
		if _, e := storage.DeletePrefix(ctx, key); e == nil {
			t.Fatalf("unsafe delete %q", key)
		}
	}
	outside := t.TempDir()
	_ = os.WriteFile(filepath.Join(outside, "secret"), []byte("secret"), 0600)
	if e = os.Symlink(outside, filepath.Join(root, "escape")); e != nil {
		t.Fatal(e)
	}
	if _, e := storage.Exists(ctx, "escape/secret"); e == nil {
		t.Fatal("followed symlink outside root")
	}
	if _, e := storage.Size(ctx, "escape/secret"); e == nil {
		t.Fatal("read size outside root")
	}
	if e := storage.Save(ctx, source, "escape/evil.mp4", "video/mp4"); e == nil {
		t.Fatal("wrote outside root")
	}
	if _, e := storage.DeletePrefix(ctx, "escape"); e == nil {
		t.Fatal("deleted symlink")
	}
	if e = os.Symlink("clips/job-10", filepath.Join(root, "alias")); e != nil {
		t.Fatal(e)
	}
	if _, e = storage.Exists(ctx, "alias/clip.mp4"); e == nil {
		t.Fatal("followed cross-owner in-root symlink")
	}
	if _, e := os.Stat(filepath.Join(outside, "secret")); e != nil {
		t.Fatal("outside file lost")
	}
}
func TestServiceRefreshesSignedURLsAndValidatesOwnedUploads(t *testing.T) {
	root := t.TempDir()
	storage, _ := NewLocalStorage(root)
	defer storage.Close()
	s := NewService(Config{LocalRoot: root, AppURL: "https://app.example", SigningSecret: "secret"}, nil, storage, nil, nil)
	s.now = func() time.Time { return testNow }
	source := filepath.Join(t.TempDir(), "source")
	_ = os.WriteFile(source, []byte("video"), 0600)
	key := "uploads/" + testUserID + "/clip.mp4"
	if e := storage.Save(context.Background(), source, key, "video/mp4"); e != nil {
		t.Fatal(e)
	}
	if got, e := s.ValidateUploadSource(context.Background(), testUserID, filepath.Join(root, key)); e != nil || got != key {
		t.Fatalf("validate: %s %v", got, e)
	}
	if _, e := s.ValidateUploadSource(context.Background(), "00000000-0000-0000-0000-000000000124", key); e == nil {
		t.Fatal("accepted foreign source")
	}
	first, e := s.SignedURL(context.Background(), key)
	if e != nil {
		t.Fatal(e)
	}
	s.now = func() time.Time { return testNow.Add(time.Hour) }
	second, e := s.SignedURL(context.Background(), key)
	if e != nil || first == second {
		t.Fatal("read URL not refreshed")
	}
	if got, e := s.WorkerSource(context.Background(), key); e != nil || got != filepath.Join(storage.directory, key) {
		t.Fatalf("worker source: %q %v", got, e)
	}
}
