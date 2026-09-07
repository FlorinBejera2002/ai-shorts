package account

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/julienschmidt/httprouter"
)

const testHash = "$2b$12$tVLZOBSvFOx2sp4u1B6nT.0lG9HQ0XjxYkW72YPuUc1cQTsKGvCY2"
const testPassword = "dummy-password-not-a-user"

func ptr(s string) *string { return &s }

func TestDeletionConfirmationAndPasswordOrRecentProviderAuthentication(t *testing.T) {
	user := deletionAccount{Email: "owner@example.invalid", PasswordHash: testHash}
	if err := confirm(DeletionInput{Confirmation: " OWNER@example.invalid ", CurrentPassword: ptr(testPassword)}, user, 1, 5000); err != nil {
		t.Fatal("password confirms an older credentials session", err)
	}
	for _, input := range []DeletionInput{{Confirmation: user.Email}, {Confirmation: "other@example.invalid", CurrentPassword: ptr(testPassword)}, {Confirmation: user.Email, CurrentPassword: ptr("wrong")}, {Confirmation: user.Email, CurrentPassword: ptr(strings.Repeat("a", 73))}} {
		if confirm(input, user, 1000, 1000) == nil {
			t.Fatal("invalid confirmation accepted", input.Confirmation)
		}
	}
	user.PasswordHash = ""
	for _, at := range []int64{0, 399, 1001} {
		err := confirm(DeletionInput{Confirmation: user.Email}, user, at, 1000)
		var e *apiError
		if !errors.As(err, &e) || e.Code != "reauthentication_required" {
			t.Fatal(at, err)
		}
	}
	if err := confirm(DeletionInput{Confirmation: user.Email}, user, 400, 1000); err != nil {
		t.Fatal(err)
	}
	if err := confirm(DeletionInput{Confirmation: user.Email, CurrentPassword: ptr("unexpected")}, user, 1000, 1000); err == nil {
		t.Fatal("OAuth password field accepted")
	}
}
func TestProfileNormalizationAndLength(t *testing.T) {
	p := ProfileInput{Name: "  Ana \n Maria  "}
	if err := p.Validate(); err != nil || p.Name != "Ana Maria" {
		t.Fatal(p, err)
	}
	for _, name := range []string{"", "x", strings.Repeat("x", 81)} {
		p.Name = name
		if p.Validate() == nil {
			t.Fatal("invalid name", name)
		}
	}
}

type passAuth struct{}

func (passAuth) Require(h http.HandlerFunc) http.Handler             { return h }
func (passAuth) RequireDeletionAuth(h http.HandlerFunc) http.Handler { return h }
func (passAuth) Limit(h http.HandlerFunc, _ string, _ int, _ time.Duration) http.HandlerFunc {
	return h
}
func TestHTTPRejectsUnknownFieldsWrongContentTypeAndOversizedBody(t *testing.T) {
	r := httprouter.New()
	New(nil, passAuth{}, nil, nil, Config{}).Register(r)
	for _, tc := range []struct {
		content, body string
		status        int
	}{{"text/plain", `{"name":"Ana"}`, 415}, {"application/json", `{"name":"Ana","credits":999999}`, 400}, {"application/json", `{"name":"` + strings.Repeat("x", 5000) + `"}`, 413}, {"application/json", "null", 400}} {
		w := httptest.NewRecorder()
		req := httptest.NewRequest("PATCH", "/api/user/profile", strings.NewReader(tc.body))
		req.Header.Set("Content-Type", tc.content)
		r.ServeHTTP(w, req)
		if w.Code != tc.status {
			t.Fatal(w.Code, w.Body.String())
		}
	}
}
