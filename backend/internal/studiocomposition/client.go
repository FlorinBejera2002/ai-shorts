// Package studiocomposition calls the owner-scoped, immutable Studio compositor.
package studiocomposition

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
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"sneepcut/backend-go/internal/data"
)

type Client struct {
	origin, secret string
	http           *http.Client
	poll           time.Duration
}

type Result struct {
	EffectiveTimeline json.RawMessage `json:"effective_timeline"`
	ArtifactID        string          `json:"artifact_id"`
	ProjectID         string          `json:"project_id"`
	BaseRevision      string          `json:"base_revision"`
	CommittedRevision string          `json:"committed_revision"`
	Committed         bool            `json:"committed"`
	Status            string          `json:"status"`
	Progress          float64         `json:"progress"`
	Duration          float64         `json:"duration"`
	Width             int             `json:"width"`
	Height            int             `json:"height"`
	Size              int64           `json:"size"`
	PreviewAvailable  bool            `json:"preview_available"`
	Error             string          `json:"error"`
}

var ErrProjectChanged = errors.New("The Studio project changed while this edit was rendering. Your newer edits were kept; retry from the current project")
var ErrLegacyProject = errors.New("This older Studio project cannot be merged automatically. Your edits were kept; continue editing it in Studio")

// RenderFailure identifies a terminal response from the requested composition.
// Error deliberately remains suitable for public status messages; DiagnosticCause
// is bounded and sanitized for operational logs, never a raw service error.
type RenderFailure struct {
	ArtifactID string
	Status     string
	cause      string
}

func (e *RenderFailure) Error() string {
	return "Studio composition rendering did not complete"
}

func (e *RenderFailure) DiagnosticCause() string { return e.cause }

const maxDiagnosticBytes = 512

var diagnosticURL = regexp.MustCompile(`(?i)\b(?:https?|s3|file|ftp)://\S+`)
var diagnosticCredential = regexp.MustCompile(`(?i)\b(?:authorization|[a-z0-9_-]*(?:token|password|secret|api[-_]?key|signature|credential)[a-z0-9_-]*)["']?\s*[:=]\s*(?:bearer\s+|basic\s+)?(?:"[^"]*"|'[^']*'|\S+)`)
var diagnosticBearer = regexp.MustCompile(`(?i)\bbearer\s+\S+`)

func renderDiagnostic(cause, secret string) string {
	if secret != "" {
		cause = strings.ReplaceAll(cause, secret, "[redacted]")
	}
	cause = strings.Map(func(r rune) rune {
		if unicode.IsControl(r) || unicode.Is(unicode.Cf, r) {
			return ' '
		}
		return r
	}, cause)
	cause = diagnosticURL.ReplaceAllString(cause, "[url]")
	cause = diagnosticCredential.ReplaceAllString(cause, "[credential]")
	cause = diagnosticBearer.ReplaceAllString(cause, "[credential]")
	cause = strings.Join(strings.Fields(cause), " ")
	if len(cause) > maxDiagnosticBytes {
		cause = cause[:maxDiagnosticBytes-len("...")]
		for !utf8.ValidString(cause) {
			cause = cause[:len(cause)-1]
		}
		cause += "..."
	}
	return cause
}

func New(origin, secret string) (*Client, error) {
	if origin == "" && secret == "" {
		return nil, nil
	}
	u, err := url.Parse(origin)
	if err != nil || u.Host == "" || (u.Scheme != "http" && u.Scheme != "https") || u.User != nil || u.RawQuery != "" || u.Fragment != "" || (u.Path != "" && u.Path != "/") || len(secret) < 32 {
		return nil, errors.New("Studio rendering requires a fixed service origin and a secret of at least 32 characters")
	}
	return &Client{origin: strings.TrimRight(origin, "/"), secret: secret, http: &http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return errors.New("Studio redirects are not permitted") }}, poll: time.Second}, nil
}

// Identity binds retries to the same owner, namespace and complete editing plan.
func Identity(user, namespace string, plan any) string {
	raw, _ := json.Marshal(plan)
	sum := sha256.Sum256(append([]byte(user+"\n"+namespace+"\n"), raw...))
	b := sum[:16]
	b[6] = (b[6] & 15) | 0x50
	b[8] = (b[8] & 63) | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[:4], b[4:6], b[6:8], b[8:10], b[10:])
}

