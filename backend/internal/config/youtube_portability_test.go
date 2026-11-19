package config

import (
	"encoding/base64"
	"strings"
	"testing"
)

func TestYouTubePortabilityConfiguration(t *testing.T) {
	env := map[string]string{"APP_URL": "https://sneepcut.example"}
	load := func() (Application, error) {
		return ApplicationFromEnv(func(key string) string { return env[key] }, "test")
	}
	a, err := load()
	if err != nil || a.YouTubePortabilityEnabled || a.YouTubePortabilityTestMode || a.YouTubePortabilityClientID != "" || a.YouTubePortabilityRedirectURL != "https://sneepcut.example/v1/youtube/import/callback" {
		t.Fatalf("unexpected import defaults: enabled=%v callback=%q err=%v", a.YouTubePortabilityEnabled, a.YouTubePortabilityRedirectURL, err)
	}
	// Publishing credentials cannot silently grant file-import access.
	env["YOUTUBE_CLIENT_ID"], env["YOUTUBE_CLIENT_SECRET"] = "publish-id", "publish-secret"
	env["YOUTUBE_PORTABILITY_ENABLED"] = "true"
	if _, err = load(); err == nil {
		t.Fatal("import reused publishing credentials")
	}
	env["YOUTUBE_PORTABILITY_CLIENT_ID"], env["YOUTUBE_PORTABILITY_CLIENT_SECRET"] = "import-id", "import-secret"
	env["SOCIAL_TOKEN_ENCRYPTION_KEY"] = base64.StdEncoding.EncodeToString([]byte(strings.Repeat("k", 32)))
	env["YOUTUBE_PORTABILITY_MAX_IMPORT_MB"] = "1024"
	env["YOUTUBE_PORTABILITY_MAX_VIDEOS"] = "20"
	a, err = load()
	if err != nil || !a.YouTubePortabilityEnabled || a.YouTubePortabilityClientID != "import-id" || a.YouTubePortabilityMaxBytes != 1024*1024*1024 || a.YouTubePortabilityMaxVideos != 20 {
		t.Fatal("explicit import configuration failed", err)
	}
	for _, test := range []struct{ key, value string }{
		{"YOUTUBE_PORTABILITY_ENABLED", "yes"},
		{"YOUTUBE_PORTABILITY_CLIENT_ID", ""},
		{"YOUTUBE_PORTABILITY_CLIENT_SECRET", ""},
		{"YOUTUBE_PORTABILITY_CLIENT_ID", "publish-id"},
		{"SOCIAL_TOKEN_ENCRYPTION_KEY", "plaintext"},
		{"YOUTUBE_PORTABILITY_REDIRECT_URL", "https://evil.example/v1/youtube/import/callback"},
		{"YOUTUBE_PORTABILITY_REDIRECT_URL", "https://sneepcut.example/v1/auth/google/callback"},
		{"YOUTUBE_PORTABILITY_REDIRECT_URL", "https://sneepcut.example/v1/youtube/import/callback?extra=true"},
		{"YOUTUBE_PORTABILITY_MAX_IMPORT_MB", "0"},
		{"YOUTUBE_PORTABILITY_MAX_VIDEOS", "501"},
	} {
		old := env[test.key]
		env[test.key] = test.value
		if _, err := load(); err == nil {
			t.Errorf("accepted invalid %s", test.key)
		}
		env[test.key] = old
	}
}

func TestYouTubePortabilityTestModeDoesNotEnableImports(t *testing.T) {
	for _, value := range []string{"true", "false", "invalid"} {
		t.Run(value, func(t *testing.T) {
			a, err := ApplicationFromEnv(func(key string) string {
				if key == "YOUTUBE_PORTABILITY_TEST_MODE" {
					return value
				}
				return ""
			}, "test")
			if value == "invalid" {
				if err == nil || !strings.Contains(err.Error(), "YOUTUBE_PORTABILITY_TEST_MODE") {
					t.Fatalf("invalid test mode accepted while imports are disabled: %v", err)
				}
				return
			}
			if err != nil || a.YouTubePortabilityEnabled || a.YouTubePortabilityTestMode != (value == "true") {
				t.Fatalf("test mode changed the global import flag: %+v, %v", a.YouTubePortabilityEnabled, err)
			}
		})
	}
}

func TestYouTubePortabilityCannotRevokeOtherClientsInTheSameGoogleProject(t *testing.T) {
	env := map[string]string{
		"YOUTUBE_PORTABILITY_ENABLED": "true", "YOUTUBE_PORTABILITY_CLIENT_ID": "123456-import.apps.googleusercontent.com",
		"YOUTUBE_PORTABILITY_CLIENT_SECRET": "import-secret", "YOUTUBE_CLIENT_ID": "123456-publish.apps.googleusercontent.com",
		"SOCIAL_TOKEN_ENCRYPTION_KEY": base64.StdEncoding.EncodeToString(make([]byte, 32)),
	}
	load := func() error {
		_, err := ApplicationFromEnv(func(key string) string { return env[key] }, "test")
		return err
	}
	if err := load(); err == nil || !strings.Contains(err.Error(), "dedicated Google Cloud project") {
		t.Fatal("same-project import could revoke publishing authorization", err)
	}
	env["YOUTUBE_PORTABILITY_CLIENT_ID"] = "987654-import.apps.googleusercontent.com"
	if err := load(); err != nil {
		t.Fatal("isolated import project rejected", err)
	}
}
