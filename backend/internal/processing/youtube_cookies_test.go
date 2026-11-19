package processing

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func cookieJar(sid string) string {
	return "# Netscape HTTP Cookie File\n" +
		".youtube.com\tTRUE\t/\tTRUE\t1999999999\tLOGIN_INFO\t" + sid + "\n" +
		".youtube.com\tTRUE\t/\tTRUE\t1999999999\tSAPISID\t" + sid + "\n"
}

// rotatingYtDlp records the cookie jar it received and rewrites it with a
// rotated session, as yt-dlp does when YouTube refreshes cookies.
func rotatingYtDlp(t *testing.T, rotatedJar string) (binary, seenFile string) {
	t.Helper()
	seenFile = filepath.Join(t.TempDir(), "seen")
	jar := strings.ReplaceAll(rotatedJar, "\t", `\t`)
	binary, _ = fakeYtDlp(t, `jar=""; out=""
while [ $# -gt 0 ]; do case "$1" in --cookies) jar="$2";; --output) out="$2";; esac; shift; done
cat "$jar" > `+seenFile+`
printf '`+strings.ReplaceAll(jar, "\n", `\n`)+`' > "$jar"
printf video > "$out"
`)
	return binary, seenFile
}

func writeFile(t *testing.T, path, content string, modified time.Time) {
	t.Helper()
	if err := os.WriteFile(path, []byte(content), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.Chtimes(path, modified, modified); err != nil {
		t.Fatal(err)
	}
}

func TestYouTubeRefreshedCookiesArePersistedAndReused(t *testing.T) {
	binary, seenFile := rotatingYtDlp(t, cookieJar("rotated"))
	secrets := t.TempDir()
	export := filepath.Join(secrets, "youtube-cookies.txt")
	writeFile(t, export, cookieJar("exported"), time.Now().Add(-time.Hour))
	state := filepath.Join(t.TempDir(), "cookies.txt")
	p := New(Config{YtDlpPath: binary, YouTubeCookiesFile: export, YouTubeCookiesStateFile: state}, nil, nil)

	if err := p.download(context.Background(), "https://youtu.be/abc123", filepath.Join(t.TempDir(), "source.mp4")); err != nil {
		t.Fatal(err)
	}
	if seen, _ := os.ReadFile(seenFile); !strings.Contains(string(seen), "exported") {
		t.Fatalf("first download must start from the export: %q", seen)
	}
	if saved, _ := os.ReadFile(state); !strings.Contains(string(saved), "rotated") {
		t.Fatalf("refreshed session was not persisted: %q", saved)
	}
	if exported, _ := os.ReadFile(export); !strings.Contains(string(exported), "exported") {
		t.Fatal("the provisioned export must stay unchanged")
	}

	if err := p.download(context.Background(), "https://youtu.be/abc123", filepath.Join(t.TempDir(), "source.mp4")); err != nil {
		t.Fatal(err)
	}
	if seen, _ := os.ReadFile(seenFile); !strings.Contains(string(seen), "rotated") {
		t.Fatalf("next download must reuse the refreshed session: %q", seen)
	}
}

func TestYouTubeNewerExportReplacesRefreshedCookies(t *testing.T) {
	binary, seenFile := rotatingYtDlp(t, cookieJar("rotated"))
	export := filepath.Join(t.TempDir(), "youtube-cookies.txt")
	state := filepath.Join(t.TempDir(), "cookies.txt")
	writeFile(t, state, cookieJar("old-state"), time.Now().Add(-time.Hour))
	writeFile(t, export, cookieJar("new-export"), time.Now())
	p := New(Config{YtDlpPath: binary, YouTubeCookiesFile: export, YouTubeCookiesStateFile: state}, nil, nil)

	if err := p.download(context.Background(), "https://youtu.be/abc123", filepath.Join(t.TempDir(), "source.mp4")); err != nil {
		t.Fatal(err)
	}
	if seen, _ := os.ReadFile(seenFile); !strings.Contains(string(seen), "new-export") {
		t.Fatalf("a newer manual export must take over: %q", seen)
	}
}

func TestYouTubeJarWithoutSessionIsNotPersisted(t *testing.T) {
	binary, _ := rotatingYtDlp(t, "# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t1999999999\tPREF\tf6=40000000\n")
	export := filepath.Join(t.TempDir(), "youtube-cookies.txt")
	writeFile(t, export, cookieJar("exported"), time.Now())
	state := filepath.Join(t.TempDir(), "cookies.txt")
	p := New(Config{YtDlpPath: binary, YouTubeCookiesFile: export, YouTubeCookiesStateFile: state}, nil, nil)

	if err := p.download(context.Background(), "https://youtu.be/abc123", filepath.Join(t.TempDir(), "source.mp4")); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(state); !os.IsNotExist(err) {
		t.Fatal("a jar without a signed-in session must not replace the state")
	}
}

func TestHasYouTubeSessionRecognizesHttpOnlyCookies(t *testing.T) {
	jar := "#HttpOnly_.youtube.com\tTRUE\t/\tTRUE\t1999999999\tLOGIN_INFO\tlogin\n" +
		"#HttpOnly_.youtube.com\tTRUE\t/\tTRUE\t1999999999\t__Secure-3PAPISID\tapi\n"
	if !hasYouTubeSession([]byte(jar)) {
		t.Fatal("HttpOnly session cookie was not recognized")
	}
	if hasYouTubeSession([]byte("# Netscape HTTP Cookie File\n")) {
		t.Fatal("empty jar was treated as a session")
	}
}

func TestHasYouTubeSessionRequiresUsableAuthenticationPair(t *testing.T) {
	valid := cookieJar("synthetic")
	loginOnly := "# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t1999999999\tLOGIN_INFO\tlogin\n"
	apiOnly := "# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t1999999999\tSAPISID\tapi\n"
	for _, tc := range []struct {
		name string
		jar  string
		want bool
	}{
		{"standard pair", valid, true},
		{"secure first party pair", strings.ReplaceAll(valid, "SAPISID", "__Secure-1PAPISID"), true},
		{"secure third party pair", strings.ReplaceAll(valid, "SAPISID", "__Secure-3PAPISID"), true},
		{"session expiry zero", strings.ReplaceAll(valid, "1999999999", "0"), true},
		{"session expiry empty", strings.ReplaceAll(valid, "1999999999", ""), true},
		{"www domain", strings.ReplaceAll(valid, ".youtube.com", "www.youtube.com"), true},
		{"login info alone", loginOnly, false},
		{"api cookie alone", apiOnly, false},
		{"legacy SID alone", strings.ReplaceAll(loginOnly, "LOGIN_INFO", "SID"), false},
		{"expired login cookie", strings.Replace(valid, "1999999999\tLOGIN_INFO", "1\tLOGIN_INFO", 1), false},
		{"expired api cookie", strings.Replace(valid, "1999999999\tSAPISID", "1\tSAPISID", 1), false},
		{"invalid expiry", strings.ReplaceAll(valid, "1999999999", "invalid"), false},
		{"empty login value", strings.Replace(valid, "LOGIN_INFO\tsynthetic", "LOGIN_INFO\t", 1), false},
		{"empty api value", strings.Replace(valid, "SAPISID\tsynthetic", "SAPISID\t", 1), false},
		{"google cookies only", strings.ReplaceAll(valid, ".youtube.com", ".google.com"), false},
		{"unrelated suffix domain", strings.ReplaceAll(valid, ".youtube.com", ".notyoutube.com"), false},
		{"unrelated parent domain", strings.ReplaceAll(valid, ".youtube.com", ".youtube.com.example.invalid"), false},
		{"other youtube host", strings.ReplaceAll(valid, ".youtube.com", ".studio.youtube.com"), false},
		{"unrelated cookie path", strings.ReplaceAll(valid, "\t/\t", "\t/account\t"), false},
		{"malformed flags", strings.ReplaceAll(valid, "\tTRUE\t", "\tinvalid\t"), false},
		{"unreadable trailing row", valid + strings.Repeat("x", maximumCookieJarBytes+1), false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := hasYouTubeSession([]byte(tc.jar)); got != tc.want {
				t.Fatalf("authenticated session = %v, want %v", got, tc.want)
			}
		})
	}
}

