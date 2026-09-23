package processing

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"strings"

	"sneepcut/backend-go/internal/story"
)

func (p *Processor) analyzeNarration(ctx context.Context, project string, asset story.Asset, options story.Options) (story.Asset, error) {
	if !options.Narration || !storyNamespace(project) || !storyNamespace(asset.ID) || len(asset.Hash) != 64 || !finite(asset.Duration) || asset.Duration <= 0 || asset.Duration > story.MaxNarrationSeconds || !asset.HasAudio {
		return asset, errors.New("invalid narration source")
	}
	dir, err := os.MkdirTemp(p.cfg.TempDir, "narration-analysis-")
	if err != nil {
		return asset, storyWorkError("narration analysis")
	}
	defer os.RemoveAll(dir)
	model := p.cfg.StoryWhisperModel
	if model == "" {
		model = p.cfg.WhisperModel
	}
	digest := storyDigest([]any{story.AlgorithmVersion, "narration-analysis-1", asset.Hash, options.Language, storyModelSignature(model)})
	prefix := "work/" + project + "/analysis/" + asset.ID + "/" + digest
	cacheFile := filepath.Join(dir, "analysis.json")
	if p.materialize(ctx, prefix+"/analysis.json", cacheFile) == nil {
		data, err := os.ReadFile(cacheFile)
		var cached story.Asset
		if err == nil && len(data) < 8<<20 && json.Unmarshal(data, &cached) == nil && cached.ID == asset.ID && cached.Hash == asset.Hash && cached.AnalysisVersion == digest && cached.Kind == "narration" && len(cached.Candidates) > 0 {
			if exists, err := p.storage.Exists(ctx, cached.ProxyKey); err == nil && exists {
				cached.Order, cached.Role, cached.Include, cached.Name = asset.Order, asset.Role, asset.Include, asset.Name
				if asset.AnalysisVersion == digest {
					cached.SemanticAnalysisVersion = asset.SemanticAnalysisVersion
				}
				return cached, nil
			}
		}
	}
	source, err := p.storyMaterialize(ctx, dir, asset.Key)
	if err != nil {
		return asset, errors.New("original narration is unavailable")
	}
	wav, duration, signal, err := p.normalizeNarration(ctx, dir, source)
	if err != nil {
		return asset, err
	}
	if math.Abs(duration-asset.Duration) > .002 {
		return asset, errors.New("narration duration changed since upload validation")
	}
	if signal < .001 {
		return asset, errors.New("narration is silent; record an audible voice")
	}
	transcript, err := p.transcribeModel(ctx, wav, dir, options.Language, duration, model)
	if err != nil && !strings.Contains(err.Error(), "no speech detected") {
		return asset, errors.New("aligned narration transcription is unavailable; retry after the speech engine is ready")
	}
	if err != nil || len(transcript.Words) == 0 {
		return asset, errors.New("no reliable spoken narration was found; record a clear voice")
	}
	spoken := false
	for _, word := range transcript.Words {
		text := strings.TrimSpace(word.Text)
		if text != "" && !strings.HasPrefix(text, "[") && word.End > word.Start && word.Start >= 0 && word.End <= duration+.002 {
			spoken = true
		}
	}
	if !spoken {
		return asset, errors.New("no reliable spoken narration was found; record a clear voice")
	}
	asset.Candidates = storyCandidates(asset, transcript, min(1, signal/.08), 0)
	if raw, err := os.ReadFile(filepath.Join(dir, "transcript.json")); err == nil && len(raw) < 8<<20 {
		storyTranscriptConfidence(raw, asset.Candidates)
	}
	asset.AnalysisVersion, asset.SemanticAnalysisVersion = digest, ""
	asset.ProxyKey = prefix + "/narration.wav"
	asset.Mapping.NormalizedStart, asset.Mapping.Duration, asset.Mapping.Rate = 0, duration, 1
	asset.Warnings = appendStoryWarning(asset.Warnings, "Narration words are automatic transcription estimates; original voice stays continuous and final audio/captions require independent review.")
	if err = p.storySave(ctx, wav, asset.ProxyKey, "audio/wav"); err != nil {
		return asset, err
	}
	encoded, err := json.Marshal(asset)
	if err != nil || os.WriteFile(cacheFile, encoded, 0600) != nil {
		return asset, storyWorkError("narration checkpoint")
	}
	if err = p.storySave(ctx, cacheFile, prefix+"/analysis.json", "application/json"); err != nil {
		return asset, err
	}
	return asset, nil
}

func narrationVisualWindows(asset story.Asset, visual float64) []story.Candidate {
	count := max(1, int(math.Ceil(asset.Duration/5)))
	windows := make([]story.Candidate, 0, count)
	for i := 0; i < count; i++ {
		windows = append(windows, story.Candidate{ID: fmt.Sprintf("%s-v%03d", asset.ID, i+1), SourceID: asset.ID, In: asset.Duration * float64(i) / float64(count), Out: asset.Duration * float64(i+1) / float64(count), Role: "b_roll", VisualScore: visual,
			Reason: "Visual-only source window; original video audio is muted. Visible content and narration match remain unverified until actual source frames are analyzed."})
	}
	return windows
}
