package airouting

import (
	"errors"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/julienschmidt/httprouter"
	"sneepcut/backend-go/internal/aiprovider"
)

func TestStudioRoutingRequiresSecretAndTracksSavedRoute(t *testing.T) {
	s, store, _ := routingFixture()
	secret := strings.Repeat("fixture-secret", 4)
	router := httprouter.New()
	s.StudioRegistration(secret)(router)
	request := func(key string) *httptest.ResponseRecorder {
		r := httptest.NewRequest("GET", "/api/internal/ai-routing/studio", nil)
		r.Header.Set("X-Studio-Agent-Secret", key)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, r)
		return w
	}
	for _, key := range []string{"", "wrong"} {
		if w := request(key); w.Code != 401 {
			t.Fatalf("unauthorized: %d", w.Code)
		}
	}
	w := request(secret)
	if w.Code != 200 || !strings.Contains(w.Body.String(), "claude-sonnet") || strings.Contains(w.Body.String(), "private") || w.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("initial response: %d %s", w.Code, w.Body.String())
	}
	store.configuration.Routes[aiprovider.TaskStudioEditing] = Route{"gemini", "gemini-3.8-flash"}
	w = request(secret)
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"provider":"gemini"`) {
		t.Fatalf("live response: %s", w.Body.String())
	}
	store.loadError = errors.New("database credentials must not escape")
	w = request(secret)
	if w.Code != 503 || strings.Contains(w.Body.String(), "credentials") {
		t.Fatalf("error: %d %s", w.Code, w.Body.String())
	}
}

func TestStudioBackgroundRouteUsesOnlyInstalledAdapterModel(t *testing.T) {
	secret := strings.Repeat("fixture-secret", 4)
	s := NewService(nil, Options{StudioConfigured: true}, nil)
	router := httprouter.New()
	s.StudioRegistration(secret)(router)
	r := httptest.NewRequest("GET", "/api/internal/ai-routing/studio-background", nil)
	r.Header.Set("X-Studio-Agent-Secret", secret)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, r)
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"model":"u2net_human_seg"`) || !strings.Contains(w.Body.String(), `"provider":"u2net_onnx"`) {
		t.Fatalf("unexpected background route: %d %s", w.Code, w.Body.String())
	}
	view, err := s.View(r.Context())
	if err != nil || len(view.Routes) != len(Stages())+1 {
		t.Fatalf("missing background stage: %#v %v", view, err)
	}
}
