package calendar

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"sneepcut/backend-go/internal/publishing"
)

var ErrAgentChanged = errors.New("The calendar post, media, or destination changed. Inspect and approve it again")

type agentMutation struct {
	RequestID, Mode, ExpectedState string
	Input                          any
}
type AgentPost struct {
	ID              string                       `json:"id"`
	Title           string                       `json:"title"`
	Caption         *string                      `json:"caption"`
	Notes           *string                      `json:"notes"`
	Platforms       []string                     `json:"platforms"`
	AccountIDs      []string                     `json:"account_ids"`
	Status          string                       `json:"status"`
	ScheduledAt     string                       `json:"scheduled_at"`
	ExpectedState   string                       `json:"expected_state"`
	ClipID          string                       `json:"clip_id,omitempty"`
	Clip            *PostClip                    `json:"clip,omitempty"`
	Media           []map[string]string          `json:"media"`
	Destinations    []PublishingDestination      `json:"destinations"`
	PublishingError string                       `json:"publishing_error,omitempty"`
	TikTok          *publishing.TikTokOptions    `json:"tiktok,omitempty"`
	YouTube         *publishing.YouTubeOptions   `json:"youtube,omitempty"`
	Instagram       *publishing.InstagramOptions `json:"instagram,omitempty"`
}

