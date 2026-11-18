package processing

import (
	"context"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"testing"

	"sneepcut/backend-go/internal/aiprovider"
	"sneepcut/backend-go/internal/gemini"
	"sneepcut/backend-go/internal/openrouter"
	"sneepcut/backend-go/internal/story"
)

// Explicit opt-in only: this sends generated tones, never project media, to the
// selected hosted model. It reports timing quality rather than equating valid
// JSON with musical accuracy. It is not a substitute for a real-song benchmark.
func TestHostedMusicLiveSyntheticEvaluation(t *testing.T) {
	if os.Getenv("SNEEPCUT_MUSIC_EVAL") != "1" {
		t.Skip("set SNEEPCUT_MUSIC_EVAL=1 for one hosted call with synthetic audio")
	}
	p, dir, file, accents := hostedMusicEvaluationFixture(t)
	duration := 24.0
	windowed := os.Getenv("SNEEPCUT_MUSIC_EVAL_WINDOW") == "1"
	ctx := context.Background()
	if windowed {
		window := filepath.Join(dir, "synthetic-window.flac")
		if err := p.ffmpeg(ctx, dir, "-i", file, "-ss", "6", "-t", "4", "-c:a", "flac", window); err != nil {
			t.Fatal(err)
		}
		file, duration = window, 4
		var relative []float64
		for _, at := range accents {
			if at >= 6 && at < 10 {
				relative = append(relative, at-6)
			}
		}
		accents = relative
	}
	analysis := runHostedTimingBenchmark(t, p, dir, file, duration)
	assertHostedMusicTimingQuality(t, analysis, accents, duration, windowed)
}

// This separate smoke test exercises the final production pacing path. It
// proves provider integration and evidence containment, not musical accuracy.
func TestHostedMusicLivePacingIntegration(t *testing.T) {
	if os.Getenv("SNEEPCUT_MUSIC_PACING_EVAL") != "1" {
		t.Skip("set SNEEPCUT_MUSIC_PACING_EVAL=1 for one hosted pacing call with synthetic audio")
	}
	p, dir, file, _ := hostedMusicEvaluationFixture(t)
	reservations := 0
	ctx := story.WithAIBudget(context.Background(), func(context.Context) error { reservations++; return nil })
	analysis, err := p.analyzeHostedMusic(ctx, dir, "music/evaluation/synthetic-pacing.flac", file, 24)
	if err != nil {
		t.Fatal(err)
	}
	if err := validateHostedMusic(analysis, 24); err != nil {
		t.Fatal(err)
	}
	if reservations != 1 || analysis.Model == "" || analysis.Version != hostedMusicVersion || len(analysis.Events) != 0 || len(analysis.Regions) != 0 {
		t.Fatal("production pacing integration failed its evidence or budget contract")
	}
	// The identical request must reuse validated evidence, not spend another call.
	cached, err := p.analyzeHostedMusic(ctx, dir, "music/evaluation/synthetic-pacing.flac", file, 24)
	if err != nil || reservations != 1 || cached.Model != analysis.Model || len(cached.Events) != 0 || len(cached.Regions) != 0 {
		t.Fatal("production pacing cache did not preserve validated evidence")
	}
	t.Logf("hosted_pacing_integration_success=true model=%s sections=%d provider_calls=%d retained_timing_events=0; no beat precision or subjective musical-quality claim", analysis.Model, len(analysis.Sections), reservations)
	for _, section := range analysis.Sections {
		t.Logf("approximate section %.3f..%.3f %s pace=%s transition=%s", section.Start, section.End, section.Label, section.Pace, section.Transition)
	}
}

