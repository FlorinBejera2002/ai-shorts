// Package workspaceagent coordinates durable, scoped platform actions.
package workspaceagent

import (
	"context"
	"encoding/json"
	"time"
)

type Scope struct {
	StudioSelection []string `json:"studio_selection,omitempty"`
	Route           string   `json:"route"`
	ProjectID       string   `json:"project_id,omitempty"`
	ClipID          string   `json:"clip_id,omitempty"`
}
type Action struct {
	Name  string          `json:"name"`
	Input json.RawMessage `json:"input"`
}
type ActionResult struct {
	Summary string          `json:"summary"`
	Route   string          `json:"route,omitempty"`
	Data    json.RawMessage `json:"data,omitempty"`
	Pending bool            `json:"pending"`
	Undo    json.RawMessage `json:"undo,omitempty"`
}
type Capability struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Risk        string `json:"risk"`
	CostCredits int    `json:"cost_credits"`
	Available   bool   `json:"available"`
	Limitation  string `json:"limitation,omitempty"`
}
type Executor interface {
	Catalog() []Capability
	Context(context.Context, string, Scope) (json.RawMessage, error)
	Execute(context.Context, string, string, Action) (ActionResult, error)
	Poll(context.Context, string, Action, ActionResult) (ActionResult, error)
	Cancel(context.Context, string, Action, ActionResult) error
}
type Run struct {
	ApprovalPreview  json.RawMessage `json:"approval_preview,omitempty"`
	ResourceIDs      []string        `json:"resource_ids"`
	MissingResources []ResourceNeed  `json:"missing_resources"`
	Steps            []Step          `json:"steps"`
	Continue         bool            `json:"-"`
	ID               string          `json:"id"`
	Message          string          `json:"message"`
	Reply            string          `json:"reply"`
	Status           string          `json:"status"`
	Context          Scope           `json:"context"`
	Action           *Action         `json:"action,omitempty"`
	Result           *ActionResult   `json:"result,omitempty"`
	Error            string          `json:"error,omitempty"`
	CostCredits      int             `json:"cost_credits"`
	Revision         int             `json:"revision"`
	CreatedAt        time.Time       `json:"created_at"`
	UpdatedAt        time.Time       `json:"updated_at"`
	UserID           string          `json:"-"`
	SessionID        string          `json:"-"`
}
type ResourceNeed struct {
	Kind     string `json:"kind"`
	Label    string `json:"label"`
	TargetID string `json:"target_id,omitempty"`
}
type Step struct {
	Action Action       `json:"action"`
	Result ActionResult `json:"result"`
}
type Suggestion struct {
	Continue         bool     `json:"continue,omitempty"`
	ID               string   `json:"id"`
	Title            string   `json:"title"`
	Description      string   `json:"description"`
	Action           Action   `json:"action"`
	Context          Scope    `json:"context"`
	MissingResources []string `json:"missing_resources"`
	CostCredits      int      `json:"cost_credits"`
}
