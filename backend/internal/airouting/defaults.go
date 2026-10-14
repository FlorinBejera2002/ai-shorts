package airouting

import "sneepcut/backend-go/internal/aiprovider"

type Options struct {
	Provider         string
	GeminiKey        string
	OpenRouterKey    string
	AppURL           string
	StudioConfigured bool
}

func defaultRoutes(options Options) map[aiprovider.Task]Route {
	provider := "gemini"
	if options.Provider == "openrouter" || ((options.Provider == "auto" || options.Provider == "") && options.GeminiKey == "" && options.OpenRouterKey != "") {
		provider = "openrouter"
	}
	models := map[aiprovider.Task]string{
		aiprovider.TaskSourceAnalysis: "qwen/qwen3.8-omni-flash",
		aiprovider.TaskSpeechReview:   "qwen/qwen3.8-omni-flash",
		aiprovider.TaskHighlights:     "openai/gpt-6.1-sol",
		aiprovider.TaskStoryPlanning:  "openai/gpt-6.1-sol",
		aiprovider.TaskStoryReview:    "anthropic/claude-sonnet-5.5",
		aiprovider.TaskTransitions:    "openai/gpt-6-luna",
		aiprovider.TaskVideoReview:    "google/gemini-3.8-flash",
		aiprovider.TaskScripts:        "anthropic/claude-sonnet-5.5",
		aiprovider.TaskAssistant:      "openai/gpt-6-luna",
		aiprovider.TaskWorkspaceAgent: "openai/gpt-6.1-sol",
		aiprovider.TaskStudioEditing:  "anthropic/claude-sonnet-5.5",
	}
	routes := make(map[aiprovider.Task]Route, len(models))
	for task, model := range models {
		if provider == "gemini" {
			model = "gemini-3.8-flash"
			if task == aiprovider.TaskStoryPlanning || task == aiprovider.TaskStoryReview || task == aiprovider.TaskWorkspaceAgent {
				model = "gemini-4-argon"
			}
		}
		routes[task] = Route{Provider: provider, Model: model}
	}
	if options.StudioConfigured {
		routes[aiprovider.TaskStudioBackground] = Route{Provider: "u2net_onnx", Model: "u2net_human_seg"}
	}
	return routes
}

// The direct Gemini adapter exposes a curated set with documented multimodal
// support. OpenRouter's choices are discovered from its live model catalog.
func geminiModels() []Model {
	models := []Model{}
	for _, id := range []string{"gemini-2.5-flash", "gemini-2.5-pro", "gemini-3.8-flash", "gemini-4-argon"} {
		models = append(models, Model{ID: id, Name: id, Provider: "gemini", InputModalities: []string{"text", "image", "audio", "video"}})
	}
	return models
}