func TestYouTubeInvalidRefreshedCookiesFallBackToExport(t *testing.T) {
	for _, tc := range []struct {
		name      string
		state     string
		directory bool
	}{
		{name: "login info left after rejection", state: "# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t1999999999\tLOGIN_INFO\tleftover\n"},
		{name: "expired session", state: strings.ReplaceAll(cookieJar("expired"), "1999999999", "1")},
		{name: "oversized state", state: strings.Repeat("x", maximumCookieJarBytes+1)},
		{name: "unreadable state", directory: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			export := filepath.Join(t.TempDir(), "export.txt")
			state := filepath.Join(t.TempDir(), "state.txt")
			writeFile(t, export, cookieJar("exported"), time.Now().Add(-time.Hour))
			if tc.directory {
				if err := os.Mkdir(state, 0700); err != nil {
					t.Fatal(err)
				}
			} else {
				writeFile(t, state, tc.state, time.Now())
			}
			p := New(Config{YouTubeCookiesFile: export, YouTubeCookiesStateFile: state}, nil, nil)
			private, err := p.privateYouTubeCookies(t.TempDir())
			if err != nil {
				t.Fatal(err)
			}
			if got, err := os.ReadFile(private.path); err != nil || string(got) != cookieJar("exported") {
				t.Fatalf("invalid saved state masked the readable export: %v", err)
			}
			writeFile(t, private.path, cookieJar("rotated"), time.Now())
			if err := p.saveRefreshedYouTubeCookies(private); err != nil {
				t.Fatal(err)
			}
			if !tc.directory {
				if got, err := os.ReadFile(state); err != nil || string(got) != cookieJar("rotated") {
					t.Fatalf("a valid rotation did not repair the rejected saved state: %v", err)
				}
			}
		})
	}
}

