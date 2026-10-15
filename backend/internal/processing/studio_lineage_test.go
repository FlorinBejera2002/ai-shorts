package processing

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"sneepcut/backend-go/internal/media"
	"sneepcut/backend-go/internal/story"
	"sneepcut/backend-go/internal/studiocomposition"
)

func TestStudioTrimUsesCurrentProjectAndRejectsStaleDuration(t *testing.T) {
	var requests []map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var e struct {
			Operation string         `json:"operation"`
			Input     map[string]any `json:"input"`
		}
		_ = json.NewDecoder(r.Body).Decode(&e)
		if e.Operation != "composition.derive" {
			t.Error(e.Operation)
		}
		requests = append(requests, e.Input)
		w.WriteHeader(http.StatusConflict)
	}))
	defer server.Close()
	p := New(Config{TempDir: t.TempDir(), StudioURL: server.URL, StudioSecret: strings.Repeat("s", 32)}, nil, nil)
	base := studiocomposition.Identity(studioTestOwner, "base", nil)
	in := RenderInput{UserID: studioTestOwner, Namespace: "clip/trim", StudioOperationID: "operation", StudioTrim: true, StudioArtifactID: base, StudioExpectedDuration: 8, Segments: []Segment{{1, 3}}}
	if _, err := p.Render(context.Background(), in); !errors.Is(err, studiocomposition.ErrProjectChanged) {
		t.Fatal("stale project duration ignored", err)
	}
	in.StudioExportOnly, in.StudioRemovePlatformBadge = true, true
	_, _ = p.Render(context.Background(), in)
	if len(requests) != 2 || requests[0]["expected_duration"] != float64(8) || requests[0]["base_artifact_id"] != base || requests[1]["expected_duration"] != nil || requests[1]["export_only"] != true || requests[1]["remove_platform_badge"] != true {
		t.Fatal("trim lineage/precondition/export contract lost", requests)
	}
}

func TestStudioManualOutputChecksActualSilentMediaAndGeometry(t *testing.T) {
	p, storage, dir := storyTestProcessor(t)
	ctx := context.Background()
	file := filepath.Join(dir, "manual.mp4")
	if err := p.ffmpeg(ctx, dir, "-f", "lavfi", "-i", "color=c=red:s=320x180:r=30", "-t", "1", "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", file); err != nil {
		t.Fatal(err)
	}
	key := "clips/manual/story/clip.mp4"
	if err := storage.Save(ctx, file, key, "video/mp4"); err != nil {
		t.Fatal(err)
	}
	req := story.Request{ID: "manual"}
	v := story.Version{Number: 1, Timeline: []story.Entry{{OutputOut: 8}}, Output: story.Output{StudioManualEdits: true, Key: key, Duration: 1, Resolution: "320x180", Size: 100}}
	report, err := p.ReviewStory(ctx, req, v)
	if err != nil || !report.Coverage.File || report.Status != "needs_review" || report.Coverage.Audio || len(report.Issues) > 0 {
		t.Fatal("intentional mute or shorter cut rejected", report, err)
	}
	v.Output.Resolution = "640x360"
	report, err = p.ReviewStory(ctx, req, v)
	if err != nil || report.Coverage.File || len(report.Issues) == 0 {
		t.Fatal("incorrect geometry accepted", report, err)
	}
}

