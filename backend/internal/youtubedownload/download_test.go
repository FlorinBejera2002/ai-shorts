package youtubedownload

import (
	"context"
	"encoding/json"
	"net/netip"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

func TestCanonicalURL(t *testing.T) {
	for _, raw := range []string{"https://youtu.be/aqz-KE-bpKQ?si=tracking", "https://m.youtube.com/shorts/aqz-KE-bpKQ", "http://youtube.com/watch?v=aqz-KE-bpKQ&list=ignored", "https://www.youtube.com/live/aqz-KE-bpKQ"} {
		got, err := CanonicalURL(raw)
		if err != nil || got != "https://www.youtube.com/watch?v=aqz-KE-bpKQ" {
			t.Fatalf("%s: %s %v", raw, got, err)
		}
	}
	for _, raw := range []string{"file:///etc/passwd", "https://127.0.0.1/watch?v=aqz-KE-bpKQ", "https://youtube.com.evil.invalid/watch?v=aqz-KE-bpKQ", "https://youtube.com@evil.invalid/watch?v=aqz-KE-bpKQ", "https://evil@youtube.com/watch?v=aqz-KE-bpKQ", "https://youtube.com:8443/watch?v=aqz-KE-bpKQ", "https://youtube.com/playlist?list=test", "https://youtube.com/watch?v=aqz-KE-bpKQ&v=xxxxxxxxxxx", "https://youtu.be/aqz-KE-bpKQ/more", "https://youtube.com/watch?v=short"} {
		if _, err := CanonicalURL(raw); err == nil {
			t.Fatalf("accepted %s", raw)
		}
	}
}

func TestNetworkAllowlistRejectsLANAndHostConfusion(t *testing.T) {
	for _, host := range []string{"www.youtube.com", "rr1---sn.example.googlevideo.com", "youtubei.googleapis.com", "i.ytimg.com"} {
		if !allowedHost(host) {
			t.Fatal(host)
		}
	}
	for _, host := range []string{"localhost", "127.0.0.1", "googlevideo.com.evil.invalid", "evilgooglevideo.com", "accounts.google.com", "storage.googleapis.com"} {
		if allowedHost(host) {
			t.Fatal(host)
		}
	}
	for _, raw := range []string{"127.0.0.1", "::1", "::ffff:192.168.1.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.100.100.200", "0.0.0.0", "224.0.0.1", "fc00::1", "2001:db8::1"} {
		if publicIP(netip.MustParseAddr(raw)) {
			t.Fatal(raw)
		}
	}
	if !publicIP(netip.MustParseAddr("8.8.8.8")) || !publicIP(netip.MustParseAddr("2001:4860:4860::8888")) {
		t.Fatal("public addresses rejected")
	}
}

func fakeDownloader(t *testing.T, metadata, download string) Config {
	t.Helper()
	if runtime.GOOS == "windows" {
		t.Skip("executable fixture requires POSIX shell; worker runs on Linux")
	}
	script := filepath.Join(t.TempDir(), "downloader")
	text := "#!/bin/sh\nset -eu\n[ -z \"${AWS_SECRET_ACCESS_KEY:-}\" ] || exit 11\ncase \"$*\" in\n*--dump-single-json*) cat <<'JSON'\n" + metadata + "\nJSON\n;;\n*) " + download + ";;\nesac\n"
	if err := os.WriteFile(script, []byte(text), 0700); err != nil {
		t.Fatal(err)
	}
	return Config{Executable: script}
}

func TestDownloadSelectionIsolationAndLimits(t *testing.T) {
	t.Setenv("AWS_SECRET_ACCESS_KEY", "must-not-reach-child")
	metadata := `{"id":"aqz-KE-bpKQ","duration":30,"height":2160,"requested_formats":[{"filesize":100},{"filesize":20}]}`
	cfg := fakeDownloader(t, metadata, "case \"$*\" in *'bv[height<=2160]+ba/b[height<=2160]'*) ;; *) exit 12;; esac; printf media > source.mp4")
	dest := filepath.Join(t.TempDir(), "video.mp4")
	if err := Download(context.Background(), cfg, "https://youtu.be/aqz-KE-bpKQ", dest); err != nil {
		t.Fatal(err)
	}
	if data, _ := os.ReadFile(dest); string(data) != "media" {
		t.Fatal("download was not materialized")
	}
	cfg = fakeDownloader(t, `{"id":"aqz-KE-bpKQ","duration":30,"height":2160,"filesize":10000000001}`, "exit 15")
	if err := Download(context.Background(), cfg, "https://youtu.be/aqz-KE-bpKQ", filepath.Join(t.TempDir(), "video.mp4")); err == nil || !strings.Contains(err.Error(), "10 GB") {
		t.Fatalf("oversize: %v", err)
	}
	for _, m := range []string{`{"id":"aqz-KE-bpKQ","duration":30,"height":4320}`, `{"id":"aqz-KE-bpKQ","duration":30,"is_live":true}`, `{"id":"differentxx","duration":30}`} {
		cfg = fakeDownloader(t, m, "exit 15")
		if err := Download(context.Background(), cfg, "https://youtu.be/aqz-KE-bpKQ", filepath.Join(t.TempDir(), "video.mp4")); err == nil {
			t.Fatalf("accepted %s", m)
		}
	}
}

func TestActualBytesAndCancellation(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "source.f137.mp4.part"), make([]byte, 20), 0600); err != nil {
		t.Fatal(err)
	}
	if err := checkFiles(dir, 10); err == nil {
		t.Fatal("raw bytes exceeded cap")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()
	cfg := fakeDownloader(t, `{"id":"aqz-KE-bpKQ","duration":30}`, "sleep 20; printf media > source.mp4")
	dest := filepath.Join(t.TempDir(), "video.mp4")
	start := time.Now()
	if err := Download(ctx, cfg, "https://youtu.be/aqz-KE-bpKQ", dest); err == nil || time.Since(start) > 5*time.Second {
		t.Fatalf("cancellation failed: %v", err)
	}
	files, _ := os.ReadDir(filepath.Dir(dest))
	if len(files) != 0 {
		t.Fatal("partial downloads were retained")
	}
}

