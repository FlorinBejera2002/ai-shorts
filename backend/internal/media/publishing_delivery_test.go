package media

import (
	"bytes"
	"context"
	"github.com/julienschmidt/httprouter"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

type deliveryStorage struct {
	Storage
	address string
	calls   atomic.Int32
}

func (s *deliveryStorage) SignedURL(context.Context, string, time.Duration) (string, error) {
	s.calls.Add(1)
	return s.address, nil
}

type deliveryAuth struct{}

func (deliveryAuth) Require(h http.HandlerFunc) http.Handler       { return h }
func (deliveryAuth) RequireMember(h http.HandlerFunc) http.Handler { return h }
func deliveryServer(t *testing.T, storage Storage) (*Service, *httptest.Server) {
	t.Helper()
	s := NewService(Config{SigningSecret: "synthetic-delivery-secret"}, nil, storage, nil, nil)
	router := httprouter.New()
	NewHandler(s, deliveryAuth{}).Register(router)
	server := httptest.NewServer(router)
	t.Cleanup(server.Close)
	s.cfg.AppURL = server.URL
	return s, server
}

func TestPublishingDeliveryStreamsRangesAndHeadWithoutForwardingCredentials(t *testing.T) {
	payload := []byte("0123456789abcdef")
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "" || r.Header.Get("Cookie") != "" || r.Header.Get("X-Forwarded-For") != "" {
			t.Error("client credentials forwarded to storage")
		}
		if r.Method != http.MethodGet {
			t.Error("GET signature used with a different method")
		}
		w.Header().Set("Set-Cookie", "private=secret")
		w.Header().Set("Location", "https://storage.invalid/?private=secret")
		w.Header().Set("ETag", `"synthetic"`)
		http.ServeContent(w, r, "clip.mp4", time.Time{}, bytes.NewReader(payload))
	}))
	defer upstream.Close()
	storage := &deliveryStorage{address: upstream.URL + "?private=secret"}
	s, _ := deliveryServer(t, storage)
	link, err := s.PublishingURL(context.Background(), "tiktok", "clips/job/clip 映像.mp4")
	if err != nil {
		t.Fatal(err)
	}
	for _, test := range []struct {
		method, rangeHeader string
		status              int
		body                string
	}{{"GET", "", 200, string(payload)}, {"GET", "bytes=3-7", 206, "34567"}, {"GET", "bytes=99-100", 416, ""}, {"HEAD", "", 200, ""}} {
		request, _ := http.NewRequest(test.method, link, nil)
		request.Header.Set("Range", test.rangeHeader)
		request.Header.Set("Cookie", "session=secret")
		request.Header.Set("Authorization", "Bearer secret")
		response, err := http.DefaultClient.Do(request)
		if err != nil {
			t.Fatal(err)
		}
		body, _ := io.ReadAll(response.Body)
		response.Body.Close()
		if response.StatusCode != test.status || string(body) != test.body {
			t.Fatalf("%s %s: status=%d body=%q", test.method, test.rangeHeader, response.StatusCode, body)
		}
		if response.Header.Get("Location") != "" || response.Header.Get("Set-Cookie") != "" || response.Header.Get("Cache-Control") != "private, no-store" {
			t.Fatal("private storage headers escaped")
		}
		if test.rangeHeader == "bytes=3-7" && response.Header.Get("Content-Range") != "bytes 3-7/16" {
			t.Fatal("range metadata lost")
		}
		if test.method == "HEAD" && response.ContentLength != int64(len(payload)) {
			t.Fatal("HEAD size lost")
		}
	}
	normal, err := s.PublishingURL(context.Background(), "instagram", "clips/job/clip.mp4")
	if err != nil || normal != storage.address {
		t.Fatal("other providers no longer use storage URLs")
	}
}