func TestYouTubeCookieSelectionPreservesValidSessionsAndNewExports(t *testing.T) {
	for _, tc := range []struct {
		name          string
		exportMissing bool
		newExport     bool
		want          string
	}{
		{name: "valid refreshed session", want: "refreshed"},
		{name: "missing export", exportMissing: true, want: "refreshed"},
		{name: "new manual export", newExport: true, want: "exported"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			export := filepath.Join(t.TempDir(), "export.txt")
			state := filepath.Join(t.TempDir(), "state.txt")
			stateTime := time.Now().Add(-time.Minute)
			writeFile(t, state, cookieJar("refreshed"), stateTime)
			if !tc.exportMissing {
				exportTime := stateTime.Add(-time.Minute)
				if tc.newExport {
					exportTime = stateTime.Add(time.Minute)
				}
				writeFile(t, export, cookieJar("exported"), exportTime)
			}
			p := New(Config{YouTubeCookiesFile: export, YouTubeCookiesStateFile: state}, nil, nil)
			private, err := p.privateYouTubeCookies(t.TempDir())
			if err != nil {
				t.Fatal(err)
			}
			if got, err := os.ReadFile(private.path); err != nil || string(got) != cookieJar(tc.want) {
				t.Fatalf("wrong cookie source selected: %v", err)
			}
		})
	}
}

