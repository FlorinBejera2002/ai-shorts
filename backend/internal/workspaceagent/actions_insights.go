package workspaceagent

import (
	"context"
	"errors"
	"net/url"
	"strconv"
	"time"
)

func (e *PlatformExecutor) clipLibrary(ctx context.Context, user string, a Action) (ActionResult, error) {
	if e.clips == nil {
		return ActionResult{}, ErrUnavailable
	}
	var in struct {
		Search    string `json:"search"`
		Score     string `json:"score"`
		Aspect    string `json:"aspect"`
		Subtitles string `json:"subtitles"`
		Sort      string `json:"sort"`
		Page      int    `json:"page"`
	}
	if err := decodeAction(a.Input, &in); err != nil {
		return ActionResult{}, err
	}
	v, err := e.clips.AgentLibrary(ctx, user, url.Values{"search": {in.Search}, "score": {in.Score}, "aspect": {in.Aspect}, "subtitles": {in.Subtitles}, "sort": {in.Sort}, "page": {strconv.Itoa(in.Page)}})
	return actionResult("Loaded matching library clips", "/dashboard/clips", v), err
}
func (e *PlatformExecutor) activity(ctx context.Context, user string, a Action) (ActionResult, error) {
	var in struct {
		Days int `json:"days"`
	}
	in.Days = 30
	if err := decodeAction(a.Input, &in); err != nil {
		return ActionResult{}, err
	}
	if in.Days < 1 || in.Days > 365 {
		return ActionResult{}, errors.New("Choose an activity range of 1–365 days")
	}
	now := time.Now().UTC()
	end := time.Date(now.Year(), now.Month(), now.Day()+1, 0, 0, 0, 0, time.UTC)
	start := end.AddDate(0, 0, -in.Days)
	rows, err := e.db.QueryContext(ctx, `SELECT day::text,count(*) FILTER(WHERE kind='clip'),count(*) FILTER(WHERE kind='project'),coalesce(sum(duration),0),avg(score) FROM (SELECT (created_at AT TIME ZONE 'UTC')::date AS day,'clip' kind,duration,viral_score score FROM clips WHERE user_id=$1 AND created_at>=$2 AND created_at<$3 UNION ALL SELECT (created_at AT TIME ZONE 'UTC')::date,'project',0,NULL FROM jobs WHERE user_id=$1 AND created_at>=$2 AND created_at<$3) activity GROUP BY day ORDER BY day`, user, start, end)
	if err != nil {
		return ActionResult{}, err
	}
	defer rows.Close()
	days := []map[string]any{}
	for rows.Next() {
		var day string
		var clips, projects int
		var seconds float64
		var score *float64
		if err = rows.Scan(&day, &clips, &projects, &seconds, &score); err != nil {
			return ActionResult{}, err
		}
		days = append(days, map[string]any{"date": day, "clips": clips, "projects": projects, "duration_seconds": seconds, "average_internal_score": score})
	}
	return actionResult("Loaded actual workspace production activity; scores are internal estimates, not platform engagement", "/dashboard", map[string]any{"start": start, "end_exclusive": end, "timezone": "UTC", "days": days}), rows.Err()
}
