package projects

import (
	"context"
	"database/sql"
	"encoding/json"
	"sneepcut/backend-go/internal/agentaction"
)

type ProjectBrandInput struct {
	ProjectID      string            `json:"project_id"`
	ExpectedState  string            `json:"expected_state"`
	Settings       map[string]string `json:"settings,omitempty"`
	LogoResourceID *string           `json:"logo_resource_id,omitempty"`
	ReceiptID      string            `json:"receipt_id,omitempty"`
}
type ProjectBrandState struct {
	ProjectID     string            `json:"project_id"`
	Settings      map[string]string `json:"settings"`
	HasLogo       bool              `json:"has_logo"`
	ExpectedState string            `json:"expected_state"`
	UndoReceiptID string            `json:"undo_receipt_id,omitempty"`
}

// Private prior values only live in the server's domain receipt, never results.
type projectBrandReceipt struct {
	State    ProjectBrandState `json:"state"`
	Previous json.RawMessage   `json:"previous"`
}

var projectBrandFields = map[string]bool{"name": true, "primaryColor": true, "secondaryColor": true, "fontFamily": true, "subtitleFont": true, "subtitleColor": true}

func readProjectBrand(ctx context.Context, tx *sql.Tx, user, project string) (ProjectBrandState, json.RawMessage, error) {
	snapshot, err := librarySnapshot(ctx, tx, user, project)
	if err != nil {
		return ProjectBrandState{}, nil, err
	}
	var raw []byte
	err = tx.QueryRowContext(ctx, `SELECT COALESCE(project_brand,'{}'::jsonb) FROM jobs WHERE id=$1 AND user_id=$2`, project, user).Scan(&raw)
	out := ProjectBrandState{ProjectID: project, ExpectedState: snapshot.ExpectedState, Settings: map[string]string{}}
	if err != nil {
		return out, nil, err
	}
	var values map[string]any
	if err = json.Unmarshal(raw, &values); err != nil {
		return out, nil, err
	}
	for k, v := range values {
		if s, ok := v.(string); ok {
			if projectBrandFields[k] {
				out.Settings[k] = s
			}
			if k == "logoPath" && s != "" {
				out.HasLogo = true
			}
		}
	}
	return out, raw, nil
}
func (r *Repository) InspectProjectBrand(ctx context.Context, user, project string) (ProjectBrandState, error) {
	if !uuidPattern.MatchString(project) {
		return ProjectBrandState{}, ErrInvalid
	}
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return ProjectBrandState{}, err
	}
	defer tx.Rollback()
	if err = lockLibrary(ctx, tx, user, project); err != nil {
		return ProjectBrandState{}, err
	}
	out, _, err := readProjectBrand(ctx, tx, user, project)
	if err != nil {
		return out, err
	}
	return out, tx.Commit()
}
func (r *Repository) ChangeProjectBrand(ctx context.Context, user, request, action string, in ProjectBrandInput) (ProjectBrandState, error) {
	if !uuidPattern.MatchString(in.ProjectID) || !uuidPattern.MatchString(request) || len(in.ExpectedState) != 64 {
		return ProjectBrandState{}, ErrInvalid
	}
	if action != "projects.brand.update" && action != "projects.brand.restore" {
		return ProjectBrandState{}, ErrInvalid
	}
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return ProjectBrandState{}, err
	}
	defer tx.Rollback()
	var saved projectBrandReceipt
	replay, err := agentaction.Replay(ctx, tx, user, request, action, in, &saved)
	if err != nil {
		return saved.State, err
	}
	if replay {
		return saved.State, tx.Commit()
	}
	if err = lockLibrary(ctx, tx, user, in.ProjectID); err != nil {
		return saved.State, err
	}
	before, previous, err := readProjectBrand(ctx, tx, user, in.ProjectID)
	if err != nil {
		return before, err
	}
	if before.ExpectedState != in.ExpectedState {
		return before, ErrLibraryChanged
	}
	var next json.RawMessage
	if action == "projects.brand.restore" {
		if !uuidPattern.MatchString(in.ReceiptID) || len(in.Settings) > 0 || in.LogoResourceID != nil {
			return before, ErrInvalid
		}
		var source []byte
		err = tx.QueryRowContext(ctx, `SELECT result FROM agent_action_receipts WHERE user_id=$1 AND request_id=$2 AND action='projects.brand.update' AND input->>'project_id'=$3`, user, in.ReceiptID, in.ProjectID).Scan(&source)
		if err != nil {
			return before, err
		}
		var original projectBrandReceipt
		if err = json.Unmarshal(source, &original); err != nil {
			return before, err
		}
		if original.State.ExpectedState != in.ExpectedState {
			return before, ErrLibraryChanged
		}
		next = original.Previous
	} else {
		if in.ReceiptID != "" || len(in.Settings) == 0 && in.LogoResourceID == nil {
			return before, ErrInvalid
		}
		var values map[string]any
		if err = json.Unmarshal(previous, &values); err != nil {
			return before, err
		}
		if values == nil {
			values = map[string]any{}
		}
		for key, value := range in.Settings {
			if !projectBrandFields[key] {
				return before, ErrInvalid
			}
			values[key] = value
		}
		if in.LogoResourceID != nil {
			if *in.LogoResourceID == "" {
				delete(values, "logoPath")
				delete(values, "logoUrl")
			} else {
				if !uuidPattern.MatchString(*in.LogoResourceID) {
					return before, ErrInvalid
				}
				var reference string
				err = tx.QueryRowContext(ctx, `SELECT reference FROM workspace_agent_resources WHERE id=$1 AND user_id=$2 AND kind='logo' AND (project_id IS NULL OR project_id::text=$3)`, *in.LogoResourceID, user, in.ProjectID).Scan(&reference)
				if err != nil {
					return before, err
				}
				values["logoPath"] = reference
				delete(values, "logoUrl")
			}
		}
		next, err = json.Marshal(values)
		if err != nil {
			return before, err
		}
	}
	update := ProjectUpdate{BrandKit: next}
	if err = update.Validate(); err != nil {
		return before, err
	}
	if _, err = updateProject(ctx, tx, user, in.ProjectID, update, false); err != nil {
		return before, err
	}
	after, _, err := readProjectBrand(ctx, tx, user, in.ProjectID)
	if err != nil {
		return after, err
	}
	if action == "projects.brand.update" {
		after.UndoReceiptID = request
	}
	if err = agentaction.Put(ctx, tx, user, request, action, in, projectBrandReceipt{State: after, Previous: previous}); err != nil {
		return after, err
	}
	return after, tx.Commit()
}
