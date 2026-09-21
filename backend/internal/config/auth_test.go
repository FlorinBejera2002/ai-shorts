package config

import (
	"io"
	"strings"
	"testing"
)

func TestAuthConfiguration(t *testing.T) {
	valid := map[string]string{
		"GO_AUTH_ENABLED": "true", "DATABASE_URL": "postgresql://test@127.0.0.1/sneepcut_integration_test",
		"JWT_SECRET": strings.Repeat("test-secret", 4), "CORS_ORIGINS": "https://app.example.invalid",
		"APP_ENV": "production",
	}
	for _, test := range []struct{ name, key, value string }{
		{"missing secret", "JWT_SECRET", ""},
		{"short secret", "JWT_SECRET", "short"},
		{"missing database", "DATABASE_URL", ""},
		{"wrong database scheme", "DATABASE_URL", "sqlite:///test.db"},
		{"wildcard origin", "CORS_ORIGINS", "*"},
		{"insecure production", "CORS_ORIGINS", "http://app.example.invalid"},
		{"origin path", "CORS_ORIGINS", "https://app.example.invalid/path"},
		{"origin credentials", "CORS_ORIGINS", "https://user:secret@app.example.invalid"},
		{"empty origins", "CORS_ORIGINS", " , "},
	} {
		t.Run(test.name, func(t *testing.T) {
			_, err := Load(nil, func(key string) string {
				if key == test.key {
					return test.value
				}
				return valid[key]
			}, io.Discard)
			if err == nil {
				t.Fatal("unsafe configuration accepted")
			}
			if strings.Contains(err.Error(), valid["JWT_SECRET"]) {
				t.Fatal("secret exposed")
			}
		})
	}
	cfg, err := Load(nil, func(key string) string { return valid[key] }, io.Discard)
	if err != nil || !cfg.Auth.Enabled || !cfg.Auth.SecureCookies {
		t.Fatalf("production config: %v", err)
	}
	cfg, err = Load([]string{"-env=test"}, func(key string) string { return valid[key] }, io.Discard)
	if err != nil || cfg.Auth.SecureCookies {
		t.Fatalf("test override: %v", err)
	}
	cfg, err = Load(nil, func(string) string { return "" }, io.Discard)
	if err != nil || cfg.Auth.Enabled {
		t.Fatalf("auth must be opt-in: %v", err)
	}
}
