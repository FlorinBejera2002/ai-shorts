// Package airouting owns runtime AI model selection. Configuration contains
// provider/model identifiers only; credentials remain process dependencies.
package airouting

import (
	"context"
	"errors"

	"sneepcut/backend-go/internal/aiprovider"
)

var (
	ErrConflict             = errors.New("AI routing was changed by another administrator; reload before saving")
	ErrInvalidConfiguration = errors.New("invalid AI routing configuration")
	ErrCatalogUnavailable   = errors.New("AI model catalog is unavailable; retry before saving")
)

type Route struct {
	Provider string `json:"provider"`
	Model    string `json:"model"`
}

type Configuration struct {
	Version int64                     `json:"version"`
	Routes  map[aiprovider.Task]Route `json:"routes"`
}

type Store interface {
	Load(context.Context) (Configuration, error)
	Save(context.Context, int64, map[aiprovider.Task]Route, string, string) (Configuration, error)
}

type Model struct {
	ID              string   `json:"id"`
	Name            string   `json:"name"`
	Provider        string   `json:"provider"`
	InputModalities []string `json:"inputModalities"`
}

type Catalog interface {
	Models(context.Context) ([]Model, error)
}

type Stage struct {
	Stage              aiprovider.Task `json:"stage"`
	Label              string          `json:"label"`
	Description        string          `json:"description"`
	RequiredModalities []string        `json:"requiredModalities"`
}

type StageRoute struct {
	Stage
	Route
	Source string `json:"source"`
}

type Provider struct {
	ID         string `json:"id"`
	Configured bool   `json:"configured"`
}

type View struct {
	Version            int64        `json:"version"`
	Routes             []StageRoute `json:"routes"`
	Models             []Model      `json:"models"`
	Providers          []Provider   `json:"providers"`
	CatalogUnavailable bool         `json:"catalogUnavailable,omitempty"`
}

// Stages returns a fresh copy so API callers cannot mutate the routing policy.
func Stages() []Stage {
	return []Stage{
		{aiprovider.TaskSourceAnalysis, "Analiza surselor", "Identifică subiectele și contextul din cadrele filmărilor.", []string{"text", "image"}},
		{aiprovider.TaskSpeechReview, "Verificarea vorbirii", "Verifică ce se aude în fragmentele propuse pentru subtitrare.", []string{"text", "audio"}},
		{aiprovider.TaskHighlights, "Selecția momentelor", "Alege fragmente relevante din transcriere pentru clipurile scurte.", []string{"text"}},
		{aiprovider.TaskStoryPlanning, "Planificarea montajului", "Construiește povestea și ordinea secvențelor, inclusiv pentru narațiune.", []string{"text"}},
		{aiprovider.TaskStoryReview, "Verificarea planului", "Evaluează coerența, fidelitatea și corecțiile planului de montaj.", []string{"text"}},
		{aiprovider.TaskTransitions, "Deciziile de tranziție", "Evaluează continuitatea dintre secvențe înainte de randare.", []string{"text"}},
		{aiprovider.TaskVideoReview, "Verificarea video finală", "Analizează filmarea randată, sunetul și cadrele de la tăieturi.", []string{"text", "image", "audio", "video"}},
		{aiprovider.TaskScripts, "Scenarii", "Scrie și revizuiește scenarii pentru conținut.", []string{"text"}},
		{aiprovider.TaskAssistant, "Asistent", "Răspunde în asistentul de creare și editare.", []string{"text"}},
		{aiprovider.TaskWorkspaceAgent, "Agentul proiectului", "Planifică acțiuni și revizuiește propuneri în proiect.", []string{"text"}},
		{aiprovider.TaskStudioEditing, "Studio: editarea compoziției", "Propune modificări HTML, animații și efecte pentru compoziția din Studio.", []string{"text"}},
	}
}
