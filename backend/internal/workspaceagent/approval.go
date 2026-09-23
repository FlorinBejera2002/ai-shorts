package workspaceagent

import (
	"context"
	"encoding/json"
	"strings"
)

func (e *PlatformExecutor) PrepareApproval(ctx context.Context, user string, a Action) (json.RawMessage, error) {
	if a.Name == "stories.delete" {
		return e.lifecycleApproval(ctx, user, a)
	}
	if a.Name == "jobs.create" {
		return e.jobApproval(ctx, user, a)
	}
	if a.Name == "clips.delete" {
		return e.clipApproval(ctx, user, a)
	}
	if a.Name == "folders.delete" {
		return e.libraryApproval(ctx, user, a)
	}
	if a.Name == "calendar.delete" || strings.HasPrefix(a.Name, "publishing.") {
		return e.publishingApproval(ctx, user, a)
	}
	return nil, nil
}