func TestStoryRenderLineageAndStableBlockIdentityAcrossRegeneration(t *testing.T) {
	type envelope struct {
		Operation string `json:"operation"`
		RequestID string `json:"request_id"`
		Input     struct {
			Plan           studioPlan `json:"plan"`
			ProjectID      string     `json:"project_id"`
			BaseArtifactID string     `json:"base_artifact_id"`
		} `json:"input"`
	}
	var calls []envelope
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var e envelope
		_ = json.NewDecoder(r.Body).Decode(&e)
		if e.Operation == "composition.render" {
			calls = append(calls, e)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"artifact_id": e.RequestID, "status": "failed"})
	}))
	defer server.Close()
	dir := t.TempDir()
	storage, err := media.NewLocalStorage(filepath.Join(dir, "media"))
	if err != nil {
		t.Fatal(err)
	}
	defer storage.Close()
	p := New(Config{TempDir: dir, StudioURL: server.URL, StudioSecret: strings.Repeat("s", 32), MediaSigningSecret: strings.Repeat("m", 32), MediaOrigin: "http://localhost:3000"}, storage, nil)
	id := studiocomposition.Identity(studioTestOwner, "story", nil)
	request := story.Request{ID: id, UserID: studioTestOwner, StudioOperationID: "first", Options: story.Options{AspectRatio: "16:9", CaptionMode: "off"}, Assets: []story.Asset{{ID: "source", Key: "uploads/source.mp4", Duration: 4, Width: 1920, Height: 1080}}}
	version := story.Version{Number: 1, Timeline: []story.Entry{{BlockID: "one", OutputOut: 1, Video: story.Interval{SourceID: "source", Out: 1}, Crop: "fit"}, {BlockID: "two", OutputIn: 1, OutputOut: 2, Video: story.Interval{SourceID: "source", In: 1, Out: 2}, Crop: "fit"}}}
	_, _ = p.RenderStory(context.Background(), request, version)
	request.StudioBaseArtifactID = studiocomposition.Identity(studioTestOwner, "historical-artifact", nil)
	request.StudioOperationID = "second"
	_, _ = p.RenderStory(context.Background(), request, version)
	request.StudioOperationID = "third"
	version.Timeline[0].BlockID, version.Timeline[1].BlockID = "two", "one"
	_, _ = p.RenderStory(context.Background(), request, version)
	if len(calls) != 3 {
		t.Fatal("render submissions missing", len(calls))
	}
	if calls[0].Input.ProjectID != id || calls[0].Input.BaseArtifactID != "" {
		t.Fatal("initial shared project missing", calls[0])
	}
	for _, c := range calls[1:] {
		if c.Input.ProjectID != "" || c.Input.BaseArtifactID != request.StudioBaseArtifactID {
			t.Fatal("historical artifact must resolve current shared lineage", c)
		}
	}
	if calls[0].RequestID == calls[1].RequestID || calls[1].RequestID == calls[2].RequestID {
		t.Fatal("new operation reused stale artifact")
	}
	if calls[0].Input.Plan.Scenes[0].ID != calls[2].Input.Plan.Scenes[1].ID || calls[0].Input.Plan.Scenes[1].ID != calls[2].Input.Plan.Scenes[0].ID {
		t.Fatal("scene identity followed its index instead of its Story block")
	}
}

func TestStudioEffectiveTimelineUsesActualManualCutClocks(t *testing.T) {
	key := "uploads/source.mp4"
	req := story.Request{Assets: []story.Asset{{ID: "source", Key: key}}}
	v := story.Version{Timeline: []story.Entry{{BlockID: "block", OutputOut: 4, Video: story.Interval{SourceID: "source", Out: 4}, Audio: &story.Interval{SourceID: "source", Out: 4}, Words: []story.Word{{Text: "original", Start: 0, End: 1}}}}}
	p := studioPlan{Scenes: []studioScene{{ID: "scene-block"}}}
	raw, _ := json.Marshal(map[string]any{"manually_edited": true, "duration": 2, "scenes": []map[string]any{{"id": "manual-copy", "canonical_scene_id": "scene-block", "asset_id": "asset-" + storyDigest(key)[:20], "start": .5, "duration": 1.5, "source_in": 1, "playback_rate": 2}}})
	manual, entries := studioStoryTimeline(raw, req, v, p)
	if !manual || len(entries) != 1 || entries[0].OutputIn != .5 || entries[0].OutputOut != 2 || entries[0].Video.In != 1 || entries[0].Video.Out != 4 || entries[0].Audio != nil || len(entries[0].Words) != 0 {
		t.Fatalf("obsolete recipe clocks/audio survived: %+v", entries)
	}
}
