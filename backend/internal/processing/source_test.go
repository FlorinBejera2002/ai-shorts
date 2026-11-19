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

func TestYouTubeAutomaticTokensSkipAccountCookiesWhenNotBlocked(t *testing.T) {
	binary, argsFile := fakeYtDlp(t, `while [ "$1" != "--output" ]; do shift; done; printf video > "$2"`+"\n")
	// An unreadable cookie path must not block public imports in token mode.
	p := New(Config{YtDlpPath: binary, YouTubeTokenProviderURL: "http://youtube-pot-provider:4416", YouTubeCookiesFile: t.TempDir(), YouTubeProxy: "http://synthetic-user:synthetic-password@proxy.example:8080"}, nil, nil)
	dir := t.TempDir()
	if err := p.download(context.Background(), "https://www.youtube.com/live/_6f6RnHmde0?si=test", filepath.Join(dir, "source.mp4")); err != nil {
		t.Fatal(err)
	}
	raw, _ := os.ReadFile(argsFile)
	args := string(raw)
	for _, required := range []string{"--plugin-dirs\n/opt/yt-dlp/plugins", "youtube:player_client=mweb,tv,web_safari", "youtubepot-bgutilhttp:base_url=http://youtube-pot-provider:4416", "--proxy\nhttp://synthetic-user:synthetic-password@proxy.example:8080"} {
		if !strings.Contains(args, required) {
			t.Fatalf("missing automatic token configuration: %s", required)
		}
	}
	if strings.Contains(args, "--cookies") {
		t.Fatal("automatic token mode must not use account cookies")
	}
	if _, err := os.Stat(filepath.Join(dir, "youtube-cookies.txt")); !os.IsNotExist(err) {
		t.Fatal("account cookie export was copied into a public import")
	}
}

func TestYouTubeBotCheckInTokenModeRetriesWithCookies(t *testing.T) {
	// Fails with YouTube's bot check unless the account cookie export is passed.
	binary, argsFile := fakeYtDlp(t, `case "$*" in *--cookies*) ;; *) echo "ERROR: [youtube] abc: Sign in to confirm you’re not a bot." >&2; exit 1;; esac
while [ "$1" != "--output" ]; do shift; done; printf video > "$2"`+"\n")
	cookies := filepath.Join(t.TempDir(), "cookies.txt")
	if err := os.WriteFile(cookies, []byte("# Netscape HTTP Cookie File\n"), 0600); err != nil {
		t.Fatal(err)
	}
	p := New(Config{YtDlpPath: binary, YouTubeTokenProviderURL: "http://youtube-pot-provider:4416", YouTubeCookiesFile: cookies}, nil, nil)
	dir := t.TempDir()
	if err := p.download(context.Background(), "https://youtu.be/abc123", filepath.Join(dir, "source.mp4")); err != nil {
		t.Fatal(err)
	}
	raw, _ := os.ReadFile(argsFile)
	if !strings.Contains(string(raw), "--cookies\n"+filepath.Join(dir, "youtube-cookies.txt")) || !strings.Contains(string(raw), "youtubepot-bgutilhttp") {
		t.Fatalf("retry must keep tokens and add cookies: %q", raw)
	}
}

func TestYouTubeBotCheckWithoutCookiesExplainsRemedy(t *testing.T) {
	binary, _ := fakeYtDlp(t, "echo \"ERROR: [youtube] abc: Sign in to confirm you're not a bot.\" >&2\nexit 1\n")
	p := New(Config{YtDlpPath: binary, YouTubeTokenProviderURL: "http://youtube-pot-provider:4416"}, nil, nil)
	err := p.download(context.Background(), "https://youtu.be/abc123", filepath.Join(t.TempDir(), "source.mp4"))
	if err == nil || !strings.Contains(err.Error(), "YOUTUBE_COOKIES_PATH") {
		t.Fatalf("expected actionable bot-check error, got %v", err)
	}
}

