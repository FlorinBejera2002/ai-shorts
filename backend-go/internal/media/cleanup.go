package media

import (
	"context"
	"database/sql"
	"errors"
	"sort"
)

type CleanupResult struct {
	Deleted  int  `json:"deleted"`
	Complete bool `json:"complete"`
}

func (s *Service) cleanupReady(ctx context.Context, userID string) error {
	var billing bool
	e := s.db.QueryRowContext(ctx, `SELECT billing_cancellation_completed FROM account_deletion_requests WHERE user_id=$1`, userID).Scan(&billing)
	if errors.Is(e, sql.ErrNoRows) {
		return failure(409, "Account deletion has not been requested")
	}
	if e != nil {
		return e
	}
	if !billing {
		return failure(409, "Billing cancellation must complete before media cleanup")
	}
	var active bool
	e = s.db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM jobs WHERE user_id=$1 AND (status NOT IN ('completed','failed','cancelled') OR processing_active=true OR active_edit_tasks>0))`, userID).Scan(&active)
	if e != nil {
		return e
	}
	if active {
		return failure(409, "Account media cleanup is waiting for active work to stop")
	}
	return nil
}

// CleanupAccount deliberately leaves database rows and the deletion marker in
// place on any storage error. Callers may finalize only after Complete is true.
func (s *Service) CleanupAccount(ctx context.Context, userID string) (CleanupResult, error) {
	result := CleanupResult{}
	if !uuidPattern.MatchString(userID) {
		return result, ErrInvalidKey
	}
	if e := s.cleanupReady(ctx, userID); e != nil {
		return result, e
	}
	prefixes := map[string]bool{"uploads/" + userID + "/": true, "brand/" + userID + "/": true, "publishing/" + userID + "/": true}
	keys := map[string]bool{}
	add := func(value sql.NullString) {
		if value.Valid {
			if key, e := s.KeyFromReference(value.String); e == nil {
				keys[key] = true
			}
		}
	}
	jobs, e := s.db.QueryContext(ctx, `SELECT id,source_file_path,source_video_url,source_storage_key FROM jobs WHERE user_id=$1`, userID)
	if e != nil {
		return result, e
	}
	for jobs.Next() {
		var id string
		var file, video, key sql.NullString
		if e = jobs.Scan(&id, &file, &video, &key); e != nil {
			jobs.Close()
			return result, e
		}
		if !uuidPattern.MatchString(id) {
			jobs.Close()
			return result, ErrInvalidKey
		}
		for _, p := range []string{"sources/" + id + "/", "clips/" + id + "/", "work/" + id + "/", id + "/clips/"} {
			prefixes[p] = true
		}
		add(file)
		add(video)
		add(key)
	}
	e = jobs.Err()
	jobs.Close()
	if e != nil {
		return result, e
	}
	clips, e := s.db.QueryContext(ctx, `SELECT file_path,file_url,file_storage_key,thumbnail_path,thumbnail_url,thumbnail_storage_key FROM clips WHERE user_id=$1`, userID)
	if e != nil {
		return result, e
	}
	for clips.Next() {
		values := make([]sql.NullString, 6)
		if e = clips.Scan(&values[0], &values[1], &values[2], &values[3], &values[4], &values[5]); e != nil {
			clips.Close()
			return result, e
		}
		for _, v := range values {
			add(v)
		}
	}
	e = clips.Err()
	clips.Close()
	if e != nil {
		return result, e
	}
	var brand [4]sql.NullString
	e = s.db.QueryRowContext(ctx, `SELECT logo_path,intro_video_path,outro_video_path,watermark_path FROM brand_kits WHERE user_id=$1`, userID).Scan(&brand[0], &brand[1], &brand[2], &brand[3])
	if e != nil && !errors.Is(e, sql.ErrNoRows) {
		return result, e
	}
	for _, v := range brand {
		add(v)
	}
	failures := 0
	ordered := func(set map[string]bool) []string {
		values := make([]string, 0, len(set))
		for k := range set {
			values = append(values, k)
		}
		sort.Strings(values)
		return values
	}
	for _, prefix := range ordered(prefixes) {
		n, e := s.Storage.DeletePrefix(ctx, prefix)
		if e != nil {
			failures++
		} else {
			result.Deleted += n
		}
	}
	for _, key := range ordered(keys) {
		if e := s.Storage.Delete(ctx, key); e != nil {
			failures++
		} else {
			result.Deleted++
		}
	}
	if failures > 0 {
		return result, failure(502, "Some account media could not be removed. No database records were deleted.")
	}
	// Workers can cross a cooperative checkpoint during cleanup. Recheck the
	// durable marker, billing and work state before permitting finalization.
	if e = s.cleanupReady(ctx, userID); e != nil {
		return result, e
	}
	result.Complete = true
	return result, nil
}
