package brand

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"sneepcut/backend-go/internal/agentaction"
	"sneepcut/backend-go/internal/data"
)

type AgentState struct {
	Settings      map[string]any `json:"settings"`
	ExpectedState string         `json:"expected_state"`
	Configured    bool           `json:"configured"`
	HasLogo       bool           `json:"has_logo"`
	Previous      map[string]any `json:"previous,omitempty"`
}
type AgentUpdate struct {
	RequestID     string         `json:"request_id"`
	ExpectedState string         `json:"expected_state"`
	Settings      map[string]any `json:"settings"`
}
type queryRow interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

func readAgentState(ctx context.Context, q queryRow, user string, lock bool) (AgentState, error) {
	var raw []byte
	suffix := ""
	if lock {
		suffix = " FOR UPDATE"
	}
	err := q.QueryRowContext(ctx, `SELECT to_jsonb(b) FROM brand_kits b WHERE user_id=$1`+suffix, user).Scan(&raw)
	out := AgentState{Settings: map[string]any{"primaryColor": "#6366F1", "secondaryColor": "#8B5CF6", "fontFamily": "Inter", "applyBrandColors": false, "applyBrandFont": false, "subtitleFont": "Inter Bold", "subtitleColor": "#FFFFFF", "subtitleBgColor": "#000000", "subtitleBgOpacity": 0.7, "subtitlePosition": "bottom", "watermarkPosition": "bottom-right", "watermarkOpacity": 0.8, "hidePlatformBadge": false}}
	if errors.Is(err, sql.ErrNoRows) {
		raw = []byte("absent")
	} else if err != nil {
		return out, err
	} else {
		var row map[string]any
		if err = json.Unmarshal(raw, &row); err != nil {
			return out, err
		}
		out.Configured = true
		out.HasLogo = row["logo_path"] != nil
		for key, column := range columns {
			out.Settings[key] = row[column]
		}
	}
	out.ExpectedState = agentaction.SnapshotDigest(raw)
	return out, nil
}
func (r *Repository) AgentRead(ctx context.Context, user string) (AgentState, error) {
	return readAgentState(ctx, r.db, user, false)
}

func (r *Repository) AgentUpdate(ctx context.Context, user string, in AgentUpdate) (AgentState, error) {
	if !data.ValidUUID(in.RequestID) || len(in.ExpectedState) != 64 {
		return AgentState{}, ErrInvalid
	}
	return r.update(ctx, user, in.Settings, &in)
}
