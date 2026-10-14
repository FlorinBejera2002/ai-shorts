package media

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

type fontObjectStorage struct {
	Storage
	address string
}

func (s fontObjectStorage) SignedURL(context.Context, string, time.Duration) (string, error) {
	return s.address, nil
}

func TestPrivateFontObjectStorageIsBoundedAndUsesNoUserCredentials(t *testing.T) {
	expected := []byte("synthetic stored font bytes")
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "" || r.Header.Get("Cookie") != "" {
			t.Error("user credentials forwarded to object storage")
		}
		if r.URL.Path == "/large" {
			_, _ = w.Write(bytes.Repeat([]byte{1}, (8<<20)+1))
			return
		}
		_, _ = w.Write(expected)
	}))
	defer server.Close()
	service := &Service{Storage: fontObjectStorage{address: server.URL}}
	actual, err := service.readFontAsset(context.Background(), "fonts/owner/font.ttf")
	if err != nil || !bytes.Equal(actual, expected) {
		t.Fatalf("object storage font %q %v", actual, err)
	}
	service.Storage = fontObjectStorage{address: server.URL + "/large"}
	if _, err = service.readFontAsset(context.Background(), "fonts/owner/font.ttf"); err == nil {
		t.Fatal("oversized stored resource accepted")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err = service.readFontAsset(ctx, "fonts/owner/font.ttf"); err == nil {
		t.Fatal("cancelled font request completed")
	}
}