func TestUnknownSizeDownloadCannotExceedTenGB(t *testing.T) {
	cfg := fakeDownloader(t, `{"id":"aqz-KE-bpKQ","duration":30,"height":2160}`, "truncate -s 10000000001 source.mp4")
	dest := filepath.Join(t.TempDir(), "video.mp4")
	if err := Download(context.Background(), cfg, "https://youtu.be/aqz-KE-bpKQ", dest); err == nil || !strings.Contains(err.Error(), "10 GB") {
		t.Fatalf("unknown size bypassed cap: %v", err)
	}
	files, _ := os.ReadDir(filepath.Dir(dest))
	if len(files) != 0 {
		t.Fatal("oversized download retained partial files")
	}
}

// Opt-in network lane. It exercises the exact downloader/proxy command, rather
// than replacing it with a direct yt-dlp invocation or fixture executable.
func TestPublicYouTubeDownload(t *testing.T) {
	url := os.Getenv("SNEEPCUT_TEST_YOUTUBE_URL")
	if url == "" {
		t.Skip("set SNEEPCUT_TEST_YOUTUBE_URL to an authorized public fixture")
	}
	dest := filepath.Join(t.TempDir(), "source.mp4")
	if err := Download(context.Background(), Config{}, url, dest); err != nil {
		t.Fatal(err)
	}
	stat, err := os.Stat(dest)
	if err != nil {
		t.Fatal(err)
	}
	output, err := exec.Command("ffprobe", "-v", "error", "-show_entries", "stream=codec_type,width,height", "-of", "json", dest).Output()
	if err != nil {
		t.Fatal(err)
	}
	var info struct {
		Streams []struct {
			Type          string `json:"codec_type"`
			Width, Height int
		}
	}
	if err = json.Unmarshal(output, &info); err != nil {
		t.Fatal(err)
	}
	video, audio := false, false
	for _, stream := range info.Streams {
		if stream.Type == "video" {
			video = true
			if stream.Height > MaxHeight || stream.Height <= 0 {
				t.Fatalf("resolution %+v", stream)
			}
			t.Logf("Decoded source dimensions: %dx%d", stream.Width, stream.Height)
		}
		if stream.Type == "audio" {
			audio = true
		}
	}
	if !video || !audio || stat.Size() > MaxBytes {
		t.Fatalf("invalid downloaded source: %d bytes", stat.Size())
	}
	t.Logf("Downloaded and probed %d bytes through the restricted proxy", stat.Size())
}
