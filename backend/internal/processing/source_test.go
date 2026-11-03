package processing

import (
	"context"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

// fakeYtDlp records its arguments and writes the requested output file.
func fakeYtDlp(t *testing.T, script string) (binary, argsFile string) {
	t.Helper()
	if runtime.GOOS == "windows" {
		t.Skip("fake yt-dlp is a POSIX shell script")
	}
	dir := t.TempDir()
	argsFile = filepath.Join(dir, "args")
	binary = filepath.Join(dir, "yt-dlp")
	body := "#!/bin/sh\nprintf '%s\\n' \"$@\" > " + argsFile + "\n" + script
	if err := os.WriteFile(binary, []byte(body), 0700); err != nil {
		t.Fatal(err)
	}
	return binary, argsFile
}

func TestYouTubeDownloadUsesYtDlpWithPrivateCookiesAndProxy(t *testing.T) {
	binary, argsFile := fakeYtDlp(t, `while [ "$1" != "--output" ]; do shift; done; printf video > "$2"`+"\n")
	cookies := filepath.Join(t.TempDir(), "cookies.txt")
	if err := os.WriteFile(cookies, []byte("# Netscape HTTP Cookie File\n"), 0600); err != nil {
		t.Fatal(err)
	}
	p := New(Config{YtDlpPath: binary, YouTubeCookiesFile: cookies, YouTubeProxy: "http://proxy.example:8080"}, nil, nil)
	jobDir := t.TempDir()
	dest := filepath.Join(jobDir, "source.mp4")
	if err := p.download(context.Background(), "https://www.youtube.com/watch?v=abc123", dest); err != nil {
		t.Fatal(err)
	}
	if data, _ := os.ReadFile(dest); string(data) != "video" {
		t.Fatalf("download did not produce the source file: %q", data)
	}
	raw, _ := os.ReadFile(argsFile)
	args := strings.Split(strings.TrimSpace(string(raw)), "\n")
	joined := strings.Join(args, " ")
	for _, want := range []string{"--no-playlist", "--output " + dest, "--cookies " + filepath.Join(jobDir, "youtube-cookies.txt"), "--proxy http://proxy.example:8080"} {
		if !strings.Contains(joined, want) {
			t.Fatalf("yt-dlp arguments %q are missing %q", joined, want)
		}
	}
	if args[len(args)-2] != "--" || args[len(args)-1] != "https://www.youtube.com/watch?v=abc123" {
		t.Fatalf("source URL must follow --: %q", args)
	}
}

func TestYouTubeDownloadWithoutProvisionedCookiesTriesPublicAccess(t *testing.T) {
	binary, argsFile := fakeYtDlp(t, `while [ "$1" != "--output" ]; do shift; done; printf video > "$2"`+"\n")
	p := New(Config{YtDlpPath: binary, YouTubeCookiesFile: filepath.Join(t.TempDir(), "absent.txt")}, nil, nil)
	if err := p.download(context.Background(), "https://youtu.be/abc123", filepath.Join(t.TempDir(), "source.mp4")); err != nil {
		t.Fatal(err)
	}
	if raw, _ := os.ReadFile(argsFile); strings.Contains(string(raw), "--cookies") {
		t.Fatalf("absent cookie export must not be passed to yt-dlp: %q", raw)
	}
}

func TestYouTubeDownloadReportsYtDlpFailure(t *testing.T) {
	binary, _ := fakeYtDlp(t, "echo 'ERROR: [youtube] abc123: Video unavailable' >&2\nexit 1\n")
	p := New(Config{YtDlpPath: binary}, nil, nil)
	err := p.download(context.Background(), "https://youtu.be/abc123", filepath.Join(t.TempDir(), "source.mp4"))
	if err == nil || !strings.Contains(err.Error(), "Video unavailable") {
		t.Fatalf("expected yt-dlp error details, got %v", err)
	}
}

func TestYouTubeDownloadRejectsNonYouTubeURLs(t *testing.T) {
	p := New(Config{YtDlpPath: "must-not-start-yt-dlp"}, nil, nil)
	if err := p.download(context.Background(), "https://example.com/video.mp4", filepath.Join(t.TempDir(), "source.mp4")); err == nil {
		t.Fatal("non-YouTube URL was accepted")
	}
}