func TestYouTubeBotCheckReportsCookiePreparationFailure(t *testing.T) {
	binary, _ := fakeYtDlp(t, "echo \"ERROR: [youtube] abc: Sign in to confirm you're not a bot.\" >&2\nexit 1\n")
	p := New(Config{
		YtDlpPath:               binary,
		YouTubeTokenProviderURL: "http://youtube-pot-provider:4416",
		YouTubeCookiesFile:      t.TempDir(),
	}, nil, nil)
	err := p.download(context.Background(), "https://youtu.be/abc123", filepath.Join(t.TempDir(), "source.mp4"))
	if err == nil || !strings.HasPrefix(err.Error(), "YouTube cookies:") || strings.Contains(err.Error(), "not a bot") {
		t.Fatalf("cookie preparation failure was hidden behind the public bot check: %v", err)
	}
}

func stateRejectingYtDlp(t *testing.T, rejectExport bool) (string, string) {
	t.Helper()
	calls := filepath.Join(t.TempDir(), "attempts")
	reject := `[ "$source" = state ]`
	if rejectExport {
		reject = "true"
	}
	binary, _ := fakeYtDlp(t, `jar=""; out=""
while [ $# -gt 0 ]; do case "$1" in --cookies) jar="$2";; --output) out="$2";; esac; shift; done
if [ -z "$jar" ]; then
  printf 'public\n' >> `+calls+`
  echo "Sign in to confirm you're not a bot" >&2; exit 1
fi
if grep -q revoked "$jar"; then source=state; else source=export; fi
printf '%s\n' "$source" >> `+calls+`
if `+reject+`; then
  printf '# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t1999999999\tLOGIN_INFO\tleftover\n' > "$jar"
  echo "Sign in to confirm you're not a bot" >&2; exit 1
fi
printf '# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t1999999999\tLOGIN_INFO\trotated\n.youtube.com\tTRUE\t/\tTRUE\t1999999999\tSAPISID\trotated\n' > "$jar"
printf video > "$out"
`)
	return binary, calls
}

func TestYouTubeRejectedSavedSessionRetriesExportOnce(t *testing.T) {
	for _, tokenMode := range []bool{false, true} {
		name := "cookies only"
		if tokenMode {
			name = "token fallback"
		}
		t.Run(name, func(t *testing.T) {
			binary, calls := stateRejectingYtDlp(t, false)
			p, _, _, state := preparedRefreshedCookieSession(t)
			p.cfg.YtDlpPath = binary
			if tokenMode {
				p.cfg.YouTubeTokenProviderURL = "http://youtube-pot-provider:4416"
			}
			if err := p.download(context.Background(), "https://youtu.be/abc123", filepath.Join(t.TempDir(), "custom-output.mp4")); err != nil {
				t.Fatal(err)
			}
			want := "state\nexport\n"
			if tokenMode {
				want = "public\n" + want
			}
			if got, err := os.ReadFile(calls); err != nil || string(got) != want {
				t.Fatalf("wrong bounded retry sequence: got %q, error %v", got, err)
			}
			if got, err := os.ReadFile(state); err != nil || string(got) != cookieJar("rotated") {
				t.Fatalf("export retry's authenticated rotation was not retained: %v", err)
			}
		})
	}
}

func TestYouTubeRepeatedBotChecksDoNotLoopOrReuseRejectedState(t *testing.T) {
	for _, tokenMode := range []bool{false, true} {
		name := "cookies only"
		if tokenMode {
			name = "token fallback"
		}
		t.Run(name, func(t *testing.T) {
			binary, calls := stateRejectingYtDlp(t, true)
			p, _, _, state := preparedRefreshedCookieSession(t)
			p.cfg.YtDlpPath = binary
			if tokenMode {
				p.cfg.YouTubeTokenProviderURL = "http://youtube-pot-provider:4416"
			}
			err := p.download(context.Background(), "https://youtu.be/abc123", filepath.Join(t.TempDir(), "source.mp4"))
			if err == nil || !isYouTubeBotCheck(err) {
				t.Fatalf("expected final bot-check error, got %v", err)
			}
			want := "state\nexport\n"
			if tokenMode {
				want = "public\n" + want
			}
			if got, err := os.ReadFile(calls); err != nil || string(got) != want {
				t.Fatalf("retry did not stop after the export attempt: got %q, error %v", got, err)
			}
			if _, err := os.Stat(state); !os.IsNotExist(err) {
				t.Fatal("rejected state was retained")
			}
			err = p.download(context.Background(), "https://youtu.be/abc123", filepath.Join(t.TempDir(), "source.mp4"))
			if err == nil || !isYouTubeBotCheck(err) {
				t.Fatalf("expected the export's bot check on the next download, got %v", err)
			}
			if tokenMode {
				want += "public\n"
			}
			want += "export\n"
			if got, err := os.ReadFile(calls); err != nil || string(got) != want {
				t.Fatalf("next download reused rejected state: got %q, error %v", got, err)
			}
		})
	}
}

