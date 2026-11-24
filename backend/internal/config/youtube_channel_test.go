package config

import (
	"encoding/base64"
	"strings"
	"testing"
)

func channelTestEnv() map[string]string {
	return map[string]string{
		"APP_URL":                       "https://sneepcut.example",
		"SOCIAL_TOKEN_ENCRYPTION_KEY":   base64.StdEncoding.EncodeToString([]byte(strings.Repeat("k", 32))),
		"YOUTUBE_CHANNEL_CLIENT_ID":     "channel-id",
		"YOUTUBE_CHANNEL_CLIENT_SECRET": "channel-secret",
	}
}

func loadChannelEnv(env map[string]string) (Application, error) {
	return ApplicationFromEnv(func(key string) string { return env[key] }, "test")
}

func TestYouTubeChannelIsDisabledUntilItsOwnClientIsConfigured(t *testing.T) {
	env := channelTestEnv()
	delete(env, "YOUTUBE_CHANNEL_CLIENT_ID")
	delete(env, "YOUTUBE_CHANNEL_CLIENT_SECRET")
	a, err := loadChannelEnv(env)
	if err != nil || a.YouTubeChannelEnabled || a.YouTubeChannelRedirectURL != "https://sneepcut.example/v1/youtube/channel/callback" {
		t.Fatalf("unconfigured channel: enabled=%v redirect=%q err=%v", a.YouTubeChannelEnabled, a.YouTubeChannelRedirectURL, err)
	}
}

func TestYouTubeChannelConfigurationValidation(t *testing.T) {
	valid, err := loadChannelEnv(channelTestEnv())
	if err != nil || !valid.YouTubeChannelEnabled || valid.YouTubeChannelClientID != "channel-id" {
		t.Fatalf("explicit channel configuration failed: enabled=%v err=%v", valid.YouTubeChannelEnabled, err)
	}
	cases := map[string]func(env map[string]string){
		"client ID without secret": func(env map[string]string) { delete(env, "YOUTUBE_CHANNEL_CLIENT_SECRET") },
		"reuses publishing client": func(env map[string]string) {
			env["YOUTUBE_CLIENT_ID"], env["YOUTUBE_CLIENT_SECRET"] = "channel-id", "publish-secret"
		},
		"reuses sign-in client": func(env map[string]string) {
			env["GOOGLE_CLIENT_ID"], env["GOOGLE_CLIENT_SECRET"] = "channel-id", "sign-in-secret"
		},
		"foreign redirect host": func(env map[string]string) {
			env["YOUTUBE_CHANNEL_REDIRECT_URL"] = "https://evil.example/v1/youtube/channel/callback"
		},
		"redirect to another path": func(env map[string]string) {
			env["YOUTUBE_CHANNEL_REDIRECT_URL"] = "https://sneepcut.example/v1/youtube/import/callback"
		},
		"redirect with query": func(env map[string]string) {
			env["YOUTUBE_CHANNEL_REDIRECT_URL"] = "https://sneepcut.example/v1/youtube/channel/callback?x=1"
		},
		"plaintext encryption key": func(env map[string]string) { env["SOCIAL_TOKEN_ENCRYPTION_KEY"] = "plaintext" },
	}
	for name, mutate := range cases {
		env := channelTestEnv()
		mutate(env)
		if _, err := loadChannelEnv(env); err == nil {
			t.Fatalf("%s was accepted", name)
		}
	}
}
