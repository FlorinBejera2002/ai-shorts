package clips

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"math"
	"strings"
)

var ErrAgentConflict = errors.New("Clip changed or the execution request was reused; inspect the clip again")

type AgentClip struct {
	ID            string          `json:"id"`
	Title         string          `json:"title"`
	Duration      float64         `json:"duration"`
	Start         float64         `json:"start_time"`
	End           float64         `json:"end_time"`
	Transcript    string          `json:"transcript"`
	Segments      json.RawMessage `json:"segments"`
	ExpectedState string          `json:"expected_state"`
	StoryOwned    bool            `json:"story_owned"`
	HasSubtitles  bool            `json:"has_subtitles"`
	Editing       bool            `json:"editing"`
}
type agentQuerier interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

func agentDigest(v []byte) string { sum := sha256.Sum256(v); return hex.EncodeToString(sum[:]) }
func agentRead(ctx context.Context, q agentQuerier, user, id string, lock bool) (AgentClip, error) {
	var raw []byte
	query := `SELECT jsonb_build_object('clip',to_jsonb(c),'source',coalesce(j.source_storage_key,j.source_file_path,''),'processing',j.processing_active,'active_edits',j.active_edit_tasks) FROM clips c JOIN jobs j ON j.id=c.job_id AND j.user_id=c.user_id WHERE c.id=$1 AND c.user_id=$2`
	if lock {
		query += " FOR UPDATE OF c"
	}
	if err := q.QueryRowContext(ctx, query, id, user).Scan(&raw); err != nil {
		return AgentClip{}, err
	}
	var record struct {
		Clip struct {
			ID           string          `json:"id"`
			Title        string          `json:"title"`
			Duration     float64         `json:"duration"`
			Start        float64         `json:"start_time"`
			End          float64         `json:"end_time"`
			Transcript   string          `json:"transcript_text"`
			Segments     json.RawMessage `json:"segments"`
			StoryID      *string         `json:"story_project_id"`
			HasSubtitles bool            `json:"has_subtitles"`
		}
		Processing  bool `json:"processing"`
		ActiveEdits int  `json:"active_edits"`
	}
	if err := json.Unmarshal(raw, &record); err != nil {
		return AgentClip{}, err
	}
	c := record.Clip
	transcript := []rune(c.Transcript)
	if len(transcript) > 12000 {
		transcript = transcript[:12000]
	}
	return AgentClip{ID: c.ID, Title: c.Title, Duration: c.Duration, Start: c.Start, End: c.End, Transcript: string(transcript), Segments: c.Segments, ExpectedState: agentDigest(raw), StoryOwned: c.StoryID != nil, HasSubtitles: c.HasSubtitles, Editing: record.Processing || record.ActiveEdits > 0}, nil
}
func (h *Handler) AgentRead(ctx context.Context, user, id string) (AgentClip, error) {
	if !idPattern.MatchString(id) {
		return AgentClip{}, sql.ErrNoRows
	}
	return agentRead(ctx, h.db, user, id, false)
}

type agentEditGuard struct{ RequestID, ExpectedState, RequestHash string }

func decodeAgentEdit(raw json.RawMessage, dst any) error {
	if len(raw) == 0 || len(raw) > 24000 || bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		return errors.New("Invalid clip edit input")
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(dst); err != nil {
		return errors.New("Invalid clip edit input")
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return errors.New("Invalid clip edit input")
	}
	return nil
}

