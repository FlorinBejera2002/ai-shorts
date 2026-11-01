package media

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

type migrationStorage struct {
	Storage
	objects map[string][]byte
	server  *httptest.Server
	writes  int
	corrupt bool
}

func (s *migrationStorage) Exists(_ context.Context, key string) (bool, error) {
	_, exists := s.objects[key]
	return exists, nil
}
func (s *migrationStorage) Save(_ context.Context, filename, key, _ string) error {
	value, err := os.ReadFile(filename)
	if err != nil {
		return err
	}
	s.writes++
	s.objects[key] = value
	return nil
}
func (s *migrationStorage) SignedURL(_ context.Context, key string, _ time.Duration) (string, error) {
	return s.server.URL + "?key=" + url.QueryEscape(key), nil
}
func migrationFixture(t *testing.T) (*LocalStorage, *migrationStorage) {
	t.Helper()
	local, err := NewLocalStorage(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { local.Close() })
	remote := &migrationStorage{objects: map[string][]byte{}}
	remote.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if remote.corrupt {
			_, _ = w.Write([]byte("corrupt"))
			return
		}
		value, ok := remote.objects[r.URL.Query().Get("key")]
		if !ok {
			http.NotFound(w, r)
			return
		}
		_, _ = w.Write(value)
	}))
	t.Cleanup(remote.server.Close)
	return local, remote
}

func TestMigrateLocalPreservesKeysOriginalsAndVerifiesRetries(t *testing.T) {
	local, remote := migrationFixture(t)
	key := "uploads/fixture/clip ü.mp4"
	filename := filepath.Join(local.directory, filepath.FromSlash(key))
	if err := os.MkdirAll(filepath.Dir(filename), 0750); err != nil {
		t.Fatal(err)
	}
	content := []byte{0, 255, 10, 42}
	if err := os.WriteFile(filename, content, 0600); err != nil {
		t.Fatal(err)
	}
	result, err := MigrateLocal(context.Background(), local, remote)
	if err != nil || result.Copied != 1 || result.Existing != 0 || result.Bytes != 4 {
		t.Fatalf("copy: %+v %v", result, err)
	}
	result, err = MigrateLocal(context.Background(), local, remote)
	if err != nil || result.Existing != 1 || remote.writes != 1 || !bytes.Equal(remote.objects[key], content) {
		t.Fatalf("retry overwrote an existing object: %+v %v", result, err)
	}
	if original, err := os.ReadFile(filename); err != nil || !bytes.Equal(original, content) {
		t.Fatal("original was removed or changed")
	}
	if err := os.WriteFile(filename, []byte("different"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := MigrateLocal(context.Background(), local, remote); err == nil || remote.writes != 1 {
		t.Fatal("conflicting bytes were accepted or replaced")
	}
}

func TestMigrateLocalRejectsLinksBeforePublishingAndDetectsBadCopies(t *testing.T) {
	local, remote := migrationFixture(t)
	if err := os.WriteFile(filepath.Join(local.directory, "first.mp4"), []byte("original"), 0600); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(local.directory, "last.mp4")
	if err := os.Symlink("first.mp4", link); err != nil {
		t.Fatal(err)
	}
	if _, err := MigrateLocal(context.Background(), local, remote); err == nil || remote.writes != 0 {
		t.Fatal("link preflight published media")
	}
	if err := os.Remove(link); err != nil {
		t.Fatal(err)
	}
	remote.corrupt = true
	if _, err := MigrateLocal(context.Background(), local, remote); err == nil || !strings.Contains(err.Error(), "destination bytes differ") {
		t.Fatal("corrupt copy was accepted")
	}
	if _, err := os.Stat(filepath.Join(local.directory, "first.mp4")); err != nil {
		t.Fatal("failed verification removed original")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := MigrateLocal(ctx, local, remote); err == nil {
		t.Fatal("cancelled migration proceeded")
	}
}
