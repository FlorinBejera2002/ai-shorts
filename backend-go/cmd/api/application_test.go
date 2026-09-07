package main

import (
	"database/sql"
	"io"
	"log/slog"
	"net/http/httptest"
	"sneepcut/backend-go/internal/config"
	"strings"
	"testing"
)

func TestCompleteApplicationRoutesAndOriginPolicy(t *testing.T) {
	get := func(k string) string {
		switch k {
		case "LOCAL_MEDIA_ROOT":
			return t.TempDir()
		case "JWT_SECRET":
			return strings.Repeat("fixture", 8)
		case "CORS_ORIGINS":
			return "http://localhost:3000"
		}
		return ""
	}
	a, err := config.ApplicationFromEnv(get, "test")
	if err != nil {
		t.Fatal(err)
	}
	cfg := config.Config{Environment: "test", Auth: config.Auth{JWTSecret: strings.Repeat("fixture", 8), JWTIssuer: "test", JWTAudience: "test", AllowedOrigins: []string{"http://localhost:3000"}}}
	h, close, err := buildApplication(&sql.DB{}, cfg, a, slog.New(slog.NewTextHandler(io.Discard, nil)))
	if err != nil {
		t.Fatal(err)
	}
	defer close()
	for _, path := range []string{"/api/jobs", "/api/clips", "/api/clips/library", "/api/calendar", "/api/user/brand", "/api/user/profile", "/api/user/credits", "/api/user/data", "/api/dashboard", "/api/dashboard/analytics", "/api/dashboard/history", "/api/dashboard/review", "/api/assistant/history?context=create", "/api/stripe/billing"} {
		r := httptest.NewRequest("GET", "http://localhost"+path, nil)
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code != 401 {
			t.Fatalf("route %s returned %d: %s", path, w.Code, w.Body.String())
		}
	}
	r := httptest.NewRequest("OPTIONS", "http://localhost/api/jobs", nil)
	r.Header.Set("Origin", "http://localhost:3000")
	r.Header.Set("Access-Control-Request-Method", "POST")
	r.Header.Set("Access-Control-Request-Headers", "Content-Type,Authorization")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code >= 300 || w.Header().Get("Access-Control-Allow-Credentials") != "true" {
		t.Fatal("preflight failed", w.Code, w.Header())
	}
	r = httptest.NewRequest("GET", "http://evil.invalid/api/health", nil)
	w = httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != 400 {
		t.Fatal("untrusted host accepted")
	}
	r = httptest.NewRequest("GET", "http://localhost/api/health", nil)
	r.Header.Set("Origin", "https://evil.invalid")
	w = httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != 403 {
		t.Fatal("untrusted origin accepted")
	}
}
