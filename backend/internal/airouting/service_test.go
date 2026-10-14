package airouting

import (
	"context"
	"errors"
	"strings"
	"testing"

	"sneepcut/backend-go/internal/aiprovider"
)

type memoryStore struct {
	configuration Configuration
	loadError     error
	saves         int
}

func (s *memoryStore) Load(context.Context) (Configuration, error) {
	return s.configuration, s.loadError
}
func (s *memoryStore) Save(_ context.Context, version int64, routes map[aiprovider.Task]Route, _, _ string) (Configuration, error) {
	if version != s.configuration.Version {
		return Configuration{}, ErrConflict
	}
	s.saves++
	s.configuration = Configuration{Version: version + 1, Routes: routes}
	return s.configuration, nil
}

type testCatalog struct {
	models []Model
	err    error
	calls  int
}

func (c *testCatalog) Models(context.Context) ([]Model, error) { c.calls++; return c.models, c.err }

func routingFixture() (*Service, *memoryStore, *testCatalog) {
	store := &memoryStore{configuration: Configuration{Routes: map[aiprovider.Task]Route{}}}
	catalog := &testCatalog{}
	service := NewService(store, Options{Provider: "openrouter", OpenRouterKey: "private-router-key", GeminiKey: "private-gemini-key"}, catalog)
	for _, route := range service.defaults {
		catalog.models = append(catalog.models, Model{ID: route.Model, Provider: route.Provider, InputModalities: []string{"text", "image", "audio", "video"}})
	}
	catalog.models = append(catalog.models, Model{ID: "vendor/text-only", Provider: "openrouter", InputModalities: []string{"text"}})
	return service, store, catalog
}

func TestLiveSelectionAndImmutableMediaIdentity(t *testing.T) {
	s, store, catalog := routingFixture()
	ctx := context.Background()
	before, err := s.ForTask(ctx, aiprovider.TaskSpeechReview)
	if err != nil {
		t.Fatal(err)
	}
	original := before.(aiprovider.MediaModelIdentity).MediaModelIdentity()
	routes := defaultRoutes(s.options)
	routes[aiprovider.TaskSpeechReview] = Route{Provider: "gemini", Model: "gemini-3.8-flash"}
	if _, err = s.Update(ctx, 0, routes, "admin-id", "Change speech reviewer"); err != nil {
		t.Fatal(err)
	}
	after, err := s.ForTask(ctx, aiprovider.TaskSpeechReview)
	if err != nil {
		t.Fatal(err)
	}
	if after.(aiprovider.MediaModelIdentity).MediaModelIdentity() == original {
		t.Fatal("next call retained stale model")
	}
	if before.(aiprovider.MediaModelIdentity).MediaModelIdentity() != original {
		t.Fatal("active call changed identity")
	}
	if catalog.calls != 1 {
		t.Fatal("inference should not query remote catalog")
	}
	store.loadError = errors.New("database unavailable")
	if _, err = s.ForTask(ctx, aiprovider.TaskSpeechReview); err == nil {
		t.Fatal("database failure silently fell back")
	}
}

func TestRejectInvalidOrIncompatibleRouting(t *testing.T) {
	for _, test := range []struct {
		name   string
		change func(map[aiprovider.Task]Route)
	}{
		{"text model for final video", func(r map[aiprovider.Task]Route) {
			r[aiprovider.TaskVideoReview] = Route{"openrouter", "vendor/text-only"}
		}},
		{"unknown model", func(r map[aiprovider.Task]Route) { r[aiprovider.TaskAssistant] = Route{"openrouter", "not/listed"} }},
		{"unknown provider", func(r map[aiprovider.Task]Route) { r[aiprovider.TaskAssistant] = Route{"other", "vendor/text-only"} }},
		{"missing stage", func(r map[aiprovider.Task]Route) { delete(r, aiprovider.TaskScripts) }},
		{"unknown stage", func(r map[aiprovider.Task]Route) {
			delete(r, aiprovider.TaskScripts)
			r["unknown"] = Route{"openrouter", "vendor/text-only"}
		}},
		{"model URL", func(r map[aiprovider.Task]Route) {
			r[aiprovider.TaskAssistant] = Route{"openrouter", "https://invalid"}
		}},
	} {
		t.Run(test.name, func(t *testing.T) {
			s, store, _ := routingFixture()
			routes := defaultRoutes(s.options)
			test.change(routes)
			_, err := s.Update(context.Background(), 0, routes, "admin", "Change routing")
			if !errors.Is(err, ErrInvalidConfiguration) || store.saves != 0 {
				t.Fatalf("unexpected result: %v, saves=%d", err, store.saves)
			}
		})
	}
}

func TestUnavailableCatalogDoesNotCertifyChoices(t *testing.T) {
	s, store, catalog := routingFixture()
	catalog.err = errors.New("upstream unavailable")
	view, err := s.View(context.Background())
	if err != nil || !view.CatalogUnavailable || len(view.Routes) != len(Stages()) {
		t.Fatalf("view: %#v, %v", view, err)
	}
	if _, err = s.Update(context.Background(), 0, defaultRoutes(s.options), "admin", "Change routing"); !errors.Is(err, ErrCatalogUnavailable) || store.saves != 0 {
		t.Fatalf("save: %v", err)
	}
	for _, model := range view.Models {
		if model.Provider == "openrouter" {
			t.Fatal("failed catalog fabricated available model")
		}
	}
}

func TestMissingKeyAndUnboundGenerationFail(t *testing.T) {
	s := NewService(nil, Options{Provider: "openrouter"}, nil)
	if _, err := s.ForTask(context.Background(), aiprovider.TaskAssistant); !errors.Is(err, aiprovider.ErrNotConfigured) {
		t.Fatal(err)
	}
	if _, err := s.Generate(context.Background(), "hello"); err == nil {
		t.Fatal("unbound request accepted")
	}
	if _, err := s.ForTask(context.Background(), "typo"); !errors.Is(err, ErrInvalidConfiguration) {
		t.Fatal(err)
	}
}

func TestViewOmitsSecretsAndUsesDistinctDefaults(t *testing.T) {
	s, _, _ := routingFixture()
	view, err := s.View(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	identities := map[string]bool{}
	for _, route := range view.Routes {
		identities[route.Model] = true
		if strings.Contains(route.Model, "private") {
			t.Fatal("key leaked")
		}
	}
	if len(identities) < 4 {
		t.Fatal("stages collapsed into one model")
	}
}
