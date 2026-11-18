package processing

import (
	"context"
	"encoding/json"
	"errors"
	"math"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"sneepcut/backend-go/internal/aiprovider"
	"sneepcut/backend-go/internal/music"
	"sneepcut/backend-go/internal/story"
)

// Provider fixtures are explicit annotations, not a second local detector.
func hostedMusicFixture(duration, first float64) hostedMusicResponse {
	response := hostedMusicResponse{Duration: duration, Summary: "Synthetic rhythmic fixture with a steady pulse.",
		Sections: []story.MusicSection{{Start: 0, End: duration, Label: "Steady synthetic pulse", Energy: .6, Pace: "moderate", Transition: "cut", Confidence: .9}},
		Regions:  []story.MusicRegion{{Start: 0, End: duration, BPM: 120, Confidence: .9}},
	}
	for at := first; at < duration; at += .5 {
		response.Events = append(response.Events, story.MusicEvent{Time: at, Kind: "beat", Strength: .8, Confidence: .9, UncertaintySeconds: .08})
	}
	return response
}

func configureHostedMusicFixture(p *Processor, duration, first float64) *storySemanticMock {
	raw, _ := json.Marshal(hostedMusicFixture(duration, first))
	reviewer := &storySemanticMock{storyReviewMock: storyReviewMock{result: string(raw)}, model: "music-fixture"}
	p.ai = &taskProvider{providers: map[aiprovider.Task]aiprovider.Generator{aiprovider.TaskMusicAnalysis: reviewer}}
	return reviewer
}

func TestHostedMusicRejectsUnsupportedOrUnboundedEvidence(t *testing.T) {
	for _, test := range []struct {
		name string
		edit func(*hostedMusicResponse)
	}{
		{"wrong clock", func(r *hostedMusicResponse) { r.Duration = 42 }},
		{"missing summary", func(r *hostedMusicResponse) { r.Summary = "" }},
		{"missing sections", func(r *hostedMusicResponse) { r.Sections = nil }},
		{"too many sections", func(r *hostedMusicResponse) { r.Sections = make([]story.MusicSection, 65) }},
		{"invalid confidence", func(r *hostedMusicResponse) { r.Sections[0].Confidence = 1.1 }},
		{"invalid energy", func(r *hostedMusicResponse) { r.Sections[0].Energy = -1 }},
		{"incomplete sections", func(r *hostedMusicResponse) { r.Sections[0].End = 11 }},
		{"section gap", func(r *hostedMusicResponse) { r.Sections[0].Start = .1 }},
		{"section overlap", func(r *hostedMusicResponse) { r.Sections = append(r.Sections, r.Sections[0]) }},
		{"unknown pacing", func(r *hostedMusicResponse) { r.Sections[0].Pace = "whatever" }},
		{"unknown transition", func(r *hostedMusicResponse) { r.Sections[0].Transition = "flash" }},
	} {
		t.Run(test.name, func(t *testing.T) {
			response := hostedMusicFixture(12, .23)
			test.edit(&response)
			raw, _ := json.Marshal(response)
			if _, err := decodeHostedMusic(string(raw), 12); err == nil {
				t.Fatal("unsafe evidence was accepted")
			}
		})
	}
	for _, raw := range []string{`{"duration":12,"tool":"execute"}`, `null`, `{"duration":NaN}`, strings.Repeat(" ", hostedMusicMaxResponse+1)} {
		if _, err := decodeHostedMusic(raw, 12); err == nil {
			t.Fatal("malformed evidence was accepted")
		}
	}
	valid, _ := json.Marshal(hostedMusicFixture(12, .23))
	if _, err := decodeHostedMusic(string(valid)+" {}", 12); err == nil {
		t.Fatal("trailing JSON accepted")
	}
}