// AgentEdit uses the exact manual editing outbox and validators. Its additional
// guard prevents a model plan from overwriting a newer clip or replaying a job.
func (h *Handler) AgentEdit(ctx context.Context, user, requestID, id, expectedState, kind string, raw json.RawMessage) (string, error) {
	if !idPattern.MatchString(id) || !idPattern.MatchString(requestID) || len(expectedState) != 64 {
		return "", ErrAgentConflict
	}
	var payload map[string]any
	switch kind {
	case "style":
		var in StyleInput
		if err := decodeAgentEdit(raw, &in); err != nil {
			return "", err
		}
		if err := in.Validate(); err != nil {
			return "", err
		}
		payload = map[string]any{"style": in}
	case "transition":
		if err := decodeAgentEdit(raw, &struct{}{}); err != nil {
			return "", err
		}
		payload = map[string]any{}
	case "trim":
		in := TrimInput{BurnSubtitles: true}
		if err := decodeAgentEdit(raw, &in); err != nil {
			return "", err
		}
		if err := in.Validate(h.cfg.MaxClipDuration); err != nil {
			return "", err
		}
		payload = map[string]any{"start_time": *in.Start, "end_time": *in.End, "burn_subtitles": in.BurnSubtitles}
	case "recut":
		// Segment.UnmarshalJSON is intentionally permissive for legacy clients;
		// decode the agent shape explicitly so nested unknown fields are rejected.
		var strict struct {
			Segments []struct {
				Start *float64 `json:"start"`
				End   *float64 `json:"end"`
				Order *int     `json:"order"`
			} `json:"segments"`
		}
		if err := decodeAgentEdit(raw, &strict); err != nil {
			return "", err
		}
		in := RecutInput{}
		orders := map[int]bool{}
		total := 0.0
		for _, s := range strict.Segments {
			if s.Start == nil || s.End == nil || s.Order == nil || *s.Order < 0 || orders[*s.Order] {
				return "", errors.New("Invalid clip segment order")
			}
			orders[*s.Order] = true
			in.Segments = append(in.Segments, Segment{Start: *s.Start, End: *s.End, Order: *s.Order})
			total += *s.End - *s.Start
		}
		if err := in.Validate(); err != nil {
			return "", err
		}
		if total > h.cfg.MaxClipDuration {
			return "", errors.New("Clip exceeds the maximum duration")
		}
		payload = map[string]any{"segments": in.Segments}
	default:
		return "", errors.New("Unsupported clip edit")
	}
	canonical, _ := json.Marshal(struct {
		User, Clip, Kind, ExpectedState string
		Payload                         map[string]any
	}{user, id, kind, expectedState, payload})
	return h.beginEditGuarded(ctx, user, id, kind, payload, &agentEditGuard{RequestID: requestID, ExpectedState: expectedState, RequestHash: agentDigest(canonical)})
}

type AgentDelivery struct {
	TaskID  string     `json:"task_id"`
	ClipID  string     `json:"clip_id"`
	State   string     `json:"state"`
	Pending bool       `json:"pending"`
	Clip    *AgentClip `json:"clip,omitempty"`
}

func (h *Handler) AgentPoll(ctx context.Context, user, id, taskID string) (AgentDelivery, error) {
	result := AgentDelivery{TaskID: taskID, ClipID: id}
	if !idPattern.MatchString(id) || !idPattern.MatchString(taskID) {
		return result, sql.ErrNoRows
	}
	var job, token, key, kind string
	var payload []byte
	var duration float64
	var size int64
	err := h.db.QueryRowContext(ctx, `SELECT d.state,d.job_id,coalesce(d.execution_token,''),coalesce(c.file_storage_key,''),d.kind,d.payload,c.duration,c.file_size FROM edit_deliveries d JOIN jobs j ON j.id=d.job_id JOIN clips c ON c.id=d.clip_id AND c.user_id=j.user_id WHERE d.task_id=$1 AND d.clip_id=$2 AND j.user_id=$3`, taskID, id, user).Scan(&result.State, &job, &token, &key, &kind, &payload, &duration, &size)
	if err != nil {
		return result, err
	}
	switch result.State {
	case "pending", "running":
		result.Pending = true
		return result, nil
	case "failed", "expired":
		return result, errors.New("Clip editing failed or was stopped; the previous saved clip is preserved")
	case "completed":
		var input struct {
			Output struct {
				Key      string  `json:"key"`
				Duration float64 `json:"duration"`
				Size     int64   `json:"size"`
			} `json:"verified_output"`
			ExpectedDuration float64   `json:"expected_duration"`
			PreviousKey      string    `json:"previous_key"`
			Start            float64   `json:"start_time"`
			End              float64   `json:"end_time"`
			Segments         []Segment `json:"segments"`
		}
		if json.Unmarshal(payload, &input) != nil {
			return result, errors.New("Clip execution receipt is invalid")
		}
		expected := input.End - input.Start
		if kind == "recut" {
			expected = 0
			for _, s := range input.Segments {
				expected += s.End - s.Start
			}
		}
		if kind == "style" || kind == "transition" {
			expected = input.ExpectedDuration
		}
		if kind == "transition" {
			if input.Output.Key != key || input.Output.Size != size || !finite(input.Output.Duration) || input.Output.Duration <= 0 {
				return result, errors.New("Transition output receipt no longer matches the saved clip")
			}
			expected = input.Output.Duration
		}
		matchesArtifact := strings.HasPrefix(key, "clips/"+job+"/edits/"+id+"/"+token+"/")
		if kind == "transition" && key != "" && key == input.PreviousKey {
			matchesArtifact = true
		}
		if token == "" || !matchesArtifact || !finite(duration) || duration <= 0 || size <= 0 || math.Abs(duration-expected) > 0.5 {
			return result, errors.New("Clip output is missing, changed, or does not match this edit")
		}
		if err := h.verifyAgentArtifact(ctx, key); err != nil {
			return result, err
		}
		clip, readErr := h.AgentRead(ctx, user, id)
		if readErr != nil {
			return result, readErr
		}
		result.Clip = &clip
		return result, nil
	default:
		return result, errors.New("Clip editing returned an unknown state")
	}
}

