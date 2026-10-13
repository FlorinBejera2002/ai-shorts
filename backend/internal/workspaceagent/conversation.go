package workspaceagent

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"sort"
	"strings"

	"sneepcut/backend-go/internal/data"
)

// History supplies references for follow-up requests, never permission or a
// current mutation revision. Re-inspection is required before changing a target.
type conversationTurn struct {
	ID      string             `json:"run_id"`
	Message string             `json:"message"`
	Reply   string             `json:"reply"`
	Status  string             `json:"status"`
	Context Scope              `json:"context"`
	Steps   []conversationStep `json:"verified_steps,omitempty"`
	Error   string             `json:"error,omitempty"`
}

type conversationStep struct {
	Action     string              `json:"action"`
	Summary    string              `json:"summary"`
	References []map[string]string `json:"references,omitempty"`
}

func (h *Handler) conversationHistory(ctx context.Context, r Run) ([]conversationTurn, error) {
	rows, err := h.db.QueryContext(ctx, `SELECT `+runColumns+` FROM workspace_agent_runs WHERE user_id=$1 AND (created_at,id)<($2,$3::uuid) AND history_cleared_at IS NULL ORDER BY created_at DESC,id DESC LIMIT 6`, r.UserID, r.CreatedAt, r.ID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	previous := []conversationTurn{}
	historyBytes := 0
	for rows.Next() {
		run, err := scanRun(rows)
		if err != nil {
			return nil, err
		}
		turn := conversationTurn{ID: run.ID, Message: clipText(run.Message, 1000), Reply: clipText(run.Reply, 1500), Status: run.Status, Context: run.Context, Error: clipText(run.Error, 500)}
		turn.Steps = make([]conversationStep, len(run.Steps))
		remainingReferences := 6
		// Most recent results get the reference budget; earlier steps retain
		// their verified summaries so partial requests are not repeated.
		for index := len(run.Steps) - 1; index >= 0; index-- {
			step := run.Steps[index]
			references := historyReferences(step.Result.Data)
			references = references[:min(len(references), remainingReferences)]
			remainingReferences -= len(references)
			turn.Steps[index] = conversationStep{Action: step.Action.Name, Summary: clipText(step.Result.Summary, 400), References: references}
		}
		historyBytes += len(encode(turn))
		if historyBytes > 20000 {
			break
		}
		previous = append(previous, turn)
	}
	return previous, rows.Err()
}

// Keep only bounded, stable references from verified results. Do not carry old
// revisions, signed media URLs, document bodies or provider data into new work.
func historyReferences(raw json.RawMessage) []map[string]string {
	var value any
	if json.Unmarshal(raw, &value) != nil {
		return nil
	}
	out := []map[string]string{}
	seen := map[string]bool{}
	var visit func(any, int)
	visit = func(value any, depth int) {
		if depth > 6 || len(out) >= 12 {
			return
		}
		switch item := value.(type) {
		case map[string]any:
			ref := map[string]string{}
			for _, key := range []string{"id", "project_id", "clip_id", "job_id", "story_id", "resource_id", "draft_id", "asset_id"} {
				if id, ok := item[key].(string); ok && historyReferenceID(key, id) {
					ref[key] = id
				}
			}
			if len(ref) > 0 {
				for _, key := range []string{"name", "title", "kind"} {
					if label, ok := item[key].(string); ok && strings.TrimSpace(label) != "" {
						ref[key] = clipText(label, 120)
					}
				}
				key := digest(ref)
				if !seen[key] {
					seen[key] = true
					out = append(out, ref)
				}
			}
			keys := make([]string, 0, len(item))
			for key := range item {
				keys = append(keys, key)
			}
			sort.Strings(keys)
			for _, key := range keys {
				visit(item[key], depth+1)
			}
		case []any:
			for _, child := range item {
				visit(child, depth+1)
			}
		}
	}
	visit(value, 0)
	return out
}

func historyReferenceID(key, value string) bool {
	if data.ValidUUID(value) {
		return true
	}
	if key == "asset_id" && len(value) == 64 {
		_, err := hex.DecodeString(value)
		return err == nil
	}
	// Studio render identities contain their owned project UUID and a suffix.
	if key != "job_id" || len(value) <= 37 || len(value) > 160 || value[36] != '_' || !data.ValidUUID(value[:36]) {
		return false
	}
	for _, character := range value[37:] {
		if !((character >= 'a' && character <= 'z') || (character >= 'A' && character <= 'Z') || (character >= '0' && character <= '9') || strings.ContainsRune("_.-", character)) {
			return false
		}
	}
	return true
}