func TestPublishingDeliveryRejectsInvalidCapabilitiesBeforeStorage(t *testing.T) {
	storage := &deliveryStorage{address: "https://storage.invalid/private"}
	s, server := deliveryServer(t, storage)
	link, err := s.PublishingURL(context.Background(), "tiktok", "publishing/owner/photo.jpg")
	if err != nil {
		t.Fatal(err)
	}
	parsed, _ := url.Parse(link)
	tests := []string{server.URL + parsed.Path, link + "&sig=duplicate", link + "&expires=1", link + "&source=https://evil.invalid", strings.Replace(link, "photo.jpg", "other.jpg", 1), strings.Replace(link, "/publish/", "/", 1)}
	for _, key := range []string{"uploads/owner/source.mp4", "clips/../secret.mp4", "clips/job/unsupported.svg"} {
		if _, err := s.PublishingURL(context.Background(), "tiktok", key); err == nil {
			t.Fatal("invalid publishing key signed")
		}
		p := "/media/publish/" + key
		tests = append(tests, server.URL+p+"?expires=2000000000&sig="+SignMediaPath(s.cfg.SigningSecret, p, 2000000000))
	}
	expired := *parsed
	q := expired.Query()
	q.Set("expires", "1")
	q.Set("sig", SignMediaPath(s.cfg.SigningSecret, parsed.Path, 1))
	expired.RawQuery = q.Encode()
	tests = append(tests, expired.String())
	client := &http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	for _, address := range tests {
		response, err := client.Get(address)
		if err != nil {
			t.Fatal(err)
		}
		response.Body.Close()
		if response.StatusCode < 400 {
			t.Fatalf("invalid capability accepted: %d", response.StatusCode)
		}
	}
	if storage.calls.Load() != 0 {
		t.Fatal("invalid signature reached storage")
	}
	request, _ := http.NewRequest("POST", link, nil)
	response, err := client.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	response.Body.Close()
	if response.StatusCode != 405 {
		t.Fatal("write method accepted")
	}
}

func TestPublishingDeliveryLocalStorageAndRedirectDenial(t *testing.T) {
	local, err := NewLocalStorage(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer local.Close()
	filename := filepath.Join(local.directory, "clips", "job", "clip.mp4")
	if err := os.MkdirAll(filepath.Dir(filename), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filename, []byte("local bytes"), 0600); err != nil {
		t.Fatal(err)
	}
	s, _ := deliveryServer(t, local)
	link, _ := s.PublishingURL(context.Background(), "tiktok", "clips/job/clip.mp4")
	response, err := http.Get(link)
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(response.Body)
	response.Body.Close()
	if response.StatusCode != 200 || string(body) != "local bytes" {
		t.Fatal("local delivery failed")
	}
	var followed atomic.Bool
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { followed.Store(true) }))
	defer target.Close()
	redirect := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { http.Redirect(w, r, target.URL+"?signature=secret", 302) }))
	defer redirect.Close()
	s.Storage = &deliveryStorage{address: redirect.URL}
	response, err = http.Get(link)
	if err != nil {
		t.Fatal(err)
	}
	body, _ = io.ReadAll(response.Body)
	response.Body.Close()
	if response.StatusCode != 502 || followed.Load() || response.Header.Get("Location") != "" || strings.Contains(string(body), "secret") {
		t.Fatal("storage redirect or private address escaped")
	}
}

func TestPublishingDeliveryCancelsStorageWhenCallerDisconnects(t *testing.T) {
	stopped := make(chan struct{})
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer close(stopped)
		for {
			if _, err := w.Write(make([]byte, 64*1024)); err != nil {
				return
			}
			w.(http.Flusher).Flush()
			select {
			case <-r.Context().Done():
				return
			default:
			}
		}
	}))
	defer upstream.Close()
	service, _ := deliveryServer(t, &deliveryStorage{address: upstream.URL})
	link, _ := service.PublishingURL(context.Background(), "tiktok", "clips/job/video.mp4")
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	request, _ := http.NewRequestWithContext(ctx, http.MethodGet, link, nil)
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	_, err = io.ReadFull(response.Body, make([]byte, 1))
	if err != nil {
		t.Fatal(err)
	}
	cancel()
	response.Body.Close()
	select {
	case <-stopped:
	case <-time.After(3 * time.Second):
		t.Fatal("disconnected caller left storage transfer running")
	}
}