func TestHostedMusicUsesBroadPacingAndDiscardsUnqualifiedTiming(t *testing.T) {
	response := hostedMusicFixture(12, .23)
	response.Events, response.Regions = nil, nil
	response.Sections[0].Pace, response.Sections[0].Transition = "hold", "dissolve"
	raw, _ := json.Marshal(response)
	analysis, err := decodeHostedMusic(string(raw), 12)
	if err != nil || len(analysis.Events) != 0 || len(analysis.Regions) != 0 || len(analysis.Sections) != 1 {
		t.Fatalf("beatless music was rejected or acquired beats: %+v %v", analysis, err)
	}
	response.Regions = []story.MusicRegion{{Start: 0, End: 5, BPM: 123, Confidence: .8}, {Start: 7, End: 12, BPM: 81, Confidence: .7}}
	raw, _ = json.Marshal(response)
	analysis, err = decodeHostedMusic(string(raw), 12)
	if err != nil || len(analysis.Regions) != 0 {
		t.Fatalf("unqualified tempo entered production evidence: %+v %v", analysis, err)
	}
	response.Events = []story.MusicEvent{{Time: 2, Kind: "beat", Confidence: 1, Strength: 1}}
	raw, _ = json.Marshal(response)
	analysis, err = decodeHostedMusic(string(raw), 12)
	if err != nil || len(analysis.Events) != 0 || len(analysis.Sections) != 1 {
		t.Fatalf("model beat guesses entered production evidence: %+v %v", analysis, err)
	}
	analysis.Events = response.Events
	if validateHostedMusic(analysis, 12) == nil {
		t.Fatal("cached beat guesses were accepted as qualified evidence")
	}
}

func TestHostedMusicUsesAudioTaskAndCachesByContentAndModel(t *testing.T) {
	p, storage, dir := storyTestProcessor(t)
	file := musicExcerptFixture(t, p, dir)
	reviewer := configureHostedMusicFixture(p, 12, .23)
	reservations := 0
	ctx := story.WithAIBudget(context.Background(), func(context.Context) error { reservations++; return nil })
	key := "uploads/owner/music-cache/fixture.flac"
	prepare := func() *story.PreparedMusic {
		t.Helper()
		prepared, err := p.prepareStoryMusicFile(ctx, dir, music.Track{ID: "upload"}, key, file, true)
		if err != nil {
			t.Fatal(err)
		}
		return prepared
	}
	first := prepare()
	if reviewer.calls != 1 || reservations != 1 || len(reviewer.parts) != 1 || reviewer.parts[0].MIME != "audio/mpeg" || len(reviewer.parts[0].Data) == 0 || first.Analysis.Model != "mock:music-fixture" || first.Analysis.Version != hostedMusicVersion {
		t.Fatalf("hosted task did not receive actual audio: calls=%d reservations=%d result=%+v", reviewer.calls, reservations, first)
	}
	if strings.Contains(reviewer.prompt, key) || strings.Contains(reviewer.prompt, file) {
		t.Fatal("private storage paths leaked into provider prompt")
	}
	if !strings.Contains(reviewer.prompt, "events and regions must remain empty") || len(first.Analysis.Events) != 0 || len(first.Analysis.Regions) != 0 {
		t.Fatal("production audio analysis requested or retained unqualified precise timing")
	}
	prepare()
	if reviewer.calls != 1 || reservations != 1 {
		t.Fatal("cache hit consumed a provider call")
	}
	reviewer.model = "changed-model"
	prepare()
	if reviewer.calls != 2 {
		t.Fatal("model change reused stale evidence")
	}
	// Replace bytes under the exact same key without changing duration.
	if err := p.ffmpeg(ctx, dir, "-f", "lavfi", "-i", "sine=frequency=220:duration=12", "-c:a", "flac", file); err != nil {
		t.Fatal(err)
	}
	prepare()
	if reviewer.calls != 3 {
		t.Fatal("changed audio reused cached evidence")
	}
	hash, err := musicFileDigest(ctx, file)
	if err != nil {
		t.Fatal(err)
	}
	cacheKey := key + "." + storyDigest([]any{hostedMusicVersion, reviewer.MediaModelIdentity(), hash, 12.0}) + ".json"
	cachePath, err := storage.Path(cacheKey)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(cachePath, []byte(`{"duration":12}`), 0600); err != nil {
		t.Fatal(err)
	}
	prepare()
	prepare()
	if reviewer.calls != 4 {
		t.Fatal("invalid cached evidence was trusted or not repaired")
	}
	// The cache remains inside the account cleanup boundary.
	if count, err := storage.DeletePrefix(ctx, "uploads/owner/"); err != nil || count == 0 {
		t.Fatalf("cache not account scoped: %d %v", count, err)
	}
}

