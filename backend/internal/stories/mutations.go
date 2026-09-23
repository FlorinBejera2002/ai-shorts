package stories

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"sneepcut/backend-go/internal/story"
	"sort"
)

type AssetEdit struct {
	ID      string `json:"id"`
	Role    string `json:"role"`
	Include string `json:"include"`
	Order   int    `json:"order"`
}
type Lock struct {
	BlockID string `json:"block_id"`
	Locked  bool   `json:"locked"`
	Text    bool   `json:"lock_text"`
	Order   bool   `json:"lock_order"`
	Crop    bool   `json:"lock_crop"`
}
type Patch struct {
	Options *story.Options `json:"options"`
	Assets  []AssetEdit    `json:"assets"`
	Version int            `json:"version"`
	Locks   []Lock         `json:"locks"`
}
type Generate struct {
	Style         *story.Style `json:"style,omitempty"`
	ExpectedState string       `json:"expected_state,omitempty"`
	RequestID     string       `json:"request_id"`
	Action        string       `json:"action"`
	BlockID       string       `json:"block_id"`
	CandidateID   string       `json:"candidate_id"`
	Version       int          `json:"version"`
	AssetIDs      []string     `json:"asset_ids"`
}

func applyLocks(v *story.Version, locks []Lock) {
	for i := range v.Plan.Blocks {
		for _, l := range locks {
			b := &v.Plan.Blocks[i]
			if b.ID == l.BlockID {
				b.Locked = l.Locked
				b.LockText = l.Text
				b.LockOrder = l.Order
				b.LockCrop = l.Crop
			}
		}
	}
}

func (r *Repository) Patch(ctx context.Context, user, id string, in Patch) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err = r.patchTx(ctx, tx, user, id, in); err != nil {
		return err
	}
	return tx.Commit()
}

