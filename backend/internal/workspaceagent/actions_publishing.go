package workspaceagent

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sneepcut/backend-go/internal/calendar"
	"sneepcut/backend-go/internal/data"
	"sneepcut/backend-go/internal/publishing"
)

func (e *PlatformExecutor) SetPublishing(cal *calendar.Handler, pub *publishing.Handler) {
	e.calendar = cal.AgentRepository()
	e.publishing = pub
}

type calendarAction struct {
	ID            string         `json:"id"`
	ExpectedState string         `json:"expected_state"`
	Fields        map[string]any `json:"fields"`
}
type publishingReceipt struct {
	RequestID string             `json:"request_id"`
	Post      calendar.AgentPost `json:"post"`
}

func (e *PlatformExecutor) publishingExecute(ctx context.Context, user, request string, a Action) (ActionResult, error) {
	if e.calendar == nil || e.publishing == nil {
		return ActionResult{}, ErrUnavailable
	}
	switch a.Name {
	case "publishing.disconnect":
		var in publishing.AgentDisconnectInput
		if err := decodeAction(a.Input, &in); err != nil {
			return ActionResult{}, err
		}
		value, err := e.publishing.AgentDisconnect(ctx, user, request, in)
		return actionResult("Publishing connection removed locally; provider revocation status recorded", "/dashboard/publish", value), err
	case "calendar.attach_media":
		var in struct {
			ID            string   `json:"id"`
			ExpectedState string   `json:"expected_state"`
			ResourceIDs   []string `json:"resource_ids"`
		}
		if err := decodeAction(a.Input, &in); err != nil {
			return ActionResult{}, err
		}
		if len(in.ResourceIDs) == 0 || len(in.ResourceIDs) > 35 {
			return ActionResult{}, errors.New("Choose between 1 and 35 uploaded publishing resources")
		}
		items := []any{}
		seen := map[string]bool{}
		for _, id := range in.ResourceIDs {
			if !data.ValidUUID(id) || seen[id] {
				return ActionResult{}, errors.New("Invalid publishing resource")
			}
			seen[id] = true
			var name, key, kind string
			if err := e.db.QueryRowContext(ctx, `SELECT name,reference,content FROM workspace_agent_resources WHERE id=$1 AND user_id=$2 AND kind='publishing_media' AND project_id IS NULL`, id, user).Scan(&name, &key, &kind); err != nil {
				return ActionResult{}, err
			}
			if kind != "image" && kind != "video" {
				return ActionResult{}, errors.New("Invalid publishing media type")
			}
			items = append(items, map[string]any{"type": kind, "reference": key, "name": name})
		}
		post, err := e.calendar.AgentMutate(ctx, user, request, in.ID, in.ExpectedState, "calendar.update", map[string]any{"media": items, "clipId": nil})
		return actionResult("Owned uploaded media attached to the calendar draft", "/dashboard/calendar", post), err
	case "publishing.accounts":
		if err := decodeAction(a.Input, &struct{}{}); err != nil {
			return ActionResult{}, err
		}
		accounts, err := e.publishing.AgentAccounts(ctx, user)
		return actionResult("Loaded connected publishing destinations", "/dashboard/publish", accounts), err
	case "calendar.list":
		var in struct {
			Start string `json:"start"`
			End   string `json:"end"`
		}
		if err := decodeAction(a.Input, &in); err != nil {
			return ActionResult{}, err
		}
		posts, err := e.calendar.AgentList(ctx, user, in.Start, in.End)
		return actionResult("Loaded calendar posts", "/dashboard/calendar", posts), err
	case "calendar.get", "publishing.status":
		id, err := actionID(a.Input)
		if err != nil {
			return ActionResult{}, err
		}
		post, err := e.calendar.AgentGet(ctx, user, id)
		return actionResult("Loaded publication content and each destination's status", "/dashboard/calendar", post), err
	}
	var in calendarAction
	if err := decodeAction(a.Input, &in); err != nil {
		return ActionResult{}, err
	}
	if _, supplied := in.Fields["media"]; supplied {
		return ActionResult{}, errors.New("Attach publishing media using opaque resource IDs")
	}
	if a.Name == "calendar.delete" {
		if len(in.Fields) > 0 {
			return ActionResult{}, errors.New("Draft deletion does not accept content edits")
		}
		err := e.calendar.AgentDelete(ctx, user, request, in.ID, in.ExpectedState)
		return actionResult("Calendar draft deleted; original media retained", "/dashboard/calendar", map[string]any{"id": in.ID, "deleted": err == nil}), err
	}
	if a.Name == "publishing.publish" || a.Name == "publishing.schedule" || a.Name == "publishing.reschedule" {
		post, readErr := e.calendar.AgentGet(ctx, user, in.ID)
		if readErr != nil {
			return ActionResult{}, readErr
		}
		accounts, readErr := e.publishing.AgentAccounts(ctx, user)
		if readErr != nil {
			return ActionResult{}, readErr
		}
		ready := map[string]bool{}
		for _, account := range accounts {
			ready[account.ID] = account.Configured && account.Status == "connected"
		}
		for _, id := range post.AccountIDs {
			if !ready[id] {
				return ActionResult{}, errors.New("A selected publishing destination is disconnected or requires provider setup")
			}
		}
	}
	post, err := e.calendar.AgentMutate(ctx, user, request, in.ID, in.ExpectedState, a.Name, in.Fields)
	if err != nil {
		return ActionResult{}, err
	}
	summary := "Calendar draft saved"
	switch a.Name {
	case "publishing.schedule", "publishing.reschedule":
		summary = "Post scheduled for " + post.ScheduledAt
	case "publishing.publish":
		summary = "Publication queued; waiting for destination confirmation"
	case "publishing.unschedule":
		summary = "Publication removed from the schedule; draft preserved"
	}
	result := actionResult(summary, "/dashboard/calendar", publishingReceipt{RequestID: request, Post: post})
	result.Pending = a.Name == "publishing.publish" && (post.Status == "scheduled" || post.Status == "publishing")
	return result, nil
}
func (e *PlatformExecutor) publishingPoll(ctx context.Context, user string, a Action, previous ActionResult) (ActionResult, error) {
	var receipt publishingReceipt
	if json.Unmarshal(previous.Data, &receipt) != nil || !data.ValidUUID(receipt.Post.ID) || !data.ValidUUID(receipt.RequestID) {
		return previous, errors.New("Publication receipt is missing")
	}
	post, err := e.calendar.AgentResult(ctx, user, receipt.Post.ID, receipt.RequestID)
	if err != nil {
		return previous, err
	}
	receipt.Post = post
	result := actionResult("Publication is waiting for destination confirmation", "/dashboard/calendar", receipt)
	result.Pending = true
	switch post.Status {
	case "scheduled", "publishing":
		return result, nil
	case "published":
		if len(post.Destinations) != len(post.AccountIDs) || len(post.Destinations) == 0 {
			return result, errors.New("Publication confirmation does not match the approved destinations")
		}
		expected := map[string]bool{}
		for _, id := range post.AccountIDs {
			expected[id] = true
		}
		for _, dest := range post.Destinations {
			if dest.Status != "published" || !expected[dest.AccountID] {
				return result, errors.New("Some destinations have not confirmed publication")
			}
			delete(expected, dest.AccountID)
		}
		result.Pending = false
		result.Summary = "Every selected destination confirmed publication"
		return result, nil
	default:
		result.Pending = false
		return result, fmt.Errorf("Publication ended with status %s; inspect the individual destination results before retrying", post.Status)
	}
}
func (e *PlatformExecutor) publishingCancel(ctx context.Context, user string, a Action, previous ActionResult) error {
	var receipt publishingReceipt
	if json.Unmarshal(previous.Data, &receipt) != nil || !data.ValidUUID(receipt.Post.ID) || !data.ValidUUID(receipt.RequestID) {
		return errors.New("Publication receipt is missing")
	}
	return e.calendar.AgentCancel(ctx, user, receipt.Post.ID, receipt.RequestID)
}
func (e *PlatformExecutor) publishingApproval(ctx context.Context, user string, a Action) (json.RawMessage, error) {
	if e.calendar == nil || e.publishing == nil {
		return nil, ErrUnavailable
	}
	if a.Name == "publishing.disconnect" {
		var in publishing.AgentDisconnectInput
		if err := decodeAction(a.Input, &in); err != nil {
			return nil, err
		}
		accounts, err := e.publishing.AgentAccounts(ctx, user)
		if err != nil {
			return nil, err
		}
		for _, account := range accounts {
			if account.ID == in.ID {
				if account.ExpectedState != in.ExpectedState {
					return nil, calendar.ErrAgentChanged
				}
				return actionJSON(map[string]any{"action": a.Name, "account": account, "irreversible": true, "effect": "Disconnect this publishing account and cancel its queued publications. Reconnecting requires the provider sign-in flow. Existing remote posts are not deleted; provider revocation is best effort."}), nil
			}
		}
		return nil, errors.New("Publishing account is unavailable")
	}
	var in calendarAction
	if err := decodeAction(a.Input, &in); err != nil {
		return nil, err
	}
	post, err := e.calendar.AgentGet(ctx, user, in.ID)
	if err != nil {
		return nil, err
	}
	if post.ExpectedState != in.ExpectedState {
		return nil, calendar.ErrAgentChanged
	}
	if a.Name == "calendar.delete" {
		if len(in.Fields) > 0 || post.Status != "draft" {
			return nil, errors.New("Only an inspected draft can be deleted with this action")
		}
		return actionJSON(map[string]any{"action": a.Name, "post_id": post.ID, "title": post.Title, "caption": post.Caption, "media": post.Media, "clip": post.Clip, "expected_state": post.ExpectedState, "irreversible": true, "effect": "Delete this calendar draft. Uploaded media and saved clips are retained. Published posts on social platforms are not changed. No Undo is available."}), nil
	}
	accounts, err := e.publishing.AgentAccounts(ctx, user)
	if err != nil {
		return nil, err
	}
	selected := []publishing.AgentAccount{}
	for _, id := range post.AccountIDs {
		for _, account := range accounts {
			if id == account.ID {
				selected = append(selected, account)
			}
		}
	}
	when := post.ScheduledAt
	if a.Name == "publishing.publish" {
		when = "Immediately after this approval"
	} else if stamp, ok := in.Fields["scheduledAt"].(string); ok {
		when = stamp
	}
	return actionJSON(map[string]any{"action": a.Name, "post_id": post.ID, "title": post.Title, "caption": post.Caption, "destinations": selected, "clip_id": post.ClipID, "clip": post.Clip, "media": post.Media, "scheduled_at": when, "current_status": post.Status, "expected_state": post.ExpectedState, "tiktok": post.TikTok, "youtube": post.YouTube, "instagram": post.Instagram}), nil
}
