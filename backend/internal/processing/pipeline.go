package processing

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
)

var namespacePattern = regexp.MustCompile(`^[A-Za-z0-9_-]+(?:/[A-Za-z0-9_-]+)*$`)

func (p *Processor) process(ctx context.Context, in Input, progress Progress) (Result, error) {
	ctx, cancel := context.WithTimeout(ctx, p.cfg.Timeout)
	defer cancel()
	r := Result{}
	if !namespacePattern.MatchString(in.Namespace) {
		return r, fmt.Errorf("invalid processing namespace")
	}
	dir, e := os.MkdirTemp(p.cfg.TempDir, "sneep-process-")
	if e != nil {
		return r, e
	}
	defer os.RemoveAll(dir)
	report := func(status string, n int, msg string) {
		if progress != nil {
			progress(status, n, msg)
		}
	}
	report("downloading", 5, "Preparing source video")
	source := filepath.Join(dir, "source.mp4")
	if in.SourceKey != "" {
		e = p.materialize(ctx, in.SourceKey, source)
	} else {
		e = p.download(ctx, in.SourceURL, source)
	}
	if e != nil {
		return r, e
	}
	info, e := p.probe(ctx, source)
	if e != nil {
		return r, e
	}
	if !info.Audio {
		return r, fmt.Errorf("source video has no audio stream")
	}
	r.Duration = info.Duration
	report("transcribing", 20, "Transcribing audio locally")
	r.Transcript, e = p.transcribe(ctx, source, dir, in.Language, info.Duration)
	if e != nil {
		return r, e
	}
	report("analyzing", 50, "Selecting highlights")
	highlights, e := p.highlights(ctx, r.Transcript, in.RequestedClips, in.Instructions)
	if e != nil {
		return r, e
	}
	r.SourceKey = "sources/" + in.Namespace + "/source.mp4"
	if e = p.storage.Save(ctx, source, r.SourceKey, "video/mp4"); e != nil {
		return r, e
	}
	for i, h := range highlights {
		report("rendering", 60+30*i/len(highlights), fmt.Sprintf("Rendering clip %d/%d", i+1, len(highlights)))
		clip, err := p.render(ctx, RenderInput{SourceKey: r.SourceKey, Namespace: fmt.Sprintf("%s/clip-%d", in.Namespace, i+1), AspectRatio: in.AspectRatio, SubtitleStyle: in.SubtitleStyle, SmartCrop: in.SmartCrop, BurnSubtitles: in.BurnSubtitles, Segments: h.Segments, Transition: h.Transition, TransitionDuration: h.TransitionDuration, Transcript: r.Transcript, Brand: in.Brand, HookText: h.Hook})
		if err != nil {
			return r, err
		}
		clip.Metadata["score_reason"] = h.ScoreReason
		clip.Metadata["suggested_hashtags"] = h.Hashtags
		clip.Index = i + 1
		clip.Title = h.Title
		clip.Description = h.Description
		clip.HookText = h.Hook
		clip.Score = h.Score
		clip.Metadata["video_description_for_tiktok"] = h.Description
		clip.Metadata["video_description_for_instagram"] = h.Instagram
		clip.Metadata["video_title_for_youtube_short"] = h.Title
		r.Clips = append(r.Clips, clip)
	}
	report("rendering", 95, "Outputs ready")
	return r, nil
}