func (r *Repository) patchTx(ctx context.Context, tx *sql.Tx, user, id string, in Patch) error {
	status, err := lockProject(ctx, tx, user, id)
	if err != nil {
		return err
	}
	if !idle(status) {
		return ErrConflict
	}
	if in.Options != nil {
		if status != "draft" {
			return ErrConflict
		}
		options, e := story.NormalizeOptions(*in.Options)
		if e != nil {
			return fmt.Errorf("%w: %s", ErrInvalid, e)
		}
		if !options.Narration {
			var hasNarration bool
			if err = tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM story_assets WHERE project_id=$1 AND asset->>'kind'='narration')`, id).Scan(&hasNarration); err != nil {
				return err
			}
			if hasNarration {
				return fmt.Errorf("%w: remove the narration before changing story mode", ErrInvalid)
			}
		}
		if _, err = tx.ExecContext(ctx, `UPDATE story_projects SET options=$2,updated_at=now() WHERE id=$1`, id, encoded(options)); err != nil {
			return err
		}
	}
	if in.Assets != nil {
		if status != "draft" {
			return ErrConflict
		}
		seen := map[string]bool{}
		for _, a := range in.Assets {
			if !idPattern.MatchString(a.ID) || seen[a.ID] || a.Order < 0 || a.Order >= r.limits.MaxFiles {
				return ErrInvalid
			}
			seen[a.ID] = true
			switch a.Role {
			case "auto", "a_roll", "b_roll", "alternate_take", "reaction", "transition", "supporting_visual", "low_quality":
			default:
				return ErrInvalid
			}
			switch a.Include {
			case "auto", "required", "excluded":
			default:
				return ErrInvalid
			}
			result, e := tx.ExecContext(ctx, `UPDATE story_assets SET asset=asset || $3::jsonb WHERE project_id=$1 AND id=$2 AND coalesce(asset->>'kind','')<>'narration'`, id, a.ID, encoded(map[string]any{"role": a.Role, "include": a.Include, "order": a.Order}))
			if e != nil {
				return e
			}
			n, _ := result.RowsAffected()
			if n != 1 {
				return sql.ErrNoRows
			}
		}
	}
	if in.Locks != nil {
		var current int
		var raw []byte
		if err = tx.QueryRowContext(ctx, `SELECT p.current_version,v.version FROM story_projects p JOIN story_versions v ON v.project_id=p.id AND v.number=p.current_version WHERE p.id=$1`, id).Scan(&current, &raw); err != nil {
			return err
		}
		if in.Version != current {
			return ErrConflict
		}
		var v story.Version
		if err = json.Unmarshal(raw, &v); err != nil {
			return err
		}
		ids := map[string]bool{}
		for _, b := range v.Plan.Blocks {
			ids[b.ID] = true
		}
		for _, l := range in.Locks {
			if !ids[l.BlockID] {
				return ErrInvalid
			}
			delete(ids, l.BlockID)
		}
		if _, err = tx.ExecContext(ctx, `UPDATE story_projects SET locks=$2,updated_at=now() WHERE id=$1`, id, encoded(in.Locks)); err != nil {
			return err
		}
	}
	return nil
}

func (r *Repository) Queue(ctx context.Context, user, id string, in Generate) error {
	if (in.Style != nil) != (in.Action == "restyle") || in.Action == "restyle" && (in.Version < 1 || len(in.ExpectedState) != 64) {
		return ErrInvalid
	}
	if !idPattern.MatchString(in.RequestID) {
		return ErrInvalid
	}
	switch in.Action {
	case "", "alternate", "regenerate_section", "faster", "improve_flow", "improve_transitions", "restyle":
	default:
		return ErrInvalid
	}
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	status, err := lockProject(ctx, tx, user, id)
	if err != nil {
		return err
	}
	var previous []byte
	err = tx.QueryRowContext(ctx, `SELECT payload FROM story_requests WHERE project_id=$1 AND id=$2`, id, in.RequestID).Scan(&previous)
	if err == nil {
		var equal bool
		if err = tx.QueryRowContext(ctx, `SELECT $1::jsonb=$2::jsonb`, string(previous), encoded(in)).Scan(&equal); err != nil {
			return err
		}
		if !equal {
			return ErrConflict
		}
		return tx.Commit()
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	if in.ExpectedState != "" {
		currentState, stateErr := agentState(ctx, tx, user, id)
		if stateErr != nil {
			return stateErr
		}
		if currentState != in.ExpectedState {
			return ErrConflict
		}
	}
	if !idle(status) {
		return ErrConflict
	}
	var optionsRaw, locksRaw []byte
	var current int
	if err = tx.QueryRowContext(ctx, `SELECT options,current_version,locks FROM story_projects WHERE id=$1`, id).Scan(&optionsRaw, &current, &locksRaw); err != nil {
		return err
	}
	if in.Version != current {
		return ErrConflict
	}
	var running bool
	if err = tx.QueryRowContext(ctx, `SELECT lease_token IS NOT NULL FROM story_projects WHERE id=$1`, id).Scan(&running); err != nil {
		return err
	}
	if running {
		return ErrConflict
	}
	req := story.Request{ID: id, UserID: user, Action: in.Action, BlockID: in.BlockID, CandidateID: in.CandidateID}
	if err = json.Unmarshal(optionsRaw, &req.Options); err != nil {
		return err
	}
	if in.Style != nil {
		req.Options, err = story.ApplyStyle(req.Options, *in.Style)
		if err != nil {
			return fmt.Errorf("%w: %s", ErrInvalid, err)
		}
	}
	if err = resolveStoryLogo(ctx, tx, &req); err != nil {
		return err
	}
	rows, err := tx.QueryContext(ctx, `SELECT asset FROM story_assets WHERE project_id=$1 ORDER BY (asset->>'order')::int,id`, id)
	if err != nil {
		return err
	}
	for rows.Next() {
		var raw []byte
		var a story.Asset
		if err = rows.Scan(&raw); err == nil {
			err = json.Unmarshal(raw, &a)
		}
		if err != nil {
			rows.Close()
			return err
		}
		req.Assets = append(req.Assets, a)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	if err = story.ValidateAssets(req.Assets, r.limits); err != nil {
		return fmt.Errorf("%w: %s", ErrInvalid, err)
	}
	if err = story.ValidateNarrationAssets(req.Assets, req.Options); err != nil {
		return fmt.Errorf("%w: %s", ErrInvalid, err)
	}
	if current == 0 {
		expected := []string{}
		for _, a := range req.Assets {
			expected = append(expected, a.ID)
		}
		received := append([]string(nil), in.AssetIDs...)
		// An agent approval binds the complete resource set through ExpectedState,
		// checked above while holding the project lock. Manual requests without a
		// fingerprint must still provide every confirmed source ID explicitly.
		if in.ExpectedState != "" && len(in.AssetIDs) == 0 {
			received = append([]string(nil), expected...)
		}
		sort.Strings(expected)
		sort.Strings(received)
		if encoded(expected) != encoded(received) {
			return fmt.Errorf("%w: confirm the complete validated source set", ErrInvalid)
		}
		if in.Action != "" {
			return ErrInvalid
		}
	} else {
		var raw []byte
		if err = tx.QueryRowContext(ctx, `SELECT version FROM story_versions WHERE project_id=$1 AND number=$2`, id, current).Scan(&raw); err != nil {
			return err
		}
		req.Base = &story.Version{}
		if err = json.Unmarshal(raw, req.Base); err != nil {
			return err
		}
		if in.Action == "restyle" && req.Base.RenderOptions == nil {
			var original story.Options
			if err = json.Unmarshal(optionsRaw, &original); err != nil {
				return err
			}
			req.Base.RenderOptions = &original
			if _, err = tx.ExecContext(ctx, `UPDATE story_versions SET version=$3 WHERE project_id=$1 AND number=$2`, id, current, encoded(req.Base)); err != nil {
				return err
			}
		}
		var locks []Lock
		if err = json.Unmarshal(locksRaw, &locks); err != nil {
			return err
		}
		applyLocks(req.Base, locks)
		if in.Action == "" {
			req.Action = "improve_flow"
		}
	}
	if req.Base != nil {
		if err = story.ValidateEdit(req); err != nil {
			return fmt.Errorf("%w: %s", ErrInvalid, err)
		}
	}
	if err = tx.QueryRowContext(ctx, `SELECT greatest(coalesce((SELECT max(number) FROM story_versions WHERE project_id=$1),0),coalesce((SELECT max(version) FROM story_attempts WHERE project_id=$1),0))+1`, id).Scan(&req.VersionStart); err != nil {
		return err
	}
	// One durable reservation covers the initial story and every automatic repair.
	var charge int
	err = tx.QueryRowContext(ctx, `SELECT credits_charged FROM jobs WHERE id=$1 FOR UPDATE`, id).Scan(&charge)
	missing := errors.Is(err, sql.ErrNoRows)
	if err != nil && !missing {
		return err
	}
	// Lock order matches workers and lifecycle edits: project, job, then user.
	// Revisions reuse credits, but must still reject a concurrently revoked role.
	if err = checkLifecycleMember(ctx, tx, user); err != nil {
		return err
	}
	if current == 0 && charge == 0 {
		result, e := tx.ExecContext(ctx, `UPDATE users SET credits=credits-10,updated_at=now() WHERE id=$1 AND credits>=10 AND access_role='member' AND NOT EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=$1)`, user)
		if e != nil {
			return e
		}
		n, _ := result.RowsAffected()
		if n != 1 {
			return ErrCredits
		}
		charge = 10
	}
	if missing {
		_, err = tx.ExecContext(ctx, `INSERT INTO jobs(id,user_id,source_type,status,progress,progress_message,num_clips_requested,aspect_ratio,language,subtitle_style,include_brand,credits_charged,project_name) VALUES($1,$2,'story','pending',0,'Building one story from uploaded clips',1,$3,$4,'clean',false,$5,'Multi-clip story')`, id, user, req.Options.AspectRatio, req.Options.Language, charge)
	} else {
		_, err = tx.ExecContext(ctx, `UPDATE jobs SET status='pending',progress=0,progress_message='Story queued',error_message=NULL,credits_charged=$2,completed_at=NULL,updated_at=now() WHERE id=$1`, id, charge)
	}
	if err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, `INSERT INTO story_requests(project_id,id,payload) VALUES($1,$2,$3)`, id, in.RequestID, encoded(in)); err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `UPDATE story_projects SET status='pending',message='Queued',request=$2,lease_token=NULL,lease_until=NULL,executions=0,ai_calls=0,stage_started_at=clock_timestamp(),updated_at=now() WHERE id=$1`, id, encoded(map[string]any{"request_id": in.RequestID, "input": req}))
	if err != nil {
		return err
	}
	return tx.Commit()
}

func (r *Repository) Cancel(ctx context.Context, user, id string) error {
	return r.CancelRequest(ctx, user, id, "")
}

// CancelRequest fences cancellation to a durable caller's own queued operation.
// An empty requestID retains the manual cancel-current-operation behavior.
func (r *Repository) CancelRequest(ctx context.Context, user, id, requestID string) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	status, err := lockProject(ctx, tx, user, id)
	if err != nil {
		return err
	}
	if requestID != "" {
		var matches bool
		if err = tx.QueryRowContext(ctx, `SELECT COALESCE(request->>'request_id','')=$2 FROM story_projects WHERE id=$1`, id, requestID).Scan(&matches); err != nil {
			return err
		}
		if !matches {
			return ErrConflict
		}
	}
	if idle(status) {
		return tx.Commit()
	}
	if err = trackStage(ctx, tx, id, "cancelled"); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, `UPDATE story_projects SET status='cancelled',message='Cancelled; previous versions are retained',updated_at=now() WHERE id=$1`, id); err != nil {
		return err
	}
	// Keep the lease until the worker acknowledges cancellation. Cleanup cannot
	// race an FFmpeg process that is still writing project artifacts.
	var charge, current int
	if err = tx.QueryRowContext(ctx, `SELECT j.credits_charged,p.current_version FROM jobs j JOIN story_projects p ON p.id=j.id WHERE j.id=$1 FOR UPDATE OF j`, id).Scan(&charge, &current); err != nil {
		return err
	}
	if current == 0 && charge > 0 {
		if _, err = tx.ExecContext(ctx, `UPDATE users SET credits=credits+$2 WHERE id=$1`, user, charge); err != nil {
			return err
		}
		charge = 0
	}
	if _, err = tx.ExecContext(ctx, `UPDATE jobs SET status='cancelled',credits_charged=$2,completed_at=now(),updated_at=now() WHERE id=$1`, id, charge); err != nil {
		return err
	}
	return tx.Commit()
}