func safeAgentPost(p Post, state string) AgentPost {
	media := []map[string]string{}
	for _, m := range p.Media {
		media = append(media, map[string]string{"type": m["type"], "name": m["name"]})
	}
	out := AgentPost{ID: p.ID, Title: p.Title, Caption: p.Caption, Notes: p.Notes, Platforms: p.Platforms, AccountIDs: p.AccountIDs, Status: p.Status, ScheduledAt: p.ScheduledAt, ExpectedState: state, Media: media, Destinations: p.PublishingDestinations, PublishingError: p.PublishingError, TikTok: p.TikTok, YouTube: p.YouTube, Instagram: p.Instagram}
	if p.Clip != nil {
		out.ClipID = p.Clip.ID
		copy := *p.Clip
		copy.ThumbnailURL = nil
		out.Clip = &copy
	}
	return out
}
func agentPostState(ctx context.Context, tx *sql.Tx, user, id string, lock bool) (string, error) {
	binding, err := publishing.AgentPostBinding(ctx, tx, user, id, lock)
	if err != nil {
		return "", err
	}
	var version string
	if err = tx.QueryRowContext(ctx, `SELECT status||':'||updated_at::text FROM scheduled_posts WHERE id=$1 AND user_id=$2`, id, user).Scan(&version); err != nil {
		return "", err
	}
	sum := sha256.Sum256([]byte(binding + ":" + version))
	return hex.EncodeToString(sum[:]), nil
}
func (s *Repository) AgentGet(ctx context.Context, user, id string) (AgentPost, error) {
	return s.agentGet(ctx, user, id, "")
}
func (s *Repository) AgentResult(ctx context.Context, user, id, request string) (AgentPost, error) {
	return s.agentGet(ctx, user, id, request)
}
func (s *Repository) agentGet(ctx context.Context, user, id, request string) (AgentPost, error) {
	if !idPattern.MatchString(id) {
		return AgentPost{}, sql.ErrNoRows
	}
	tx, err := s.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelRepeatableRead, ReadOnly: true})
	if err != nil {
		return AgentPost{}, err
	}
	defer tx.Rollback()
	if request != "" {
		var current string
		if err = tx.QueryRowContext(ctx, `SELECT coalesce(agent_binding->>'request_id','') FROM scheduled_posts WHERE id=$1 AND user_id=$2`, id, user).Scan(&current); err != nil {
			return AgentPost{}, err
		}
		if current != request {
			return AgentPost{}, ErrAgentChanged
		}
	}
	p, err := s.readPost(ctx, tx.QueryRowContext(ctx, postSelect+` WHERE p.id=$1 AND p.user_id=$2`, id, user))
	if err != nil {
		return AgentPost{}, err
	}
	state, err := agentPostState(ctx, tx, user, id, false)
	if err != nil {
		return AgentPost{}, err
	}
	return safeAgentPost(p, state), nil
}
func (s *Repository) AgentList(ctx context.Context, user, start, end string) ([]AgentPost, error) {
	from, to, err := ParseRange(start, end)
	if err != nil {
		return nil, err
	}
	rows, err := s.db.QueryContext(ctx, `SELECT jsonb_build_object('id',id,'title',title,'status',status,'scheduled_at',scheduled_at,'account_ids',account_ids,'platforms',platforms,'clip_id',coalesce(clip_id::text,'')) FROM scheduled_posts WHERE user_id=$1 AND scheduled_at >= $2 AND scheduled_at < $3 ORDER BY scheduled_at,id LIMIT 100`, user, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []AgentPost{}
	for rows.Next() {
		var raw []byte
		if err = rows.Scan(&raw); err != nil {
			return nil, err
		}
		var post AgentPost
		if err = json.Unmarshal(raw, &post); err != nil {
			return nil, err
		}
		out = append(out, post)
	}
	return out, rows.Err()
}

// AgentMutate never fabricates the legal/media declarations required by a
// provider. Those must already have been reviewed and saved through its UI.
func (s *Repository) AgentMutate(ctx context.Context, user, request, id, expected, mode string, input map[string]any) (AgentPost, error) {
	if !idPattern.MatchString(request) {
		return AgentPost{}, ErrAgentChanged
	}
	create := mode == "calendar.create_draft"
	if !create && (!idPattern.MatchString(id) || len(expected) != 64) {
		return AgentPost{}, ErrAgentChanged
	}
	fields := map[string]any{}
	for k, v := range input {
		fields[k] = v
	}
	allowed := map[string]bool{"title": true, "caption": true, "notes": true, "platforms": true, "accountIds": true, "scheduledAt": true, "clipId": true, "instagram": true, "media": true}
	for key := range fields {
		if !allowed[key] {
			return AgentPost{}, errors.New("Unsupported calendar edit field; provider consent must be reviewed in Publishing")
		}
	}
	if raw, ok := fields["media"]; ok {
		validated, err := Validate(map[string]any{"media": raw}, false)
		if err != nil {
			return AgentPost{}, err
		}
		verifier, ok := s.media.(interface {
			PublishingPreviewURL(context.Context, string, string) (string, error)
		})
		if !ok {
			return AgentPost{}, errors.New("Publishing upload verification is unavailable")
		}
		for _, item := range validated["media"].([]map[string]string) {
			if _, err := verifier.PublishingPreviewURL(ctx, user, item["reference"]); err != nil {
				return AgentPost{}, errors.New("Choose an existing publishing upload owned by this account")
			}
		}
	}
	switch mode {
	case "calendar.create_draft":
		fields["status"] = "draft"
	case "calendar.update":
	case "publishing.schedule", "publishing.reschedule":
		if len(fields) != 1 || fields["scheduledAt"] == nil {
			return AgentPost{}, errors.New("Scheduling accepts only an exact scheduledAt time")
		}
		text, ok := fields["scheduledAt"].(string)
		if !ok {
			return AgentPost{}, ErrAgentChanged
		}
		if _, err := ParseDateTime(text); err != nil {
			return AgentPost{}, errors.New("Choose a future publication time")
		}
		fields["status"] = "scheduled"
	case "publishing.publish":
		if len(fields) != 0 {
			return AgentPost{}, errors.New("Publish approves the inspected post without changing its content")
		}
		fields["status"] = "publish"
	case "publishing.unschedule":
		if len(fields) != 0 {
			return AgentPost{}, ErrAgentChanged
		}
		fields["status"] = "draft"
	default:
		return AgentPost{}, errors.New("Unsupported calendar action")
	}
	receiptInput := map[string]any{"id": id, "expected_state": expected, "fields": input}
	p, err := s.mutateGuarded(ctx, user, id, fields, create, &agentMutation{RequestID: request, Mode: mode, ExpectedState: expected, Input: receiptInput})
	if err != nil {
		return AgentPost{}, err
	}
	return s.AgentGet(ctx, user, p.ID)
}

func (s *Repository) AgentDelete(ctx context.Context, user, request, id, expected string) error {
	if !idPattern.MatchString(request) || !idPattern.MatchString(id) || len(expected) != 64 {
		return ErrAgentChanged
	}
	in := map[string]any{"id": id, "expected_state": expected}
	return s.deleteGuarded(ctx, user, id, &agentMutation{RequestID: request, Mode: "calendar.delete", ExpectedState: expected, Input: in})
}
func (h *Handler) AgentRepository() *Repository { return h.repository }

// AgentCancel only retracts this exact queued approval before publication has
// started. It never deletes a remote post or cancels another agent/manual edit.
func (s *Repository) AgentCancel(ctx context.Context, user, id, request string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var owner string
	if err = tx.QueryRowContext(ctx, `SELECT id FROM users WHERE id=$1 FOR UPDATE`, user).Scan(&owner); err != nil {
		return err
	}
	var status, activeRequest string
	if err = tx.QueryRowContext(ctx, `SELECT status,coalesce(agent_binding->>'request_id','') FROM scheduled_posts WHERE id=$1 AND user_id=$2 FOR UPDATE`, id, user).Scan(&status, &activeRequest); err != nil {
		return err
	}
	if activeRequest != request {
		return ErrAgentChanged
	}
	if status == "scheduled" {
		if _, err = tx.ExecContext(ctx, `UPDATE scheduled_posts SET status='draft',updated_at=now() WHERE id=$1`, id); err != nil {
			return err
		}
		return tx.Commit()
	}
	if status == "publishing" {
		rows, queryErr := tx.QueryContext(ctx, `SELECT status FROM social_posts WHERE scheduled_post_id=$1 ORDER BY id FOR UPDATE`, id)
		if queryErr != nil {
			return queryErr
		}
		active := false
		for rows.Next() {
			var destinationStatus string
			if queryErr = rows.Scan(&destinationStatus); queryErr != nil {
				break
			}
			if destinationStatus != "queued" && destinationStatus != "cancelled" {
				active = true
			}
		}
		if queryErr == nil {
			queryErr = rows.Err()
		}
		rows.Close()
		if queryErr != nil {
			return queryErr
		}
		if active {
			return errors.New("A provider submission already started; inspect each destination before further action")
		}
		if _, err = tx.ExecContext(ctx, `UPDATE social_posts SET status='cancelled',error='Stopped before provider submission',updated_at=now() WHERE scheduled_post_id=$1 AND status='queued'`, id); err != nil {
			return err
		}
		if _, err = tx.ExecContext(ctx, `UPDATE scheduled_posts SET status='failed',publishing_error='Stopped before provider submission',updated_at=now() WHERE id=$1`, id); err != nil {
			return err
		}
		return tx.Commit()
	}
	if status == "failed" || status == "draft" {
		return tx.Commit()
	}
	return ErrLocked
}