func TestYouTubeRejectedJarDoesNotReplaceValidRefreshedSession(t *testing.T) {
	export := filepath.Join(t.TempDir(), "export.txt")
	state := filepath.Join(t.TempDir(), "state.txt")
	writeFile(t, export, cookieJar("exported"), time.Now().Add(-time.Hour))
	writeFile(t, state, cookieJar("refreshed"), time.Now())
	p := New(Config{YouTubeCookiesFile: export, YouTubeCookiesStateFile: state}, nil, nil)
	session, err := p.privateYouTubeCookies(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	writeFile(t, session.path, "# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t1999999999\tLOGIN_INFO\tleftover\n", time.Now())
	if err := p.saveRefreshedYouTubeCookies(session); err != nil {
		t.Fatal(err)
	}
	if got, err := os.ReadFile(state); err != nil || string(got) != cookieJar("refreshed") {
		t.Fatalf("rejected cookie jar replaced the valid saved session: %v", err)
	}
}

func preparedRefreshedCookieSession(t *testing.T) (*Processor, *youtubeCookieSession, string, string) {
	t.Helper()
	export := filepath.Join(t.TempDir(), "export.txt")
	state := filepath.Join(t.TempDir(), "state.txt")
	writeFile(t, export, cookieJar("exported"), time.Now().Add(-time.Hour))
	writeFile(t, state, cookieJar("revoked"), time.Now().Add(-time.Minute))
	p := New(Config{YouTubeCookiesFile: export, YouTubeCookiesStateFile: state}, nil, nil)
	session, err := p.privateYouTubeCookies(t.TempDir())
	if err != nil || session == nil || !session.fromState {
		t.Fatalf("prepare saved session: %v", err)
	}
	return p, session, export, state
}

func TestYouTubeRejectedSavedSessionRecoversToExport(t *testing.T) {
	p, rejected, _, state := preparedRefreshedCookieSession(t)
	retry, err := p.privateYouTubeExportAfterRejection(filepath.Dir(rejected.path), rejected)
	if err != nil || retry == nil || retry.fromState {
		t.Fatalf("prepare export retry: %v", err)
	}
	if got, err := os.ReadFile(retry.path); err != nil || string(got) != cookieJar("exported") {
		t.Fatalf("retry did not use the provisioned export: %v", err)
	}
	if _, err := os.Stat(state); !os.IsNotExist(err) {
		t.Fatal("the rejected saved session still masks the export")
	}
	next, err := p.privateYouTubeCookies(t.TempDir())
	if err != nil || next == nil || next.fromState {
		t.Fatalf("the next download still selects the rejected session: %v", err)
	}
	writeFile(t, retry.path, cookieJar("rotated"), time.Now())
	if err := p.saveRefreshedYouTubeCookies(retry); err != nil {
		t.Fatal(err)
	}
	if got, err := os.ReadFile(state); err != nil || string(got) != cookieJar("rotated") {
		t.Fatalf("successful export retry did not preserve its valid rotation: %v", err)
	}
}

func TestYouTubeRejectedSessionPreservesConcurrentReplacement(t *testing.T) {
	for _, kind := range []string{"changed content", "same content with new timestamp", "same content with new file identity"} {
		t.Run(kind, func(t *testing.T) {
			p, rejected, _, state := preparedRefreshedCookieSession(t)
			replacement := cookieJar("another-job")
			switch kind {
			case "same content with new timestamp":
				replacement = cookieJar("revoked")
				writeFile(t, state, replacement, time.Now())
			case "same content with new file identity":
				replacement = cookieJar("revoked")
				incoming := state + ".incoming"
				writeFile(t, incoming, replacement, rejected.stateSnapshot.info.ModTime())
				if err := os.Rename(incoming, state); err != nil {
					t.Fatal(err)
				}
			default:
				writeFile(t, state, replacement, time.Now())
			}
			retry, err := p.privateYouTubeExportAfterRejection(filepath.Dir(rejected.path), rejected)
			if err != nil || retry == nil {
				t.Fatalf("prepare export retry: %v", err)
			}
			if got, err := os.ReadFile(state); err != nil || string(got) != replacement {
				t.Fatalf("rejection removed another attempt's state: %v", err)
			}
			writeFile(t, retry.path, cookieJar("late-rotation"), time.Now())
			if err := p.saveRefreshedYouTubeCookies(retry); err != nil {
				t.Fatal(err)
			}
			if got, err := os.ReadFile(state); err != nil || string(got) != replacement {
				t.Fatalf("the late retry overwrote another attempt's state: %v", err)
			}
		})
	}
}

func TestYouTubeExportRetryPreservesStateCreatedAfterInvalidation(t *testing.T) {
	p, rejected, _, state := preparedRefreshedCookieSession(t)
	retry, err := p.privateYouTubeExportAfterRejection(filepath.Dir(rejected.path), rejected)
	if err != nil || retry == nil {
		t.Fatalf("prepare export retry: %v", err)
	}
	writeFile(t, state, cookieJar("another-job"), time.Now())
	writeFile(t, retry.path, cookieJar("late-rotation"), time.Now())
	if err := p.saveRefreshedYouTubeCookies(retry); err != nil {
		t.Fatal(err)
	}
	if got, err := os.ReadFile(state); err != nil || string(got) != cookieJar("another-job") {
		t.Fatalf("retry replaced state created after its invalidation: %v", err)
	}
}

func TestYouTubeRejectedSessionRetriesLatestManualExport(t *testing.T) {
	p, rejected, export, _ := preparedRefreshedCookieSession(t)
	writeFile(t, export, cookieJar("new-manual-export"), time.Now())
	retry, err := p.privateYouTubeExportAfterRejection(filepath.Dir(rejected.path), rejected)
	if err != nil || retry == nil {
		t.Fatalf("prepare export retry: %v", err)
	}
	if got, err := os.ReadFile(retry.path); err != nil || string(got) != cookieJar("new-manual-export") {
		t.Fatalf("retry reused an older export snapshot: %v", err)
	}
}

func TestYouTubeLateRotationCannotMaskNewManualExport(t *testing.T) {
	p, session, export, state := preparedRefreshedCookieSession(t)
	writeFile(t, export, cookieJar("new-manual-export"), time.Now())
	writeFile(t, session.path, cookieJar("late-rotation"), time.Now())
	if err := p.saveRefreshedYouTubeCookies(session); err != nil {
		t.Fatal(err)
	}
	if got, err := os.ReadFile(state); err != nil || string(got) != cookieJar("revoked") {
		t.Fatalf("old request wrote state after a newer manual export: %v", err)
	}
	next, err := p.privateYouTubeCookies(t.TempDir())
	if err != nil || next == nil {
		t.Fatalf("prepare next download: %v", err)
	}
	if got, err := os.ReadFile(next.path); err != nil || string(got) != cookieJar("new-manual-export") {
		t.Fatalf("old request's rotation masked the new export: %v", err)
	}
}