func hostedMusicEvaluationFixture(t *testing.T) (*Processor, string, string, []float64) {
	t.Helper()
	p, _, dir := storyTestProcessor(t)
	model := os.Getenv("SNEEPCUT_MUSIC_EVAL_MODEL")
	switch os.Getenv("AI_PROVIDER") {
	case "gemini":
		if os.Getenv("GEMINI_API_KEY") == "" {
			t.Fatal("Gemini key is not configured")
		}
		if model == "" {
			model = "gemini-3.8-flash"
		}
		p.ai = gemini.New(os.Getenv("GEMINI_API_KEY"), model)
	case "openrouter":
		if os.Getenv("OPENROUTER_API_KEY") == "" {
			t.Fatal("OpenRouter key is not configured")
		}
		if model == "" {
			model = "google/gemini-3.8-flash"
		}
		p.ai = openrouter.New(os.Getenv("OPENROUTER_API_KEY"), model, "")
	default:
		t.Fatal("select AI_PROVIDER=gemini or openrouter for the evaluation")
	}
	// A quiet sustained opening is followed by clear accents at 120 BPM, then
	// a slower 80 BPM passage. Exact generated times provide independent truth.
	const sourceDuration = 24.0
	var accents []float64
	for at := 6.25; at < 15; at += .5 {
		accents = append(accents, at)
	}
	for at := 15.25; at < sourceDuration; at += .75 {
		accents = append(accents, at)
	}
	pcm := musicPulsePCM(sourceDuration, accents)
	for i := 0; i < len(pcm)/2; i++ {
		at := float64(i) / 8000
		base := float64(int16(binary.LittleEndian.Uint16(pcm[i*2:]))) / 32768
		base += .035 * (math.Sin(2*math.Pi*220*at) + math.Sin(2*math.Pi*330*at))
		binary.LittleEndian.PutUint16(pcm[i*2:], uint16(int16(base*32767)))
	}
	raw := filepath.Join(dir, "synthetic-music.s16")
	if err := os.WriteFile(raw, pcm, 0600); err != nil {
		t.Fatal(err)
	}
	file := filepath.Join(dir, "synthetic-music.flac")
	ctx := context.Background()
	if err := p.ffmpeg(ctx, dir, "-f", "s16le", "-ar", "8000", "-ac", "1", "-i", raw, "-c:a", "flac", file); err != nil {
		t.Fatal(err)
	}
	return p, dir, file, accents
}

func assertHostedMusicTimingQuality(t *testing.T, analysis *story.MusicAnalysis, accents []float64, duration float64, windowed bool) {
	t.Helper()
	matched := map[int]bool{}
	within, proposed, totalError := 0, 0, 0.0
	for _, event := range analysis.Events {
		if event.Kind == "section" {
			continue
		}
		proposed++
		nearest, best := math.Inf(1), -1
		for i, at := range accents {
			if distance := math.Abs(at - event.Time); distance < nearest {
				nearest, best = distance, i
			}
		}
		totalError += nearest
		if nearest <= .15 {
			within++
			matched[best] = true
		}
	}
	meanError := 0.0
	if proposed > 0 {
		meanError = totalError / float64(proposed)
	}
	precision := 0.0
	if proposed > 0 {
		precision = float64(within) / float64(proposed)
	}
	boundaryDetected := func(at float64) bool {
		for _, section := range analysis.Sections {
			if math.Abs(section.Start-at) <= 1 || math.Abs(section.End-at) <= 1 {
				return true
			}
		}
		for _, region := range analysis.Regions {
			if region.Confidence >= .55 && (math.Abs(region.Start-at) <= 1 || math.Abs(region.End-at) <= 1) {
				return true
			}
		}
		return false
	}
	introDetected, tempoChangeDetected := boundaryDetected(6.25), boundaryDetected(15.25)
	t.Logf("integration_success=true model=%s windowed=%v duration=%.1f sections=%d proposed_accents=%d within_150ms=%d annotated_accents=%d recovered=%d precision_150ms=%.3f mean_nearest_error_seconds=%.3f intro_boundary_detected=%v tempo_change_detected=%v", analysis.Model, windowed, duration, len(analysis.Sections), proposed, within, len(accents), len(matched), precision, meanError, introDetected, tempoChangeDetected)
	t.Logf("Evidence summary: %s", analysis.Summary)
	for _, section := range analysis.Sections {
		t.Logf("section %.3f..%.3f %s pace=%s transition=%s", section.Start, section.End, section.Label, section.Pace, section.Transition)
	}
	// The diagnostic prompt intentionally asks for sparse useful accents. Demand
	// accurate proposed anchors and some coverage, not every generated beat.
	if precision < .8 || len(matched) < 6 || meanError > .15 || !windowed && (!introDetected || !tempoChangeDetected) {
		t.Fatal("timing_quality_accepted=false: integration works, but the model failed the synthetic timing gate; do not enable precise synchronization based on this result")
	}
	t.Log("timing_quality_accepted=true for this synthetic fixture only; representative real-song validation is still required")
}