func (h *Handler) verifyAgentArtifact(ctx context.Context, key string) error {
	verifier, ok := h.media.(interface {
		Exists(context.Context, string) (bool, error)
	})
	if !ok || key == "" {
		return errors.New("Clip storage verification is unavailable")
	}
	exists, err := verifier.Exists(ctx, key)
	if err != nil {
		return errors.New("Clip storage could not be verified")
	}
	if !exists {
		return errors.New("The saved clip output is missing from storage")
	}
	return nil
}

func (h *Handler) AgentExport(ctx context.Context, user, id, expected string) (AgentClip, error) {
	tx, err := h.db.BeginTx(ctx, nil)
	if err != nil {
		return AgentClip{}, err
	}
	defer tx.Rollback()
	clip, err := agentRead(ctx, tx, user, id, true)
	if err != nil {
		return clip, err
	}
	if expected != clip.ExpectedState || clip.Editing {
		return clip, ErrAgentConflict
	}
	var key string
	var size int64
	if err = tx.QueryRowContext(ctx, `SELECT coalesce(file_storage_key,''),coalesce(file_size,0) FROM clips WHERE id=$1 AND user_id=$2`, id, user).Scan(&key, &size); err != nil {
		return clip, err
	}
	if size <= 0 || !finite(clip.Duration) || clip.Duration <= 0 {
		return clip, errors.New("Clip output metadata is incomplete")
	}
	if err = h.verifyAgentArtifact(ctx, key); err != nil {
		return clip, err
	}
	return clip, tx.Commit()
}

// AgentCancel fences only this delivery under the same job lock used by worker
// completion. A late renderer cannot commit after its ownership token is cleared.
func (h *Handler) AgentCancel(ctx context.Context, user, id, taskID string) error {
	if !idPattern.MatchString(id) || !idPattern.MatchString(taskID) {
		return sql.ErrNoRows
	}
	tx, err := h.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var job string
	if err = tx.QueryRowContext(ctx, `SELECT d.job_id FROM edit_deliveries d JOIN jobs j ON j.id=d.job_id WHERE d.task_id=$1 AND d.clip_id=$2 AND j.user_id=$3`, taskID, id, user).Scan(&job); err != nil {
		return err
	}
	var active string
	if err = tx.QueryRowContext(ctx, `SELECT coalesce(active_edit_token,'') FROM jobs WHERE id=$1 AND user_id=$2 FOR UPDATE`, job, user).Scan(&active); err != nil {
		return err
	}
	var state, reservation, execution string
	if err = tx.QueryRowContext(ctx, `SELECT state,reservation_token,coalesce(execution_token,'') FROM edit_deliveries WHERE task_id=$1 AND job_id=$2 AND clip_id=$3 FOR UPDATE`, taskID, job, id).Scan(&state, &reservation, &execution); err != nil {
		return err
	}
	if state == "completed" || state == "failed" || state == "expired" {
		return tx.Commit()
	}
	expected := reservation
	if state == "running" {
		expected = execution
	}
	if active != expected || expected == "" {
		return ErrAgentConflict
	}
	if _, err = tx.ExecContext(ctx, `UPDATE edit_deliveries SET state='expired',last_error='Stopped by workspace agent',completed_at=now() WHERE task_id=$1`, taskID); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, `UPDATE jobs SET active_edit_tasks=0,active_edit_token=NULL,edit_deadline=NULL,updated_at=now() WHERE id=$1 AND active_edit_token=$2`, job, expected); err != nil {
		return err
	}
	return tx.Commit()
}
