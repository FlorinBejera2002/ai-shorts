package airouting

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"slices"
	"strings"
	"time"

	"sneepcut/backend-go/internal/aiprovider"
	"sneepcut/backend-go/internal/gemini"
	"sneepcut/backend-go/internal/openrouter"
)

type Service struct {
	store    Store
	options  Options
	catalog  Catalog
	defaults map[aiprovider.Task]Route
	native   NativeOptions
}

func NewService(store Store, options Options, catalog Catalog) *Service {
	options.GeminiKey = strings.TrimSpace(options.GeminiKey)
	options.OpenRouterKey = strings.TrimSpace(options.OpenRouterKey)
	if catalog == nil {
		catalog = NewOpenRouterCatalog()
	}
	return &Service{store: store, options: options, catalog: catalog, defaults: defaultRoutes(options)}
}

// A task must be selected before generation so new callers cannot accidentally
// send every responsibility through a global model.
func (s *Service) Generate(context.Context, string) (string, error) {
	return "", errors.New("an AI task must be selected before generation")
}

func (s *Service) load(ctx context.Context) (Configuration, error) {
	if s.store == nil {
		return Configuration{Routes: map[aiprovider.Task]Route{}}, nil
	}
	ctx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	return s.store.Load(ctx)
}

// ForTask reads committed configuration at each call boundary. The returned
// client is immutable with respect to later admin changes, including its cache
// identity. Database failures never silently fall back to another model.
func (s *Service) ForTask(ctx context.Context, task aiprovider.Task) (aiprovider.Generator, error) {
	route, err := s.RouteForTask(ctx, task)
	if err != nil {
		return nil, err
	}
	switch route.Provider {
	case "openrouter":
		return openrouter.New(s.options.OpenRouterKey, route.Model, s.options.AppURL), nil
	case "gemini":
		return gemini.New(s.options.GeminiKey, route.Model), nil
	default:
		return nil, ErrInvalidConfiguration
	}
}

// RouteForTask shares identifiers with trusted services without exposing keys.
func (s *Service) RouteForTask(ctx context.Context, task aiprovider.Task) (Route, error) {
	route, ok := s.defaults[task]
	if !ok {
		return Route{}, fmt.Errorf("%w: unknown stage", ErrInvalidConfiguration)
	}
	configuration, err := s.load(ctx)
	if err != nil {
		return Route{}, err
	}
	if override, exists := configuration.Routes[task]; exists {
		route = override
	}
	if !validModelID(route.Model) {
		return Route{}, ErrInvalidConfiguration
	}
	if !s.configured(route.Provider) {
		return Route{}, aiprovider.ErrNotConfigured
	}
	return route, nil
}

func (s *Service) configured(provider string) bool {
	switch provider {
	case "gemini":
		return s.options.GeminiKey != ""
	case "openrouter":
		return s.options.OpenRouterKey != ""
	case "u2net_onnx":
		return s.options.StudioConfigured
	case "whisper_cpp", "silero", "pigo":
		for _, model := range s.installedModels() {
			if model.Provider == provider {
				return true
			}
		}
		return false
	default:
		return false
	}
}

func (s *Service) models(ctx context.Context) ([]Model, error) {
	models := []Model{}
	if s.options.StudioConfigured {
		models = append(models, Model{ID: "u2net_human_seg", Name: "U²-Net Human Segmentation", Provider: "u2net_onnx", InputModalities: []string{"image", "segmentation"}})
	}
	for _, model := range s.installedModels() {
		models = append(models, model.Model)
	}
	if s.configured("gemini") {
		models = append(models, geminiModels()...)
	}
	if s.configured("openrouter") {
		remote, err := s.catalog.Models(ctx)
		if err != nil {
			return models, ErrCatalogUnavailable
		}
		models = append(models, remote...)
	}
	return models, nil
}

func (s *Service) View(ctx context.Context) (View, error) {
	configuration, err := s.load(ctx)
	if err != nil {
		return View{}, err
	}
	view := View{Version: configuration.Version, Routes: []StageRoute{}, Providers: []Provider{
		{ID: "openrouter", Configured: s.configured("openrouter")},
		{ID: "gemini", Configured: s.configured("gemini")},
	}}
	for _, provider := range []string{"whisper_cpp", "silero", "pigo", "u2net_onnx"} {
		if s.configured(provider) {
			view.Providers = append(view.Providers, Provider{ID: provider, Configured: true})
		}
	}
	for _, stage := range s.configuredStages(configuration) {
		route, source := s.defaults[stage.Stage], "default"
		if override, exists := configuration.Routes[stage.Stage]; exists {
			route, source = override, "override"
		}
		view.Routes = append(view.Routes, StageRoute{Stage: stage, Route: route, Source: source})
	}
	view.Models, err = s.models(ctx)
	view.CatalogUnavailable = err != nil
	return view, nil
}

var modelIDPattern = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,199}$`)

func validModelID(model string) bool {
	return modelIDPattern.MatchString(model) && !strings.Contains(model, "://") && !strings.Contains(model, "..")
}

func (s *Service) Update(ctx context.Context, expectedVersion int64, routes map[aiprovider.Task]Route, actorID, reason string) (Configuration, error) {
	reason = strings.TrimSpace(reason)
	if expectedVersion < 0 || len([]rune(reason)) < 5 || len([]rune(reason)) > 500 || actorID == "" {
		return Configuration{}, ErrInvalidConfiguration
	}
	current, err := s.load(ctx)
	if err != nil {
		return Configuration{}, err
	}
	if current.Version != expectedVersion {
		return Configuration{}, ErrConflict
	}
	stages := s.configuredStages(current)
	if len(routes) != len(stages) {
		return Configuration{}, ErrInvalidConfiguration
	}
	models, err := s.models(ctx)
	if err != nil {
		return Configuration{}, err
	}
	validated := make(map[aiprovider.Task]Route, len(stages))
	for _, stage := range stages {
		route, exists := routes[stage.Stage]
		if !exists || !validModelID(route.Model) || !s.configured(route.Provider) {
			return Configuration{}, fmt.Errorf("%w: %s has an unavailable provider or model", ErrInvalidConfiguration, stage.Stage)
		}
		index := slices.IndexFunc(models, func(model Model) bool { return model.Provider == route.Provider && model.ID == route.Model })
		if index < 0 {
			return Configuration{}, fmt.Errorf("%w: %s model is absent from the catalog", ErrInvalidConfiguration, stage.Stage)
		}
		for _, modality := range stage.RequiredModalities {
			if !slices.Contains(models[index].InputModalities, modality) {
				return Configuration{}, fmt.Errorf("%w: %s requires %s input", ErrInvalidConfiguration, stage.Stage, modality)
			}
		}
		validated[stage.Stage] = route
	}
	if s.store == nil {
		return Configuration{}, errors.New("AI routing persistence is unavailable")
	}
	return s.store.Save(ctx, expectedVersion, validated, actorID, reason)
}
