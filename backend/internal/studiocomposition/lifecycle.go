package studiocomposition

import (
	"context"
	"encoding/json"
	"errors"
	"io"

	"sneepcut/backend-go/internal/data"
)

// Scope keeps every automatic revision, including failed jobs, under its source job.
func Scope(owner, jobID string) string { return Identity(owner, "job/"+jobID, nil) }

func (c *Client) cleanup(ctx context.Context, owner, operation string, input any) error {
	id := Identity(owner, operation, input)
	response, err := c.request(ctx, owner, id, operation, input)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	var result struct {
		Deleted bool `json:"deleted"`
	}
	if err = json.NewDecoder(io.LimitReader(response.Body, 65536)).Decode(&result); err != nil || !result.Deleted {
		return errors.New("Studio did not confirm composition cleanup")
	}
	return nil
}

func (c *Client) Delete(ctx context.Context, owner string, artifacts []string) error {
	for start := 0; start < len(artifacts); start += 200 {
		batch := artifacts[start:min(start+200, len(artifacts))]
		for _, id := range batch {
			if !data.ValidUUID(id) {
				return errors.New("Invalid Studio artifact identity")
			}
		}
		if err := c.cleanup(ctx, owner, "composition.delete", map[string]any{"artifact_ids": batch}); err != nil {
			return err
		}
	}
	return nil
}

func (c *Client) DeleteScope(ctx context.Context, owner, scope string) error {
	if !data.ValidUUID(scope) {
		return errors.New("Invalid Studio scope identity")
	}
	return c.cleanup(ctx, owner, "composition.delete_scope", map[string]string{"scope_id": scope})
}

func (c *Client) PurgeOwner(ctx context.Context, owner string) error {
	return c.cleanup(ctx, owner, "composition.purge_owner", map[string]any{})
}