func (c *Client) request(ctx context.Context, user, id, operation string, input any) (*http.Response, error) {
	if c == nil {
		return nil, errors.New("Studio rendering is unavailable; configure STUDIO_AGENT_URL and STUDIO_AGENT_SECRET")
	}
	if !data.ValidUUID(user) || !data.ValidUUID(id) {
		return nil, errors.New("Studio rendering identity is invalid")
	}
	raw, err := json.Marshal(map[string]any{"operation": operation, "request_id": id, "input": input})
	if err != nil {
		return nil, err
	}
	if len(raw) > 8<<20 {
		return nil, errors.New("Studio composition exceeds the supported size")
	}
	expiry := strconv.FormatInt(time.Now().Add(30*time.Second).Unix(), 10)
	digest := sha256.Sum256(raw)
	mac := hmac.New(sha256.New, []byte(c.secret))
	_, _ = io.WriteString(mac, "composition\n"+user+"\n"+expiry+"\n"+hex.EncodeToString(digest[:]))
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.origin+"/sneepcut/composition", bytes.NewReader(raw))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Studio-Composition-Grant", user+":"+expiry+":"+hex.EncodeToString(mac.Sum(nil)))
	response, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("Studio rendering service is unavailable: %w", err)
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		defer response.Body.Close()
		body, _ := io.ReadAll(io.LimitReader(response.Body, 4096))
		if response.StatusCode == http.StatusConflict {
			var conflict struct {
				Code string `json:"code"`
			}
			if json.Unmarshal(body, &conflict) == nil && conflict.Code == "legacy_project_requires_studio" {
				return nil, ErrLegacyProject
			}
			return nil, ErrProjectChanged
		}
		return nil, fmt.Errorf("Studio composition request failed (HTTP %d)", response.StatusCode)
	}
	return response, nil
}

// Commit publishes only the candidate accepted by the caller. Studio compares
// the captured project revision with the latest saved document before replacing it.
func (c *Client) Commit(ctx context.Context, user, artifact string) error {
	result, err := c.call(ctx, user, artifact, "composition.commit", map[string]string{"artifact_id": artifact})
	if err != nil {
		return err
	}
	if !result.Committed || !data.ValidUUID(result.ProjectID) || result.CommittedRevision == "" {
		return errors.New("Studio did not confirm the accepted project revision")
	}
	return nil
}

func (c *Client) call(ctx context.Context, user, id, operation string, input any) (Result, error) {
	res, err := c.request(ctx, user, id, operation, input)
	if err != nil {
		return Result{}, err
	}
	defer res.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(res.Body, 262145))
	if err != nil || len(raw) > 262144 {
		return Result{}, errors.New("Studio returned an incomplete result")
	}
	var state Result
	if json.Unmarshal(raw, &state) != nil || state.ArtifactID != id {
		return Result{}, errors.New("Studio returned an invalid composition identity")
	}
	return state, nil
}

func (c *Client) Render(ctx context.Context, user, id string, input any) (result Result, err error) {
	return c.Run(ctx, user, id, "composition.render", input)
}

func (c *Client) Run(ctx context.Context, user, id, operation string, input any) (result Result, err error) {
	defer func() {
		if err != nil && !errors.Is(err, ErrProjectChanged) && !errors.Is(err, ErrLegacyProject) {
			cancel, stop := context.WithTimeout(context.Background(), 5*time.Second)
			defer stop()
			_, _ = c.call(cancel, user, id, "composition.cancel", map[string]string{"artifact_id": id})
		}
	}()
	result, err = c.call(ctx, user, id, operation, input)
	if err != nil {
		return result, err
	}
	for {
		switch result.Status {
		case "complete", "completed":
			if result.Size <= 0 || result.Duration <= 0 || result.Width < 2 || result.Height < 2 {
				return result, errors.New("Studio render output was not verified")
			}
			return result, nil
		case "failed", "cancelled":
			return result, &RenderFailure{ArtifactID: id, Status: result.Status, cause: renderDiagnostic(result.Error, c.secret)}
		case "queued", "preparing", "rendering", "pending":
		default:
			return result, errors.New("Studio returned an unknown rendering state")
		}
		timer := time.NewTimer(c.poll)
		select {
		case <-ctx.Done():
			timer.Stop()
			return result, ctx.Err()
		case <-timer.C:
		}
		result, err = c.call(ctx, user, id, "composition.status", map[string]string{"artifact_id": id})
		if err != nil {
			return result, err
		}
	}
}

func (c *Client) Download(ctx context.Context, user, id, variant, destination string) error {
	res, err := c.request(ctx, user, id, "composition.output", map[string]string{"artifact_id": id, "variant": variant})
	if err != nil {
		return err
	}
	defer res.Body.Close()
	f, err := os.OpenFile(destination, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return err
	}
	n, copyErr := io.Copy(f, io.LimitReader(res.Body, (8<<30)+1))
	closeErr := f.Close()
	if copyErr != nil || closeErr != nil || n <= 0 || n > 8<<30 {
		_ = os.Remove(destination)
		return errors.New("Studio output download was incomplete")
	}
	return nil
}