func TestHostedMusicSkipsDisabledAnalysisAndNeverFallsBackLocally(t *testing.T) {
	p, _, dir := storyTestProcessor(t)
	file := musicExcerptFixture(t, p, dir)
	for _, selection := range []story.MusicSelection{{TrackID: "incompetech:fixture", Volume: .4}, {TrackID: "incompetech:fixture", Sync: true, Volume: 0}} {
		prepared, err := p.prepareStoryMusicExcerpt(context.Background(), t.TempDir(), music.Track{ID: selection.TrackID}, "fixture.flac", file, selection)
		if err != nil || prepared.Analysis != nil || len(prepared.Beats) != 0 {
			t.Fatalf("disabled analysis reached provider: %+v %v", prepared, err)
		}
	}
	if _, err := p.prepareStoryMusicFile(context.Background(), dir, music.Track{}, "fixture.flac", file, true); !errors.Is(err, errHostedMusicUnavailable) {
		t.Fatalf("unconfigured provider silently used local detection: %v", err)
	}
	reviewer := configureHostedMusicFixture(p, 12, .23)
	reviewer.err = errors.New("private upstream failure")
	if _, err := p.prepareStoryMusicFile(context.Background(), dir, music.Track{}, "fixture.flac", file, true); !errors.Is(err, errHostedMusicUnavailable) || strings.Contains(err.Error(), "private") {
		t.Fatalf("provider failure was hidden or leaked: %v", err)
	}
	reviewer.err = &aiprovider.RequestError{StatusCode: 403, LimitSource: "openrouter_key_limit"}
	_, failure := p.prepareStoryMusicFile(context.Background(), dir, music.Track{}, "fixture.flac", file, true)
	var providerFailure *aiprovider.RequestError
	if !errors.Is(failure, errHostedMusicUnavailable) || !errors.As(failure, &providerFailure) || !strings.Contains(failure.Error(), "spending limit") {
		t.Fatalf("music provider budget category lost before job persistence: %v", failure)
	}
	reviewer.err, reviewer.result = nil, `{"events":[]}`
	if _, err := p.prepareStoryMusicFile(context.Background(), dir, music.Track{}, "fixture.flac", file, true); !errors.Is(err, errHostedMusicUnavailable) {
		t.Fatalf("malformed provider response was accepted: %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := p.analyzeHostedMusic(ctx, dir, "fixture.flac", file, 12); !errors.Is(err, context.Canceled) {
		t.Fatalf("cancellation lost: %v", err)
	}
	budgetErr := errors.New("budget exhausted")
	ctx = story.WithAIBudget(context.Background(), func(context.Context) error { return budgetErr })
	if _, err := p.analyzeHostedMusic(ctx, dir, "fixture.flac", file, 12); !errors.Is(err, budgetErr) {
		t.Fatalf("budget failure lost: %v", err)
	}
}

func TestMusicFileDigestTracksBytesAndCancellation(t *testing.T) {
	file := filepath.Join(t.TempDir(), "fixture")
	if err := os.WriteFile(file, []byte("first"), 0600); err != nil {
		t.Fatal(err)
	}
	first, err := musicFileDigest(context.Background(), file)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(file, []byte("second"), 0600); err != nil {
		t.Fatal(err)
	}
	second, err := musicFileDigest(context.Background(), file)
	if err != nil || first == second {
		t.Fatal("content identity ignored byte changes")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := musicFileDigest(ctx, file); !errors.Is(err, context.Canceled) {
		t.Fatal("hashing ignored cancellation")
	}
	analysis := &story.MusicAnalysis{Duration: math.NaN()}
	if validateHostedMusic(analysis, 12) == nil {
		t.Fatal("nonfinite evidence accepted")
	}
}
