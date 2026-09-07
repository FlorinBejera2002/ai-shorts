package scripts

import (
	_ "embed"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/julienschmidt/httprouter"
	"sneepcut/backend-go/internal/gemini"
	"sneepcut/backend-go/internal/httpx"
	"sneepcut/backend-go/internal/identity"
)

//go:embed prompts/script.txt
var promptTemplate string

type Handler struct {
	auth      *identity.Handler
	generator gemini.Generator
}

func New(auth *identity.Handler, generator gemini.Generator) *Handler {
	return &Handler{auth: auth, generator: generator}
}
func (h *Handler) Register(router *httprouter.Router) {
	router.Handler(http.MethodPost, "/api/scripts/generate", h.auth.RequireMember(h.auth.Limit(h.generate, "scripts", 30, time.Hour)))
}

type Request struct {
	Topic    string `json:"topic"`
	Platform string `json:"platform"`
	Duration int    `json:"duration"`
	Tone     string `json:"tone"`
	Audience string `json:"target_audience"`
	Language string `json:"language"`
	Style    string `json:"style"`
}

func BuildPrompt(input Request) string {
	platform := map[string]string{"tiktok": "TikTok", "instagram": "Instagram Reels", "youtube": "YouTube Shorts", "linkedin": "LinkedIn"}[input.Platform]
	if platform == "" {
		platform = input.Platform
	}
	language := map[string]string{"en": "English", "ro": "Romanian", "es": "Spanish", "fr": "French", "de": "German", "it": "Italian", "pt": "Portuguese"}[input.Language]
	if language == "" {
		language = input.Language
	}
	audience := input.Audience
	if audience == "" {
		audience = "general audience"
	}
	return strings.NewReplacer("{topic}", input.Topic, "{platform}", platform, "{duration}", strconv.Itoa(input.Duration), "{tone}", input.Tone, "{target_audience}", audience, "{language_name}", language, "{style}", input.Style, "{{", "{", "}}", "}").Replace(promptTemplate)
}
func (h *Handler) generate(w http.ResponseWriter, r *http.Request) {
	input := Request{Platform: "tiktok", Duration: 30, Tone: "entertaining", Language: "en", Style: "talking_head"}
	if !httpx.Read(w, r, &input, 16*1024) {
		return
	}
	if utf8.RuneCountInString(input.Topic) < 3 || utf8.RuneCountInString(input.Topic) > 1000 || input.Duration < 15 || input.Duration > 180 || len(input.Audience) > 2000 || len(input.Platform) > 100 || len(input.Tone) > 200 || len(input.Language) > 100 || len(input.Style) > 100 {
		httpx.Error(w, 422, "Script parameters are invalid")
		return
	}
	raw, err := h.generator.Generate(r.Context(), BuildPrompt(input))
	if errors.Is(err, gemini.ErrNotConfigured) {
		httpx.Error(w, 503, err.Error())
		return
	}
	if err != nil {
		httpx.Error(w, 502, "Script generation is temporarily unavailable")
		return
	}
	object, err := gemini.ExtractJSON(raw)
	if err != nil {
		httpx.Error(w, 502, "Script generation returned an invalid response")
		return
	}
	httpx.JSON(w, 200, map[string]any{"script": Normalize(object), "credits_charged": 0})
}
