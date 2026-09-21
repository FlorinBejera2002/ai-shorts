package jsonutil

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestReadRejectsInvalidRequestBodies(t *testing.T) {
	for name, body := range map[string]string{
		"empty":         "",
		"malformed":     `{"name":`,
		"unknown field": `{"unexpected":true}`,
		"wrong type":    `{"name":123}`,
		"two values":    `{"name":"first"} {"name":"second"}`,
		"oversized":     `{"name":"` + strings.Repeat("x", 1_048_576) + `"}`,
	} {
		t.Run(name, func(t *testing.T) {
			var input struct {
				Name string `json:"name"`
			}
			r := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(body))
			if err := Read(httptest.NewRecorder(), r, &input); err == nil {
				t.Fatal("expected body rejection")
			}
		})
	}
}

func TestReadPreservesExplicitFalseAndDefaults(t *testing.T) {
	for _, body := range []string{`{}`, `{"enabled":false}`} {
		input := struct {
			Enabled bool `json:"enabled"`
		}{Enabled: true}
		r := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(body))
		if err := Read(httptest.NewRecorder(), r, &input); err != nil {
			t.Fatal(err)
		}
		if input.Enabled != (body == `{}`) {
			t.Fatalf("default or explicit false lost for %s", body)
		}
	}
}

func TestWriteDoesNotCommitHeadersOnEncodingFailure(t *testing.T) {
	response := httptest.NewRecorder()
	err := Write(response, http.StatusCreated, Envelope{"invalid": make(chan int)}, http.Header{"X-Test": {"value"}})
	if err == nil || response.Body.Len() != 0 || response.Header().Get("X-Test") != "" {
		t.Fatal("encoding failure should leave response uncommitted")
	}
}
