package scripts

import (
	"context"
	"database/sql"
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
	auth       *identity.Handler
	generator  gemini.Generator
	repository *Repository
}

func New(auth *identity.Handler, generator gemini.Generator) *Handler {
	return &Handler{auth: auth, generator: generator}
}
func NewWithDB(db *sql.DB, auth *identity.Handler, generator gemini.Generator) *Handler {
	return &Handler{auth: auth, generator: generator, repository: NewRepository(db)}
}
func (h *Handler) Register(router *httprouter.Router) {
	router.Handler(http.MethodPost, "/api/scripts/generate", h.auth.RequireMember(h.auth.Limit(h.generate, "scripts", 30, time.Hour)))
	if h.repository != nil {
		router.Handler(http.MethodGet, "/api/scripts/items", h.auth.Require(h.listItems))
		router.Handler(http.MethodPost, "/api/scripts/items", h.auth.RequireMember(h.auth.Limit(h.createItem, "scripts:mutations", 240, time.Hour)))
		router.Handler(http.MethodGet, "/api/scripts/items/:id", h.auth.Require(h.getItem))
		router.Handler(http.MethodPatch, "/api/scripts/items/:id", h.auth.RequireMember(h.auth.Limit(h.updateItem, "scripts:mutations", 240, time.Hour)))
		router.Handler(http.MethodDelete, "/api/scripts/items/:id", h.auth.RequireMember(h.auth.Limit(h.archiveItem, "scripts:mutations", 240, time.Hour)))
		router.Handler(http.MethodGet, "/api/scripts/items/:id/versions", h.auth.Require(h.listVersions))
		router.Handler(http.MethodPost, "/api/scripts/items/:id/versions/:versionID/restore", h.auth.RequireMember(h.auth.Limit(h.restoreVersion, "scripts:mutations", 240, time.Hour)))
	}
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
	platform := map[string]string{"tiktok": "TikTok", "instagram": "Instagram Reels", "facebook": "Facebook Reels", "youtube": "YouTube Shorts", "linkedin": "LinkedIn"}[input.Platform]
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
	if input.Validate() != nil {
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

func (input Request) Validate() error {
	if utf8.RuneCountInString(input.Topic) < 3 || utf8.RuneCountInString(input.Topic) > 1000 || input.Duration < 15 || input.Duration > 180 || len(input.Audience) > 2000 || len(input.Platform) > 100 || len(input.Tone) > 200 || len(input.Language) > 100 || len(input.Style) > 100 {
		return errors.New("Script parameters are invalid")
	}
	return nil
}

// GenerateDraft uses the manual generator's exact prompt, validation and normalization.
// The draft is not persisted until the separate saved-script operation is requested.
func GenerateDraft(ctx context.Context, generator gemini.Generator, input Request) (map[string]any, error) {
	if err := input.Validate(); err != nil {
		return nil, err
	}
	if generator == nil {
		return nil, gemini.ErrNotConfigured
	}
	raw, err := generator.Generate(ctx, BuildPrompt(input))
	if err != nil {
		return nil, err
	}
	object, err := gemini.ExtractJSON(raw)
	if err != nil {
		return nil, err
	}
	return Normalize(object), nil
}
