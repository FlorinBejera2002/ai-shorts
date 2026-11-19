package youtubeimport

import (
	"archive/tar"
	"archive/zip"
	"bytes"
	"compress/gzip"
	"context"
	"encoding/binary"
	"errors"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/netip"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

type archiveEntry struct {
	name string
	data string
	mode os.FileMode
}

func fixtureZIP(t *testing.T, entries ...archiveEntry) []byte {
	t.Helper()
	var buffer bytes.Buffer
	writer := zip.NewWriter(&buffer)
	for _, entry := range entries {
		header := &zip.FileHeader{Name: entry.name, Method: zip.Deflate}
		mode := entry.mode
		if mode == 0 {
			mode = 0600
		}
		header.SetMode(mode)
		file, err := writer.CreateHeader(header)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := io.WriteString(file, entry.data); err != nil {
			t.Fatal(err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	return buffer.Bytes()
}

func fixtureTarGzip(t *testing.T, entries ...archiveEntry) []byte {
	t.Helper()
	var buffer bytes.Buffer
	gzipWriter := gzip.NewWriter(&buffer)
	writer := tar.NewWriter(gzipWriter)
	for _, entry := range entries {
		header := &tar.Header{Name: entry.name, Mode: 0600, Size: int64(len(entry.data)), Typeflag: tar.TypeReg}
		if entry.mode&os.ModeSymlink != 0 {
			header.Typeflag, header.Linkname, header.Size = tar.TypeSymlink, "../target.mp4", 0
		}
		if err := writer.WriteHeader(header); err != nil {
			t.Fatal(err)
		}
		if header.Size > 0 {
			if _, err := io.WriteString(writer, entry.data); err != nil {
				t.Fatal(err)
			}
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	if err := gzipWriter.Close(); err != nil {
		t.Fatal(err)
	}
	return buffer.Bytes()
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (call roundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return call(request)
}

func archiveFixtureClient(t *testing.T, archives map[string][]byte) *Client {
	t.Helper()
	jar, _ := cookiejar.New(nil)
	storage, _ := url.Parse("https://storage.googleapis.com")
	jar.SetCookies(storage, []*http.Cookie{{Name: "private", Value: "cookie"}})
	client, err := NewClient(ClientConfig{
		ClientID: "client", ClientSecret: "secret", RedirectURL: "https://app.example/callback",
		HTTPClient: &http.Client{Jar: jar, Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
			if request.Header.Get("Authorization") != "" || request.Header.Get("Cookie") != "" {
				t.Error("credentials leaked to archive storage")
			}
			data, exists := archives[request.URL.Path]
			if !exists {
				return nil, errors.New("unexpected URL: " + request.URL.String())
			}
			return &http.Response{StatusCode: 200, Header: make(http.Header), ContentLength: int64(len(data)), Body: io.NopCloser(bytes.NewReader(data))}, nil
		})},
	})
	if err != nil {
		t.Fatal(err)
	}
	return client
}

func TestArchiveImportMatchesMetadataAcrossPartsAndCleansFiles(t *testing.T) {
	video := "\x00\x00\x00\x18ftypmp42example-original-video"
	client := archiveFixtureClient(t, map[string][]byte{
		"/export/video.zip":    fixtureZIP(t, archiveEntry{name: "Takeout/YouTube/videos/_6f6RnHmde0.mp4", data: video}),
		"/export/metadata.zip": fixtureZIP(t, archiveEntry{name: "Takeout/YouTube/videos.csv", data: "Video ID,Video Title (Original)\n_6f6RnHmde0,Nu aștepta să fii perfect\n"}),
	})
	tempRoot := t.TempDir()
	var emitted []ImportedVideo
	err := client.ImportArchives(context.Background(), []string{"https://storage.googleapis.com/export/video.zip?signature=one", "https://storage.googleapis.com/export/metadata.zip?signature=two"}, tempRoot, ArchiveLimits{}, func(ctx context.Context, imported ImportedVideo) error {
		if imported.VideoID != "_6f6RnHmde0" || imported.Title != "Nu aștepta să fii perfect" || imported.FileName != "_6f6RnHmde0.mp4" || imported.Size != int64(len(video)) {
			t.Errorf("metadata did not match original media: %+v", imported)
		}
		relative, err := filepath.Rel(tempRoot, imported.Path)
		if err != nil || strings.HasPrefix(relative, "..") || filepath.IsAbs(relative) {
			t.Error("video was extracted outside temporary root")
		}
		data, err := os.ReadFile(imported.Path)
		if err != nil || string(data) != video {
			t.Errorf("original video was altered: %v", err)
		}
		emitted = append(emitted, imported)
		return nil
	})
	if err != nil || len(emitted) != 1 {
		t.Fatalf("import failed: %v, emitted=%d", err, len(emitted))
	}
	if _, err := os.Stat(emitted[0].Path); !os.IsNotExist(err) {
		t.Fatal("callback temporary video was retained")
	}
	contents, _ := os.ReadDir(tempRoot)
	if len(contents) != 0 {
		t.Fatal("temporary export archive was retained")
	}
}

func TestTarGzipImportsVideoWithMetadataAndRejectsLinks(t *testing.T) {
	for _, linked := range []bool{false, true} {
		entries := []archiveEntry{{name: "YouTube/videos/Strong message.mp4", data: "original video"}, {name: "YouTube/videos.csv", data: "Video ID,Video Title (Original)\n_6f6RnHmde0,Strong message\n"}}
		if linked {
			entries = append(entries, archiveEntry{name: "YouTube/link.mp4", mode: os.ModeSymlink})
		}
		client := archiveFixtureClient(t, map[string][]byte{"/export.tgz": fixtureTarGzip(t, entries...)})
		called := 0
		err := client.ImportArchives(context.Background(), []string{"https://storage.googleapis.com/export.tgz"}, t.TempDir(), ArchiveLimits{}, func(_ context.Context, video ImportedVideo) error {
			called++
			if video.Title != "Strong message" || video.VideoID != "_6f6RnHmde0" {
				t.Errorf("tar metadata did not match: %+v", video)
			}
			return nil
		})
		if linked && (err == nil || called != 0) || !linked && (err != nil || called != 1) {
			t.Fatalf("tar import linked=%v: err=%v calls=%d", linked, err, called)
		}
	}
}

func TestZIPImportRejectsUnsafeAndOversizedArchivesBeforeSaving(t *testing.T) {
	tests := []struct {
		name    string
		entries []archiveEntry
		limits  ArchiveLimits
	}{
		{name: "traversal", entries: []archiveEntry{{name: "../escape.mp4", data: "video"}}},
		{name: "absolute", entries: []archiveEntry{{name: "/escape.mp4", data: "video"}}},
		{name: "windows traversal", entries: []archiveEntry{{name: `C:\escape.mp4`, data: "video"}}},
		{name: "symlink", entries: []archiveEntry{{name: "link.mp4", data: "../escape", mode: os.ModeSymlink | 0600}}},
		{name: "duplicate", entries: []archiveEntry{{name: "same.mp4", data: "one"}, {name: "same.mp4", data: "two"}}},
		{name: "video size", entries: []archiveEntry{{name: "video.mp4", data: "12345"}}, limits: ArchiveLimits{MaxVideoBytes: 4}},
		{name: "expanded total", entries: []archiveEntry{{name: "one.txt", data: "123"}, {name: "video.mp4", data: "456"}}, limits: ArchiveLimits{MaxTotalBytes: 5}},
		{name: "entry count", entries: []archiveEntry{{name: "one.txt", data: "1"}, {name: "video.mp4", data: "2"}}, limits: ArchiveLimits{MaxEntries: 1}},
		{name: "video count", entries: []archiveEntry{{name: "one.mp4", data: "1"}, {name: "two.mp4", data: "2"}}, limits: ArchiveLimits{MaxVideos: 1}},
		{name: "zip bomb", entries: []archiveEntry{{name: "video.mp4", data: strings.Repeat("0", 2<<20)}}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			client := archiveFixtureClient(t, map[string][]byte{"/export.zip": fixtureZIP(t, test.entries...)})
			called := false
			root := t.TempDir()
			err := client.ImportArchives(context.Background(), []string{"https://storage.googleapis.com/export.zip?signature=sensitive"}, root, test.limits, func(context.Context, ImportedVideo) error { called = true; return nil })
			if err == nil || called {
				t.Fatalf("unsafe archive emitted: err=%v called=%v", err, called)
			}
			if strings.Contains(err.Error(), "signature=sensitive") {
				t.Fatal("signed URL leaked through error")
			}
			contents, _ := os.ReadDir(root)
			if len(contents) != 0 {
				t.Fatal("failed import retained temporary data")
			}
		})
	}
}

func TestArchiveDownloadAndCallbackErrorsAreBoundedAndClean(t *testing.T) {
	data := fixtureZIP(t, archiveEntry{name: "video.mp4", data: "video"})
	client := archiveFixtureClient(t, map[string][]byte{"/export.zip": data})
	for _, test := range []struct {
		name   string
		limits ArchiveLimits
		emit   func(context.Context, ImportedVideo) error
	}{
		{name: "download cap", limits: ArchiveLimits{MaxArchiveBytes: 4}, emit: func(context.Context, ImportedVideo) error { t.Error("callback on oversized download"); return nil }},
		{name: "save failure", emit: func(context.Context, ImportedVideo) error { return errors.New("object storage unavailable") }},
	} {
		t.Run(test.name, func(t *testing.T) {
			root := t.TempDir()
			if err := client.ImportArchives(context.Background(), []string{"https://storage.googleapis.com/export.zip"}, root, test.limits, test.emit); err == nil {
				t.Fatal("expected import failure")
			}
			contents, _ := os.ReadDir(root)
			if len(contents) != 0 {
				t.Fatal("failure retained archive files")
			}
		})
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := client.ImportArchives(ctx, []string{"https://storage.googleapis.com/export.zip?secret=one"}, t.TempDir(), ArchiveLimits{}, func(context.Context, ImportedVideo) error { t.Error("cancelled callback"); return nil }); err == nil || strings.Contains(err.Error(), "secret=one") {
		t.Fatalf("unsafe cancellation: %v", err)
	}
}

func TestArchiveURLAndNetworkPolicy(t *testing.T) {
	for _, value := range []string{
		"http://storage.googleapis.com/archive.zip", "https://storage.googleapis.com.evil.example/archive.zip", "https://evil.example/storage.googleapis.com/archive.zip", "https://user:password@storage.googleapis.com/archive.zip", "https://storage.googleapis.com:444/archive.zip", "https://127.0.0.1/archive.zip", "https://storage.googleapis.com/archive.zip#secret", "https://.storage.googleapis.com/archive.zip", "https://storage.googleapis.com/",
	} {
		if validArchiveURL(value) {
			t.Errorf("unsafe storage URL accepted: %s", value)
		}
	}
	for _, value := range []string{"https://storage.googleapis.com/bucket/export.zip?X-Goog-Signature=secret", "https://export-bucket.storage.googleapis.com/export.zip"} {
		if !validArchiveURL(value) {
			t.Errorf("valid GCS URL rejected: %s", value)
		}
	}
	for _, value := range []string{"127.0.0.1", "10.0.0.1", "169.254.169.254", "100.64.0.1", "192.0.2.1", "::1", "fc00::1", "::ffff:127.0.0.1", "2001:db8::1"} {
		if publicArchiveIP(netip.MustParseAddr(value)) {
			t.Errorf("unsafe IP allowed: %s", value)
		}
	}
	if !publicArchiveIP(netip.MustParseAddr("8.8.8.8")) || !publicArchiveIP(netip.MustParseAddr("2001:4860:4860::8888")) {
		t.Error("public IP rejected")
	}
}

func TestArchiveDownloadNeverFollowsRedirects(t *testing.T) {
	calls := 0
	client, err := NewClient(ClientConfig{ClientID: "client", ClientSecret: "secret", RedirectURL: "https://app.example/callback", HTTPClient: &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		calls++
		return &http.Response{StatusCode: http.StatusFound, Header: http.Header{"Location": {"https://evil.example/stolen?signature=sensitive"}}, Body: io.NopCloser(strings.NewReader("redirect"))}, nil
	})}})
	if err != nil {
		t.Fatal(err)
	}
	err = client.ImportArchives(context.Background(), []string{"https://storage.googleapis.com/export.zip?signature=sensitive"}, t.TempDir(), ArchiveLimits{}, func(context.Context, ImportedVideo) error { t.Error("redirected file imported"); return nil })
	if err == nil || calls != 1 || strings.Contains(err.Error(), "signature=sensitive") || strings.Contains(err.Error(), "evil.example") {
		t.Fatalf("unsafe redirect handling: %v, calls=%d", err, calls)
	}
}

func TestForgedZIPCountAndCorruptVideoNeverReachCallback(t *testing.T) {
	var buffer bytes.Buffer
	writer := zip.NewWriter(&buffer)
	entry, err := writer.CreateHeader(&zip.FileHeader{Name: "video.mp4", Method: zip.Store})
	if err != nil {
		t.Fatal(err)
	}
	_, _ = io.WriteString(entry, "original-video-payload")
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	valid := buffer.Bytes()
	for _, variant := range []string{"forged count", "corrupt payload"} {
		t.Run(variant, func(t *testing.T) {
			data := append([]byte(nil), valid...)
			if variant == "forged count" {
				end := bytes.LastIndex(data, []byte{'P', 'K', 5, 6})
				binary.LittleEndian.PutUint16(data[end+8:], 0)
				binary.LittleEndian.PutUint16(data[end+10:], 0)
			} else {
				position := bytes.Index(data, []byte("original-video-payload"))
				data[position] ^= 0xff
			}
			client := archiveFixtureClient(t, map[string][]byte{"/export.zip": data})
			err := client.ImportArchives(context.Background(), []string{"https://storage.googleapis.com/export.zip"}, t.TempDir(), ArchiveLimits{}, func(context.Context, ImportedVideo) error { t.Error("corrupt video saved"); return nil })
			if err == nil {
				t.Fatal("corrupt ZIP accepted")
			}
		})
	}
}
