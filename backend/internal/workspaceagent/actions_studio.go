package workspaceagent

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sneepcut/backend-go/internal/data"
	"strconv"
	"time"
)

// StudioClient addresses one configured service. Model inputs never select a
// network destination, HTTP method, path or authorization identity.
type StudioClient struct {
	origin string
	secret []byte
	http   *http.Client
}

func NewStudioClient(origin, secret string) (*StudioClient, error) {
	if origin == "" && secret == "" {
		return nil, nil
	}
	u, err := url.Parse(origin)
	if err != nil || u.Host == "" || (u.Scheme != "http" && u.Scheme != "https") || u.User != nil || u.RawQuery != "" || u.Fragment != "" || (u.Path != "" && u.Path != "/") || len(secret) < 32 {
		return nil, errors.New("Studio agent needs a fixed service origin and secret of at least 32 characters")
	}
	u.Path = ""
	return &StudioClient{origin: u.String(), secret: []byte(secret), http: &http.Client{Timeout: 90 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return errors.New("Studio redirects are not permitted") }}}, nil
}
func (e *PlatformExecutor) SetStudio(client *StudioClient) { e.studio = client }
func (e *PlatformExecutor) studioCapabilities() []Capability {
	available := e.studio != nil
	capabilities := []Capability{
		{Name: "studio.list", Description: "List your Studio projects. Input {}.", Risk: "read", Available: available},
		{Name: "studio.get", Description: "Inspect Studio document version and stable layer IDs. Input {id}. Does not expose source code or storage paths.", Risk: "read", Available: available},
		{Name: "studio.create", Description: "Create a Studio composition from its title. Input {title}. Follow with studio.revise for requested content.", Risk: "write", Available: available},
		{Name: "studio.edit", Description: "Edit a stable Studio layer. Input {id,expected_version,element_id OR hf_id,changes:{text?,start?,duration?,color?,background_color?,font_size?,opacity?}}. Copy IDs/version from studio.get; timing in seconds, colors #RRGGBB, font_size pixels. Existing animation may animate styled properties.", Risk: "write", Available: available},
		{Name: "studio.revise", Description: "Apply an AI composition edit to an inspected version. Input {id,expected_version,message}. Preserves source assets unless requested. Saved document is verified; visual quality requires rendering/review.", Risk: "write", Available: available},
		{Name: "studio.render", Description: "Render an inspected Studio composition in the isolated renderer. Input {id,expected_version,format?:mp4|webm|mov,quality?:draft|standard|high,fps?:24|25|30|50|60}. Waits for a verified output file.", Risk: "write", Available: available},
	}
	if !available {
		for i := range capabilities {
			capabilities[i].Limitation = "Studio service is not connected; configure STUDIO_AGENT_URL and STUDIO_AGENT_SECRET."
		}
	}
	return capabilities
}
func (c *StudioClient) call(ctx context.Context, user, requestID string, a Action) (json.RawMessage, error) {
	if !data.ValidUUID(user) {
		return nil, errors.New("Studio identity is invalid")
	}
	if !data.ValidUUID(requestID) {
		var err error
		requestID, err = data.NewUUID()
		if err != nil {
			return nil, err
		}
	}
	raw, err := json.Marshal(struct {
		RequestID string          `json:"request_id"`
		Name      string          `json:"name"`
		Input     json.RawMessage `json:"input"`
	}{requestID, a.Name, a.Input})
	if err != nil {
		return nil, err
	}
	if len(raw) > 24000 {
		return nil, errors.New("Studio action is too large")
	}
	expiry := strconv.FormatInt(time.Now().Add(30*time.Second).Unix(), 10)
	digest := sha256.Sum256(raw)
	mac := hmac.New(sha256.New, c.secret)
	_, _ = mac.Write([]byte(user + "\n" + expiry + "\n" + hex.EncodeToString(digest[:])))
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.origin+"/sneepcut/agent", bytes.NewReader(raw))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Studio-Agent-Grant", user+":"+expiry+":"+hex.EncodeToString(mac.Sum(nil)))
	response, err := c.http.Do(req)
	if err != nil {
		return nil, errors.New("Studio service is unavailable; execution was not verified")
	}
	defer response.Body.Close()
	body, err := io.ReadAll(io.LimitReader(response.Body, 262145))
	if err != nil || len(body) > 262144 {
		return nil, errors.New("Studio returned an oversized or incomplete result")
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		switch response.StatusCode {
		case 401, 403:
			return nil, errors.New("Studio authorization failed; verify service configuration")
		case 404:
			return nil, errors.New("Studio project or execution was not found")
		case 409, 412, 428:
			return nil, errors.New("Studio document changed or this execution is uncertain; inspect the current project before retrying")
		case 422:
			return nil, errors.New("Studio action input is invalid; inspect the target and documented fields")
		}
		return nil, errors.New("Studio could not verify this operation")
	}
	if !json.Valid(body) {
		return nil, errors.New("Studio returned an invalid result")
	}
	return json.RawMessage(body), nil
}
func studioRoute(id string) string {
	if !data.ValidUUID(id) {
		return "/dashboard/studio?workspace=1"
	}
	return "/dashboard/studio?workspace=1&project=" + id
}
func (e *PlatformExecutor) studioExecute(ctx context.Context, user, requestID string, a Action) (ActionResult, error) {
	if e.studio == nil {
		return ActionResult{}, errors.New("Studio service is not connected")
	}
	// Schemas are strictly validated by the owner-scoped Studio bridge; this gate
	// rejects malformed input before constructing the signed service grant.
	var input map[string]json.RawMessage
	if err := decodeAction(a.Input, &input); err != nil {
		return ActionResult{}, err
	}
	if input == nil {
		return ActionResult{}, errors.New("Studio input must be an object")
	}
	raw, err := e.studio.call(ctx, user, requestID, a)
	if err != nil {
		return ActionResult{}, err
	}
	var result struct {
		Undo   json.RawMessage `json:"undo"`
		ID     string          `json:"id"`
		Status string          `json:"status"`
		JobID  string          `json:"job_id"`
	}
	if err = json.Unmarshal(raw, &result); err != nil {
		return ActionResult{}, err
	}
	summary := "Studio result verified"
	switch a.Name {
	case "studio.list", "studio.get":
		summary = "Loaded Studio workspace"
	case "studio.create":
		summary = "Studio composition created"
	case "studio.edit", "studio.revise":
		summary = "Studio document saved and version verified"
	case "studio.render":
		summary = "Studio render queued"
		if result.JobID == "" || result.Status != "rendering" {
			return ActionResult{}, errors.New("Studio render receipt is invalid")
		}
	}
	out := ActionResult{Summary: summary, Route: studioRoute(result.ID), Data: raw, Pending: a.Name == "studio.render"}
	if len(result.Undo) > 0 && string(result.Undo) != "null" {
		out.Undo = actionJSON(Action{Name: "studio.restore", Input: result.Undo})
	}
	return out, nil
}
func studioRenderAction(previous ActionResult, name string) (Action, error) {
	var r struct {
		ID      string `json:"id"`
		JobID   string `json:"job_id"`
		Version string `json:"expected_version"`
	}
	if json.Unmarshal(previous.Data, &r) != nil || !data.ValidUUID(r.ID) || r.JobID == "" || r.Version == "" {
		return Action{}, errors.New("Studio render receipt is missing")
	}
	return Action{Name: name, Input: actionJSON(map[string]any{"id": r.ID, "job_id": r.JobID, "expected_version": r.Version})}, nil
}
func (e *PlatformExecutor) studioPoll(ctx context.Context, user string, previous ActionResult) (ActionResult, error) {
	if e.studio == nil {
		return previous, errors.New("Studio service is not connected")
	}
	action, err := studioRenderAction(previous, "studio.render_status")
	if err != nil {
		return previous, err
	}
	raw, err := e.studio.call(ctx, user, "", action)
	if err != nil {
		return previous, err
	}
	var state struct {
		Status   string  `json:"status"`
		Verified bool    `json:"verified"`
		Bytes    int64   `json:"bytes"`
		Progress float64 `json:"progress"`
	}
	if err = json.Unmarshal(raw, &state); err != nil {
		return previous, err
	}
	result := previous
	result.Data = raw
	switch state.Status {
	case "rendering":
		result.Summary = fmt.Sprintf("Studio rendering: %.0f%%", state.Progress)
	case "complete":
		if !state.Verified || state.Bytes < 1 {
			return result, errors.New("Studio output file could not be verified")
		}
		result.Pending = false
		result.Summary = "Studio render completed and output file verified"
	case "error", "failed", "cancelled":
		return result, errors.New("Studio render did not complete; inspect the workspace")
	default:
		return result, errors.New("Studio render state is invalid")
	}
	return result, nil
}
func (e *PlatformExecutor) studioCancel(ctx context.Context, user string, previous ActionResult) error {
	if e.studio == nil {
		return errors.New("Studio service is not connected")
	}
	action, err := studioRenderAction(previous, "studio.render_cancel")
	if err != nil {
		return err
	}
	_, err = e.studio.call(ctx, user, "", action)
	return err
}
