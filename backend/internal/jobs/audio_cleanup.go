package jobs

import (
	"context"
	"encoding/json"
	"sneepcut/backend-go/internal/audiocleanup"
)

func (r *Repository) audioCleanup(ctx context.Context, user, id string) (*audiocleanup.Derivative, error) {
	var raw []byte
	err := r.db.QueryRowContext(ctx, `SELECT coalesce(d.payload::jsonb->'audio_cleanup_result','null'::jsonb) FROM jobs j JOIN job_deliveries d ON d.job_id=j.id WHERE j.id=$1 AND j.user_id=$2`, id, user).Scan(&raw)
	if err != nil {
		return nil, err
	}
	var result *audiocleanup.Derivative
	err = json.Unmarshal(raw, &result)
	return result, err
}
