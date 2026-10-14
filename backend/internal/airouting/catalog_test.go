package airouting

import (
	"context"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"
)

type catalogTransport func(*http.Request) (*http.Response, error)

func (f catalogTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestCatalogFiltersAndCachesIndependentCopies(t *testing.T) {
	calls := 0
	c := NewOpenRouterCatalog()
	c.HTTP = &http.Client{Transport: catalogTransport(func(r *http.Request) (*http.Response, error) {
		calls++
		if r.Method != "GET" || r.Header.Get("Authorization") != "" || r.Body != nil {
			t.Fatal("catalog request sent private data")
		}
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(`{"data":[
		{"id":"vendor/image","architecture":{"input_modalities":["text"],"output_modalities":["image"]}},
		{"id":"vendor/video-review","name":"Reviewer","architecture":{"input_modalities":["text","image","audio","video"],"output_modalities":["text"]}},
		{"id":"vendor/video-review","architecture":{"input_modalities":["text"],"output_modalities":["text"]}},
		{"id":"https://bad","architecture":{"input_modalities":["text"],"output_modalities":["text"]}}
		]}`))}, nil
	})}
	models, err := c.Models(context.Background())
	if err != nil || len(models) != 1 {
		t.Fatalf("models: %#v, %v", models, err)
	}
	models[0].InputModalities[0] = "modified"
	next, err := c.Models(context.Background())
	if err != nil || calls != 1 || next[0].InputModalities[0] != "text" {
		t.Fatal("cache did not isolate callers")
	}
	c.expires = time.Time{}
	c.HTTP = &http.Client{Transport: catalogTransport(func(*http.Request) (*http.Response, error) { return nil, errors.New("sensitive failure") })}
	if _, err = c.Models(context.Background()); !errors.Is(err, ErrCatalogUnavailable) || strings.Contains(err.Error(), "sensitive") {
		t.Fatalf("failed refresh: %v", err)
	}
}

func TestCatalogRejectsInvalidResponses(t *testing.T) {
	for _, body := range []string{`no json`, `{}`, `{"data":[]}`, strings.Repeat("x", (8<<20)+1)} {
		c := NewOpenRouterCatalog()
		c.HTTP = &http.Client{Transport: catalogTransport(func(*http.Request) (*http.Response, error) {
			return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(body))}, nil
		})}
		if _, err := c.Models(context.Background()); !errors.Is(err, ErrCatalogUnavailable) {
			t.Fatal("accepted invalid catalog")
		}
	}
}