// This deliberately separate diagnostic retains the rejected timing experiment.
// Production asks for broad musical pacing only, and drops any returned events.
const hostedMusicTimingBenchmarkPrompt = `Listen to the supplied synthetic music. Describe its development and observed musical timing. Return ONLY JSON {"duration":24,"summary":"development and uncertainty","events":[{"time":1,"kind":"beat","strength":0.8,"confidence":0.8,"uncertainty_seconds":0.15}],"regions":[{"start":0,"end":24,"bpm":120,"confidence":0.8}],"sections":[{"start":0,"end":24,"label":"Steady pulse","energy":0.6,"pace":"moderate","transition":"cut","confidence":0.8}]}. All times are seconds relative to this audio's start. Events must be observed beat/downbeat/onset/accent/section opportunities, sorted, within the excerpt. Do not extrapolate a beat grid from BPM. Prefer sparse useful accents; beatless music can return none. Express uncertainty_seconds >=0.05, strength/confidence0..1. Regions describe locally supported tempo, zero BPM for unknown. Sections must partition the complete excerpt, use pace slow/moderate/fast/hold and transition cut/dissolve/hold. Listen for silence, sustained passages, rhythmic entrances, and tempo changes. Do not invent certainty.`

func runHostedTimingBenchmark(t *testing.T, p *Processor, dir, file string, duration float64) *story.MusicAnalysis {
	t.Helper()
	compressed := filepath.Join(dir, "timing-benchmark.mp3")
	ctx := context.Background()
	if err := p.ffmpeg(ctx, dir, "-i", file, "-ar", "44100", "-ac", "2", "-c:a", "libmp3lame", "-b:a", "96k", compressed); err != nil {
		t.Fatal(err)
	}
	data, err := readBoundedMusicFile(compressed, hostedMusicMaxBytes)
	if err != nil {
		t.Fatal(err)
	}
	reviewer := p.ai.(aiprovider.MediaReviewer)
	model := p.ai.(aiprovider.MediaModelIdentity).MediaModelIdentity()
	raw, err := reviewer.ReviewMedia(ctx, hostedMusicTimingBenchmarkPrompt+fmt.Sprintf("\nActual duration: %.6f seconds.", duration), []aiprovider.MediaPart{{Label: "Synthetic benchmark audio, origin0", MIME: "audio/mpeg", Data: data}})
	if err != nil {
		t.Fatal(err)
	}
	if len(raw) > hostedMusicMaxResponse {
		t.Fatal("benchmark response exceeds limit")
	}
	var response hostedMusicResponse
	if err := json.Unmarshal([]byte(raw), &response); err != nil {
		t.Fatal("invalid diagnostic response JSON")
	}
	analysis := &story.MusicAnalysis{Duration: response.Duration, Model: model, Summary: response.Summary, Sections: response.Sections}
	if err := validateHostedMusic(analysis, duration); err != nil {
		t.Fatal("invalid diagnostic section bounds")
	}
	for _, event := range response.Events {
		if !finite(event.Time) || event.Time < 0 || event.Time >= duration {
			t.Fatal("invalid diagnostic event time")
		}
	}
	analysis.Events, analysis.Regions = response.Events, response.Regions
	return analysis
}
