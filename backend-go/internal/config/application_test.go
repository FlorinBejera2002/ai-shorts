package config

import (
	"strings"
	"testing"
)

func TestApplicationProductionConfiguration(t *testing.T) {
	env := map[string]string{"APP_URL": "https://app.example.invalid", "INTERNAL_API_KEY": strings.Repeat("m", 40), "UPLOAD_TOKEN_SECRET": strings.Repeat("u", 40), "JWT_SECRET": strings.Repeat("j", 40)}
	get := func(k string) string { return env[k] }
	a, err := ApplicationFromEnv(get, "production")
	if err != nil || !a.ScannerEnabled || !a.SMTPRequireTLS {
		t.Fatal("production must require scanning and mail TLS", err)
	}
	for _, test := range []struct{ key, value string }{{"APP_URL", "http://app.example.invalid"}, {"APP_URL", "https://app.example.invalid/path"}, {"STORAGE_TYPE", "unknown"}, {"TRUSTED_PROXY_CIDRS", "*"}, {"ALLOWED_HOSTS", "*"}, {"MAX_UPLOAD_SIZE_MB", "-1"}, {"REDIS_URL", "https://invalid"}, {"AUTH_REQUIRE_EMAIL_VERIFICATION", "true"}, {"GOOGLE_CLIENT_ID", "configured-without-secret"}, {"INTERNAL_API_KEY", "short"}} {
		t.Run(test.key, func(t *testing.T) {
			copy := map[string]string{}
			for k, v := range env {
				copy[k] = v
			}
			copy[test.key] = test.value
			if _, err := ApplicationFromEnv(func(k string) string { return copy[k] }, "production"); err == nil {
				t.Fatal("invalid application configuration accepted")
			}
		})
	}
}

func TestApplicationInitialCredits(t *testing.T) {
	for _, test := range []struct {
		name, value string
		want        int
		invalid     bool
	}{
		{name: "default", want: 1000},
		{name: "zero override", value: "0", want: 0},
		{name: "custom override", value: "250", want: 250},
		{name: "negative", value: "-1", invalid: true},
		{name: "non numeric", value: "free", invalid: true},
	} {
		t.Run(test.name, func(t *testing.T) {
			getenv := func(key string) string {
				if key == "DEFAULT_FREE_CREDITS" {
					return test.value
				}
				return ""
			}
			application, err := ApplicationFromEnv(getenv, "test")
			if test.invalid {
				if err == nil || !strings.Contains(err.Error(), "DEFAULT_FREE_CREDITS") {
					t.Fatalf("invalid signup credits accepted: %v", err)
				}
				return
			}
			if err != nil || application.InitialCredits != test.want {
				t.Fatalf("initial credits = %d, want %d: %v", application.InitialCredits, test.want, err)
			}
		})
	}
}
