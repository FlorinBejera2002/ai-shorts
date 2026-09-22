package worker

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"sneepcut/backend-go/internal/media"
	"sneepcut/backend-go/internal/processing"
	"strings"
	"time"
)

type Pipeline interface {
	Process(context.Context, processing.Input, processing.Progress) (processing.Result, error)
	Render(context.Context, processing.RenderInput) (processing.Clip, error)
}
type Worker struct {
	Repo                  *Repository
	Pipeline              Pipeline
	Storage               media.Storage
	Logger                *slog.Logger
	YouTubeImportApproved bool
}

func (w *Worker) Run(ctx context.Context) error {
	tick := time.NewTicker(2 * time.Second)
	defer tick.Stop()
	for {
		if ctx.Err() != nil {
			return nil
		}
		if err := w.Repo.Recover(ctx); err != nil {
			w.Logger.Error("Recover jobs", "error", err)
		}
		if err := w.Repo.RecoverEdits(ctx); err != nil {
			w.Logger.Error("Recover edits", "error", err)
		}
		worked, err := w.Once(ctx)
		if err != nil {
			w.Logger.Error("Worker execution", "error", err)
		}
		if worked {
			continue
		}
		select {
		case <-ctx.Done():
			return nil
		case <-tick.C:
		}
	}
}
func (w *Worker) Once(ctx context.Context) (bool, error) {
	e, err := w.Repo.ClaimEdit(ctx)
	if err != nil {
		return false, err
	}
	if e != nil {
		return true, w.edit(ctx, e)
	}
	j, err := w.Repo.Claim(ctx)
	if err != nil || j == nil {
		return false, err
	}
	return true, w.process(ctx, j)
}
func (w *Worker) process(parent context.Context, j *Job) error {
	ctx, cancel := context.WithTimeout(parent, 2*time.Hour)
	defer cancel()
	done := make(chan struct{})
	defer close(done)
	go func() {
		t := time.NewTicker(30 * time.Second)
		defer t.Stop()
		for {
			select {
			case <-done:
				return
			case <-ctx.Done():
				return
			case <-t.C:
				if err := w.Repo.Progress(ctx, j, "", 0, ""); err != nil {
					cancel()
					return
				}
			}
		}
	}()
	var payload struct {
		Source         string `json:"source"`
		SourceKey      string `json:"source_storage_key"`
		RequestedClips int    `json:"requested_clips"`
		BurnSubtitles  *bool  `json:"burn_subtitles"`
		SmartCrop      *bool  `json:"smart_crop"`
		Instructions   string `json:"user_instructions"`
	}
	err := json.Unmarshal(j.Payload, &payload)
	namespace := j.ID + "/attempts/" + j.Token
	if err == nil && payload.SourceKey != "" && (payload.SourceKey != j.SourceKey || !strings.HasPrefix(payload.SourceKey, "uploads/"+j.UserID+"/") || len(strings.Split(payload.SourceKey, "/")) != 3) {
		err = errors.New("uploaded source does not belong to job owner")
	}
	var result processing.Result
	if err == nil {
		result, err = w.processInput(ctx, processing.Input{SourceKey: payload.SourceKey, SourceURL: payload.Source, Namespace: namespace, Language: j.Language, Instructions: payload.Instructions, AspectRatio: j.AspectRatio, SubtitleStyle: j.SubtitleStyle, RequestedClips: payload.RequestedClips, SmartCrop: payload.SmartCrop == nil || *payload.SmartCrop, BurnSubtitles: payload.BurnSubtitles == nil || *payload.BurnSubtitles, Brand: j.Brand}, func(status string, pct int, msg string) {
			if e := w.Repo.Progress(ctx, j, status, pct, msg); e != nil {
				cancel()
			}
		})
	}
	if err == nil {
		err = w.Repo.Complete(ctx, j, result)
	}
	if err != nil {
		cleanup, stop := context.WithTimeout(context.Background(), 30*time.Second)
		defer stop()
		if parent.Err() == nil {
			if e := w.Repo.Fail(cleanup, j, err.Error()); e != nil && !errors.Is(e, ErrOwnership) {
				w.Logger.Error("Finalize failed job", "error", e)
			}
		}
		for _, prefix := range []string{"sources/", "clips/", "work/"} {
			if _, e := w.Storage.DeletePrefix(cleanup, prefix+namespace); e != nil {
				w.Logger.Warn("Attempt cleanup", "error", e)
			}
		}
	}
	return err
}

// Gate queued URL jobs too: OAuth access is not permission to download videos.
// All remote links are gated because redirects could otherwise bypass the check.
func (w *Worker) processInput(ctx context.Context, input processing.Input, progress processing.Progress) (processing.Result, error) {
	if input.SourceKey == "" && !w.YouTubeImportApproved {
		return processing.Result{}, errors.New("Video link imports are unavailable. Upload your original video file instead")
	}
	return w.Pipeline.Process(ctx, input, progress)
}
