package stories

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"reflect"
	"sneepcut/backend-go/internal/agentaction"
	"sneepcut/backend-go/internal/story"
)

func readyReport(r story.Report) bool {
	c := r.Coverage
	if r.Status != "ready" || !c.Plan || !c.File || !c.Audio || !c.Visual || !c.Captions || !c.Semantics || !c.Boundaries || len(c.Incomplete) > 0 {
		return false
	}
	for _, i := range r.Issues {
		if !i.Resolved && (i.Severity == "critical" || i.Severity == "major") {
			return false
		}
	}
	return true
}

func readyVersion(v story.Version) bool {
	if v.Report.Version != v.Number || !readyReport(v.Report) {
		return false
	}
	for _, block := range v.Plan.Blocks {
		if block.IdentityReferenceID != "" && block.IdentityReferenceID != block.CandidateID && !v.Report.Coverage.SourceIdentity {
			return false
		}
	}
	return true
}

func (r *Repository) Rollback(ctx context.Context, user, id string, number int, requestID string) error {
	if number < 1 || !idPattern.MatchString(requestID) {
		return ErrInvalid
	}
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err = r.rollbackTx(ctx, tx, user, id, number, requestID); err != nil {
		return err
	}
	return tx.Commit()
}

func (r *Repository) rollbackTx(ctx context.Context, tx *sql.Tx, user, id string, number int, requestID string) error {
	status, err := lockProject(ctx, tx, user, id)
	if err != nil {
		return err
	}
	if !idle(status) {
		return ErrConflict
	}
	payload := encoded(map[string]any{"rollback": number})
	var previous []byte
	err = tx.QueryRowContext(ctx, `SELECT payload FROM story_requests WHERE project_id=$1 AND id=$2`, id, requestID).Scan(&previous)
	if err == nil {
		var equal bool
		if err = tx.QueryRowContext(ctx, `SELECT $1::jsonb=$2::jsonb`, string(previous), payload).Scan(&equal); err != nil {
			return err
		}
		if !equal {
			return ErrConflict
		}
		return nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	var raw, baseRaw, locksRaw, optionsRaw []byte
	var running bool
	if err = tx.QueryRowContext(ctx, `SELECT v.version,b.version,p.locks,p.options,p.lease_token IS NOT NULL FROM story_projects p JOIN story_versions v ON v.project_id=p.id AND v.number=$2 JOIN story_versions b ON b.project_id=p.id AND b.number=p.current_version WHERE p.id=$1`, id, number).Scan(&raw, &baseRaw, &locksRaw, &optionsRaw, &running); err != nil {
		return err
	}
	if running {
		return ErrConflict
	}
	var v, base story.Version
	var locks []Lock
	var options story.Options
	if err = json.Unmarshal(raw, &v); err != nil {
		return err
	}
	if err = json.Unmarshal(baseRaw, &base); err != nil {
		return err
	}
	if err = json.Unmarshal(locksRaw, &locks); err != nil {
		return err
	}
	if err = json.Unmarshal(optionsRaw, &options); err != nil {
		return err
	}
	if v.RenderOptions != nil {
		if err = story.ValidateOptions(*v.RenderOptions); err != nil {
			return err
		}
		options = *v.RenderOptions
	}
	if v.Output.Key == "" || !v.Accepted {
		return ErrInvalid
	}
	applyLocks(&base, locks)
	for index, b := range base.Plan.Blocks {
		if !b.Locked && !b.LockText && !b.LockOrder && !b.LockCrop {
			continue
		}
		found := -1
		for i, other := range v.Plan.Blocks {
			if other.ID == b.ID {
				found = i
				break
			}
		}
		if found < 0 {
			return ErrConflict
		}
		other := v.Plan.Blocks[found]
		if b.Locked && !reflect.DeepEqual(clearLocks(b), clearLocks(other)) || b.LockText && b.CandidateID != other.CandidateID || b.LockOrder && index != found || b.LockCrop && b.Crop != other.Crop {
			return ErrConflict
		}
	}
	status = "needs_review"
	if readyVersion(v) {
		status = "ready"
		if err = saveClip(ctx, tx, id, user, v, options); err != nil {
			return err
		}
	}
	if _, err = tx.ExecContext(ctx, `INSERT INTO story_requests(project_id,id,payload) VALUES($1,$2,$3)`, id, requestID, payload); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, `UPDATE story_projects SET current_version=$2,status=$3,options=$4,message='Previous version restored',updated_at=now() WHERE id=$1`, id, number, status, encoded(options)); err != nil {
		return err
	}
	return nil
}
func clearLocks(b story.Block) story.Block {
	b.Locked = false
	b.LockText = false
	b.LockCrop = false
	b.LockOrder = false
	return b
}

