package media

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"testing"
	"time"
)

// Opt-in fixture only: no accounts, database rows or TikTok API calls.
func TestHetznerPublishingDelivery(t *testing.T) {
	storage := hetznerS3ForTest(t)
	filename := os.Getenv("SNEEPCUT_HETZNER_VIDEO_FIXTURE")
	if filename == "" {
		t.Skip("synthetic video fixture required")
	}
	source, err := os.ReadFile(filename)
	if err != nil {
		t.Fatal(err)
	}
	if len(source) < 8<<20 || len(source) > 32<<20 {
		t.Fatal("fixture must be 8–32 MiB")
	}
	var random [16]byte
	if _, err := rand.Read(random[:]); err != nil {
		t.Fatal(err)
	}
	owner := fmt.Sprintf("%x-%x-%x-%x-%x", random[:4], random[4:6], random[6:8], random[8:10], random[10:])
	key := "publishing/" + owner + "/sneepcut-readiness.mp4"
	t.Logf("synthetic object prefix: publishing/%s", owner)
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
		defer cancel()
		if err := storage.Delete(ctx, key); err != nil {
			t.Error("synthetic delivery cleanup failed")
		}
		exists, err := storage.Exists(ctx, key)
		if err != nil || exists {
			t.Error("synthetic delivery cleanup not verified")
		}
	})
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	if err := storage.Save(ctx, filename, key, "video/mp4"); err != nil {
		t.Fatal("synthetic delivery upload failed")
	}
	service, server := deliveryServer(t, storage)
	service.cfg.AppURL = "https://sneepcut.com"
	issued, err := service.PublishingURL(ctx, "tiktok", key)
	if err != nil {
		t.Fatal(err)
	}
	link, _ := url.Parse(issued)
	expires, _ := strconv.ParseInt(link.Query().Get("expires"), 10, 64)
	if link.Host != "sneepcut.com" || link.Scheme != "https" || expires < time.Now().Add(time.Hour).Unix() {
		t.Fatal("owned URL or download lifetime invalid")
	}
	expected := sha256.Sum256(source)
	started := time.Now()
	for _, item := range []struct {
		method, rangeHeader string
		status              int
		size                int
	}{{"GET", "", 200, len(source)}, {"GET", "bytes=1048576-1048831", 206, 256}, {"HEAD", "", 200, 0}} {
		request, _ := http.NewRequestWithContext(ctx, item.method, server.URL+link.RequestURI(), nil)
		request.Header.Set("Range", item.rangeHeader)
		response, err := http.DefaultClient.Do(request)
		if err != nil {
			t.Fatal("owned delivery request failed")
		}
		content, readErr := io.ReadAll(io.LimitReader(response.Body, int64(len(source)+1)))
		response.Body.Close()
		if readErr != nil || response.StatusCode != item.status || len(content) != item.size || response.Header.Get("Location") != "" {
			t.Fatal("owned delivery status, size or redirect check failed")
		}
		if item.method == "GET" && item.rangeHeader == "" && sha256.Sum256(content) != expected {
			t.Fatal("owned delivery hash differs")
		}
		if item.rangeHeader != "" && sha256.Sum256(content) != sha256.Sum256(source[1048576:1048832]) {
			t.Fatal("owned delivery range differs")
		}
		if item.method == "HEAD" && response.ContentLength != int64(len(source)) {
			t.Fatal("owned delivery HEAD length differs")
		}
	}
	t.Logf("PUBLISHING_DELIVERY bytes=%d get_range_head_ms=%d", len(source), time.Since(started).Milliseconds())
}