func TestYouTubeNonAuthenticationFailureRetainsValidCookieRotation(t *testing.T) {
	binary, _ := fakeYtDlp(t, `jar=""
while [ $# -gt 0 ]; do case "$1" in --cookies) jar="$2";; esac; shift; done
printf '# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t1999999999\tLOGIN_INFO\trotated\n.youtube.com\tTRUE\t/\tTRUE\t1999999999\tSAPISID\trotated\n' > "$jar"
echo 'network connection interrupted' >&2; exit 1
`)
	p, _, _, state := preparedRefreshedCookieSession(t)
	p.cfg.YtDlpPath = binary
	err := p.download(context.Background(), "https://youtu.be/abc123", filepath.Join(t.TempDir(), "source.mp4"))
	if err == nil || !strings.Contains(err.Error(), "network connection interrupted") {
		t.Fatalf("expected the network failure, got %v", err)
	}
	if got, err := os.ReadFile(state); err != nil || string(got) != cookieJar("rotated") {
		t.Fatalf("a valid rotation was lost after a non-authentication failure: %v", err)
	}
}

func TestYouTubeProxyCredentialsCannotReachJobErrors(t *testing.T) {
	binary, _ := fakeYtDlp(t, "echo 'proxy connection failed: http://synthetic-user:synthetic-password@proxy.example:8080' >&2\nexit 1\n")
	p := New(Config{YtDlpPath: binary, YouTubeProxy: "http://synthetic-user:synthetic-password@proxy.example:8080"}, nil, nil)
	err := p.download(context.Background(), "https://youtu.be/_6f6RnHmde0", filepath.Join(t.TempDir(), "source.mp4"))
	if err == nil || strings.Contains(err.Error(), "synthetic-user") || strings.Contains(err.Error(), "synthetic-password") || !strings.Contains(err.Error(), "configured proxy failed") {
		t.Fatalf("expected safe proxy error, got %v", err)
	}
}

func TestYouTubeProxyRejectsInvalidConfiguration(t *testing.T) {
	for _, proxy := range []string{"proxy.example:8080", "file:///tmp/proxy", "http://", "http://proxy.example/?secret=value"} {
		p := New(Config{YtDlpPath: "must-not-run", YouTubeProxy: proxy}, nil, nil)
		err := p.download(context.Background(), "https://youtu.be/_6f6RnHmde0", filepath.Join(t.TempDir(), "source.mp4"))
		if err == nil || !strings.HasPrefix(err.Error(), "invalid YouTube proxy URL") {
			t.Fatalf("expected safe configuration error, got %v", err)
		}
	}
}

func TestYouTubeTokenProviderRejectsInvalidConfiguration(t *testing.T) {
	for _, address := range []string{"file:///tmp/token", "http://", "http://user:password@provider:4416", "http://provider:4416;other=value", "http://provider:4416?secret=value"} {
		t.Run(address, func(t *testing.T) {
			p := New(Config{YtDlpPath: "must-not-run", YouTubeTokenProviderURL: address}, nil, nil)
			err := p.download(context.Background(), "https://youtu.be/_6f6RnHmde0", filepath.Join(t.TempDir(), "source.mp4"))
			if err == nil || err.Error() != "invalid YouTube token provider URL" {
				t.Fatalf("expected configuration error, got %v", err)
			}
		})
	}
}

func TestYouTubeDownloadRejectsNonYouTubeURLs(t *testing.T) {
	p := New(Config{YtDlpPath: "must-not-start-yt-dlp"}, nil, nil)
	if err := p.download(context.Background(), "https://example.com/video.mp4", filepath.Join(t.TempDir(), "source.mp4")); err == nil {
		t.Fatal("non-YouTube URL was accepted")
	}
}