// Deletion is retryable. The deleting marker fences new work before any
// external storage call, and rows survive a partial storage failure.
func (r *Repository) Delete(ctx context.Context, user, id string, media Media) error {
	return r.deleteGuarded(ctx, user, id, media, nil)
}
func (r *Repository) deleteGuarded(ctx context.Context, user, id string, media Media, guard *lifecycleDeleteGuard) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	resuming := false
	if guard != nil {
		resuming, err = agentaction.Replay(ctx, tx, user, guard.RequestID, "stories.delete", guard.Input, &guard.Result)
		if err != nil {
			return err
		}
		if resuming && guard.Result.Deleted {
			return nil
		}
	}
	var status string
	var active bool
	if err = tx.QueryRowContext(ctx, `SELECT status,lease_token IS NOT NULL FROM story_projects WHERE id=$1 AND user_id=$2 FOR UPDATE`, id, user).Scan(&status, &active); err != nil {
		if errors.Is(err, sql.ErrNoRows) && guard != nil && resuming {
			guard.Result.Deleted = true
			guard.Result.Pending = false
			if err = finishLifecycleDelete(ctx, tx, user, guard); err != nil {
				return err
			}
			return tx.Commit()
		}
		return err
	}
	if guard != nil && !resuming {
		if err = checkLifecycleState(ctx, tx, user, id, guard.Input.ExpectedState); err != nil {
			return err
		}
	}
	if guard != nil && resuming {
		if err = checkLifecycleMember(ctx, tx, user); err != nil {
			return err
		}
	}
	if active || !idle(status) && status != "deleting" {
		return ErrConflict
	}
	var scheduled bool
	if err = tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM social_posts WHERE clip_id IN(SELECT id FROM clips WHERE story_project_id=$1) AND status IN ('queued','processing')) OR EXISTS(SELECT 1 FROM scheduled_posts WHERE clip_id IN(SELECT id FROM clips WHERE story_project_id=$1) AND status IN ('scheduled','publishing'))`, id).Scan(&scheduled); err != nil {
		return err
	}
	if scheduled {
		return ErrConflict
	}
	if _, err = tx.ExecContext(ctx, `UPDATE story_projects SET status='deleting',message='Removing project artifacts',updated_at=now() WHERE id=$1`, id); err != nil {
		return err
	}
	if guard != nil && !resuming {
		guard.Result = LifecycleResult{ID: id, Pending: true}
		if err = agentaction.Put(ctx, tx, user, guard.RequestID, "stories.delete", guard.Input, guard.Result); err != nil {
			return err
		}
	}
	if err = tx.Commit(); err != nil {
		return err
	}
	for _, prefix := range []string{"work/" + id + "/", "clips/" + id + "/", "sources/" + id + "/"} {
		if err = media.DeletePrefix(ctx, prefix); err != nil {
			return err
		}
	}
	// Uploaded originals may be shared with another story or a legacy job.
	// They remain in the owner's upload library and follow account retention.
	tx, err = r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err = tx.ExecContext(ctx, `DELETE FROM story_projects WHERE id=$1 AND user_id=$2 AND status='deleting' AND lease_token IS NULL`, id, user); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, `DELETE FROM jobs WHERE id=$1 AND user_id=$2 AND source_type='story' AND NOT processing_active`, id, user); err != nil {
		return err
	}
	if guard != nil {
		guard.Result.Deleted = true
		guard.Result.Pending = false
		if err = finishLifecycleDelete(ctx, tx, user, guard); err != nil {
			return err
		}
	}
	return tx.Commit()
}
