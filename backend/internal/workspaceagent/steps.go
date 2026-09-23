package workspaceagent

import (
	"context"
	"crypto/sha256"
	"fmt"
)

func stepID(r Run) string {
	if len(r.Steps) == 0 {
		return r.ID
	}
	return derivedID(fmt.Sprintf("%s:%d", r.ID, len(r.Steps)))
}
func derivedID(value string) string {
	sum := sha256.Sum256([]byte(value))
	sum[6] = sum[6]&15 | 64
	sum[8] = sum[8]&63 | 128
	return fmt.Sprintf("%x-%x-%x-%x-%x", sum[:4], sum[4:6], sum[6:8], sum[8:10], sum[10:16])
}
func (h *Handler) finishStep(ctx context.Context, r *Run) error {
	r.Reply = r.Result.Summary
	r.Steps = append(r.Steps, Step{Action: *r.Action, Result: *r.Result})
	r.Status = "completed"
	if r.Continue {
		r.Status = "planning"
		r.Action = nil
	}
	return h.save(ctx, r)
}
